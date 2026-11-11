//! Browser and AI work runs on its own thread so the window never waits.

use std::path::PathBuf;
use std::sync::mpsc as std_mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use ogre_core::{GradeWrite, GradingPage, Rubric, StudentWork};
use ogre_grader::CancelFlag;
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_harness::sites::generic::{
    DiscoverOptions, DiscoverySource, ProfileAdapter, Severity, SiteProfile, SnapshotOptions,
    StudentSample, ValidationReport, capture_snapshot, discover, draft_profile, validate_profile,
};
use ogre_harness::sites::{Mismatch, SiteAdapter, Sites, WriteReceipt, verify_writes};
use ogre_harness::{Error, PageDriver, Result};
use tokio::sync::mpsc;

use crate::agent_run::{self, AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary};
use crate::audit::AuditLog;
use crate::grading::{self, GradeReport};
use crate::profiles::{ProfileStore, ProfileSummary};
use crate::settings::ProviderSettings;

/// Writes are checked against the page after this many students.
const WRITE_BATCH: usize = 5;

/// Something the window asks the worker to do.
#[derive(Debug)]
pub enum Command {
    StartChrome,
    /// Open this address in a new tab.
    Open(String),
    ReadStudents,
    ListModels {
        provider: ProviderSettings,
        api_key: Option<String>,
    },
    Grade(Box<GradeRequest>),
    /// Put these grades into the page that was read. Saves nothing.
    Write(Vec<GradeWrite>),
    /// Have the site store what was written.
    Save,
    /// Work out where the students, scores and feedback are on the open page
    /// of a site OGRE does not know. With `ai`, a model is asked when the
    /// page's structure alone is not conclusive.
    MapPage {
        ai: Option<(ProviderSettings, Option<String>)>,
    },
    /// Keep a mapping for next time.
    SaveProfile(Box<SiteProfile>),
    DeleteProfile(String),
    ListProfiles,
    /// Let the AI work the open page on a task the teacher describes.
    RunAgent(Box<AgentRequest>),
}

#[derive(Debug)]
pub struct GradeRequest {
    pub rubric: Rubric,
    pub students: Vec<StudentWork>,
    pub provider: ProviderSettings,
    pub api_key: Option<String>,
    /// 0 most lenient, 50 the rubric as written, 100 most strict.
    pub leniency: u8,
    /// Stops the run after the AI call in flight.
    pub cancel: CancelFlag,
}

/// News from the worker. Every command ends with exactly one event for which
/// [`Event::is_progress`] is false.
#[derive(Debug)]
pub enum Event {
    ChromeStarted,
    Opened(String),
    Read(ReadReport),
    Models(std::result::Result<Vec<String>, String>),
    GradeProgress {
        done: usize,
        total: usize,
    },
    Graded(GradeReport),
    WriteProgress {
        done: usize,
        total: usize,
    },
    Written(WriteReport),
    Saved(Option<GradingPage>),
    Mapped(Box<MapReport>),
    /// The teacher's saved mappings, after any change to them.
    Profiles(Vec<ProfileSummary>),
    AgentLine(AgentLine),
    /// The agent wants to act and waits for [`Worker::answer`].
    AgentAsks(AgentQuestion),
    AgentDone(AgentSummary),
    /// The command failed; Chrome is still running.
    Failed(String),
    /// Chrome is gone, for example because its window was closed.
    ChromeStopped(String),
}

impl Event {
    pub fn is_progress(&self) -> bool {
        matches!(
            self,
            Self::GradeProgress { .. }
                | Self::WriteProgress { .. }
                | Self::AgentLine(_)
                | Self::AgentAsks(_)
        )
    }
}

#[derive(Debug)]
pub struct ReadReport {
    pub page: GradingPage,
    /// The rubric found on the page, or why none could be read.
    pub rubric: std::result::Result<Rubric, String>,
    /// The site's name, such as "MyOpenMath".
    pub site: &'static str,
    /// True if writing a grade stores it on the site right away.
    pub saves_on_write: bool,
    /// True if OGRE cannot tell whether this site saved, so the teacher has
    /// to save in the browser themselves.
    pub manual_save: bool,
}

/// A mapping that was just worked out and proven on the open page.
#[derive(Debug)]
pub struct MapReport {
    pub profile: SiteProfile,
    /// How it was found, in words for the teacher.
    pub how: String,
    pub students: usize,
    /// What the mapping read for the first students, to check by eye.
    pub samples: Vec<StudentSample>,
    /// Limits of this mapping the teacher should know about.
    pub warnings: Vec<String>,
}

#[derive(Debug, Default)]
pub struct WriteReport {
    /// Page positions of the students whose grades are now on the page.
    pub written: Vec<usize>,
    /// Students the page refused, with the reason.
    pub failed: Vec<(usize, String)>,
    /// Writes that a fresh read of the page did not show. Any entry here
    /// stopped the run early.
    pub mismatches: Vec<Mismatch>,
    /// The page as it reads after the writes.
    pub page: Option<GradingPage>,
}

/// The window's handle to the worker thread.
pub struct Worker {
    commands: Option<mpsc::UnboundedSender<Command>>,
    events: std_mpsc::Receiver<Event>,
    /// How to stop the long-running command in progress, if there is one.
    running: Mutex<Option<Running>>,
    answers: mpsc::UnboundedSender<AgentAnswer>,
    thread: Option<JoinHandle<()>>,
}

enum Running {
    Grading(CancelFlag),
    Agent(ogre_agent::CancelFlag),
}

/// The far end of a [`Worker::detached`] handle, for tests.
pub struct StandIn {
    pub events: std_mpsc::Sender<Event>,
    pub commands: mpsc::UnboundedReceiver<Command>,
    /// The teacher's answers to the agent's questions.
    pub answers: mpsc::UnboundedReceiver<AgentAnswer>,
}

impl Worker {
    /// Starts the worker thread. Chrome itself is only launched, with
    /// `chrome`, when [`Command::StartChrome`] arrives. Session records go
    /// under `data_dir`. `wake` is called after each event is queued so the
    /// window can redraw.
    pub fn spawn(
        chrome: LaunchOptions,
        sites: Sites,
        data_dir: PathBuf,
        wake: impl Fn() + Send + Sync + 'static,
    ) -> Self {
        let (commands, inbox) = mpsc::unbounded_channel();
        let (outbox, events) = std_mpsc::channel();
        let (answers, answer_inbox) = mpsc::unbounded_channel();
        let thread = std::thread::Builder::new()
            .name("ogre-worker".into())
            .spawn(move || run(chrome, sites, data_dir, inbox, answer_inbox, outbox, wake))
            .expect("the operating system can start a thread");
        Self {
            commands: Some(commands),
            events,
            running: Mutex::new(None),
            answers,
            thread: Some(thread),
        }
    }

    /// A handle with no worker behind it. The returned [`StandIn`] plays the
    /// worker's part, for driving the window in tests.
    pub fn detached() -> (Self, StandIn) {
        let (commands, inbox) = mpsc::unbounded_channel();
        let (outbox, events) = std_mpsc::channel();
        let (answers, answer_inbox) = mpsc::unbounded_channel();
        let worker = Self {
            commands: Some(commands),
            events,
            running: Mutex::new(None),
            answers,
            thread: None,
        };
        let stand_in = StandIn {
            events: outbox,
            commands: inbox,
            answers: answer_inbox,
        };
        (worker, stand_in)
    }

    pub fn send(&self, command: Command) {
        let stoppable = match &command {
            Command::Grade(request) => Some(Running::Grading(request.cancel.clone())),
            Command::RunAgent(request) => Some(Running::Agent(request.cancel.clone())),
            _ => None,
        };
        if let Some(stoppable) = stoppable
            && let Ok(mut running) = self.running.lock()
        {
            *running = Some(stoppable);
        }
        if let Some(commands) = &self.commands {
            // The thread only stops when this handle is dropped.
            let _ = commands.send(command);
        }
    }

    /// Asks a grading or agent run to stop after the AI call in flight.
    pub fn cancel(&self) {
        let Ok(running) = self.running.lock() else {
            return;
        };
        match running.as_ref() {
            Some(Running::Grading(flag)) => flag.cancel(),
            Some(Running::Agent(flag)) => {
                flag.cancel();
                // The agent may be waiting on a question; stopping answers it.
                self.answer(AgentAnswer::Stop);
            }
            None => {}
        }
    }

    /// Answers the question the agent last asked.
    pub fn answer(&self, answer: AgentAnswer) {
        let _ = self.answers.send(answer);
    }

    /// Events that have arrived since the last call.
    pub fn poll(&self) -> impl Iterator<Item = Event> + '_ {
        self.events.try_iter()
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        // Closing the channel ends the thread's loop. Wait for it, so Chrome
        // is shut down before the process exits instead of being orphaned.
        self.cancel();
        self.commands = None;
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run(
    launch: LaunchOptions,
    sites: Sites,
    data_dir: PathBuf,
    mut inbox: mpsc::UnboundedReceiver<Command>,
    answers: mpsc::UnboundedReceiver<AgentAnswer>,
    outbox: std_mpsc::Sender<Event>,
    wake: impl Fn() + Send + Sync + 'static,
) {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("the async runtime starts");
    let wake = Arc::new(wake);
    runtime.block_on(async move {
        let mut task = Task {
            launch,
            sites,
            profiles: ProfileStore::open(data_dir.clone()),
            skills_dir: data_dir.join("skills"),
            answers,
            chrome: None,
            opened: None,
            target: None,
            audit: AuditLog::new(data_dir),
            report: Reporter {
                outbox: outbox.clone(),
                wake: wake.clone(),
            },
        };
        while let Some(command) = inbox.recv().await {
            let event = task.handle(command).await;
            if outbox.send(event).is_err() {
                break;
            }
            wake();
        }
        if let Some(chrome) = task.chrome.take() {
            let _ = chrome.close().await;
        }
    });
}

/// Sends progress while a command is still running.
#[derive(Clone)]
pub(crate) struct Reporter {
    outbox: std_mpsc::Sender<Event>,
    wake: Arc<dyn Fn() + Send + Sync>,
}

impl Reporter {
    pub(crate) fn progress(&self, event: Event) {
        let _ = self.outbox.send(event);
        (self.wake)();
    }
}

/// The grading page that was last read, which later writes go to.
#[derive(Clone)]
struct Target {
    page: CdpPage,
    adapter: Arc<dyn SiteAdapter>,
    url: String,
}

/// The adapter chosen for a page, and what is known about saving with it.
struct Chosen {
    page: CdpPage,
    adapter: Arc<dyn SiteAdapter>,
    manual_save: bool,
}

struct Task {
    launch: LaunchOptions,
    sites: Sites,
    profiles: ProfileStore,
    /// The teacher's own skill files for agent mode.
    skills_dir: PathBuf,
    answers: mpsc::UnboundedReceiver<AgentAnswer>,
    chrome: Option<Chrome>,
    /// The tab OGRE opened most recently.
    opened: Option<CdpPage>,
    target: Option<Target>,
    audit: AuditLog,
    report: Reporter,
}

impl Task {
    async fn handle(&mut self, command: Command) -> Event {
        match self.run(command).await {
            Ok(event) => event,
            Err(error) => {
                let message = error.to_string();
                let lost = match (&error, &self.chrome) {
                    (Error::Browser(_), Some(chrome)) => !chrome.is_alive().await,
                    _ => false,
                };
                if lost {
                    self.chrome = None;
                    self.opened = None;
                    self.target = None;
                    Event::ChromeStopped(message)
                } else {
                    Event::Failed(message)
                }
            }
        }
    }

    async fn run(&mut self, command: Command) -> Result<Event> {
        match command {
            Command::StartChrome => {
                if self.chrome.is_none() {
                    std::fs::create_dir_all(&self.launch.profile_dir).map_err(|e| {
                        Error::Browser(format!("cannot create profile folder: {e}"))
                    })?;
                    self.chrome = Some(Chrome::launch(self.launch.clone()).await?);
                }
                Ok(Event::ChromeStarted)
            }
            Command::Open(address) => {
                let page = self.chrome()?.open(&address).await?;
                let url = page.url().await?;
                self.opened = Some(page);
                Ok(Event::Opened(url))
            }
            Command::ReadStudents => self.read().await,
            Command::ListModels { provider, api_key } => Ok(Event::Models(
                grading::list_models(&provider, api_key.as_deref()).await,
            )),
            Command::Grade(request) => {
                let total = request.students.len();
                let report = self.report.clone();
                let cancel = request.cancel.clone();
                let graded = grading::grade(*request, &cancel, move |done| {
                    report.progress(Event::GradeProgress { done, total });
                })
                .await;
                self.audit.graded(&graded);
                Ok(Event::Graded(graded))
            }
            Command::Write(writes) => self.write(writes).await,
            Command::Save => {
                let target = self.target().await?;
                target.adapter.save(&target.page).await?;
                self.audit.saved();
                // Show the teacher what the site now holds.
                let page = target.adapter.read_page(&target.page).await.ok();
                Ok(Event::Saved(page))
            }
            Command::MapPage { ai } => self.map_page(ai).await,
            Command::SaveProfile(profile) => {
                self.profiles.save(*profile).map_err(Error::Page)?;
                Ok(Event::Profiles(self.profiles.summaries()))
            }
            Command::DeleteProfile(id) => {
                self.profiles.delete(&id).map_err(Error::Page)?;
                Ok(Event::Profiles(self.profiles.summaries()))
            }
            Command::ListProfiles => Ok(Event::Profiles(self.profiles.summaries())),
            Command::RunAgent(request) => {
                let page = self.current_tab().await?;
                let summary = agent_run::run(
                    &page,
                    *request,
                    &self.skills_dir,
                    self.report.clone(),
                    &mut self.answers,
                )
                .await;
                // The agent may have changed the page a session was read from.
                self.target = None;
                Ok(Event::AgentDone(summary))
            }
        }
    }

    fn chrome(&self) -> Result<&Chrome> {
        self.chrome
            .as_ref()
            .ok_or_else(|| Error::Browser("Chrome is not running".into()))
    }

    async fn read(&mut self) -> Result<Event> {
        let Chosen {
            page,
            adapter,
            manual_save,
        } = self.grading_page().await?;
        let read = adapter.read_page(&page).await?;
        let rubric = adapter
            .read_rubric(&page)
            .await
            .map_err(|error| error.to_string());
        self.audit.begin(&read);
        let report = ReadReport {
            rubric,
            site: adapter.name(),
            saves_on_write: adapter.saves_on_write(),
            manual_save,
            page: read.clone(),
        };
        self.target = Some(Target {
            page,
            adapter,
            url: read.url,
        });
        Ok(Event::Read(report))
    }

    /// The tab to read and the adapter for it: a site OGRE was built for, or
    /// one the teacher has mapped.
    async fn grading_page(&self) -> Result<Chosen> {
        let pages = self.chrome()?.pages().await?;
        for page in &pages {
            if let Some(adapter) = self.sites.adapter_for(&page.url().await?) {
                return Ok(Chosen {
                    page: page.clone(),
                    adapter,
                    manual_save: false,
                });
            }
        }
        for page in &pages {
            let url = page.url().await?;
            let Some(profile) = self.profiles.all().iter().find(|p| p.url.matches(&url)) else {
                continue;
            };
            // A saved mapping is proven on the page again before every use:
            // a site that has changed must stop the run, not be guessed at.
            let report = validate_profile(page, profile).await?;
            let validated = report.into_validated().map_err(|report| {
                Error::Page(format!(
                    "The saved mapping \"{}\" no longer fits this page: {} Map the site again in Sites.",
                    profile.name,
                    report.error_summary()
                ))
            })?;
            let manual_save = !can_confirm_save(profile);
            return Ok(Chosen {
                page: page.clone(),
                adapter: Arc::new(ProfileAdapter::new(validated)),
                manual_save,
            });
        }
        Err(Error::Page(
            "No grading page OGRE knows is open. Open a grading page in the OGRE Chrome \
             window, or map a new site in Sites."
                .into(),
        ))
    }

    /// The tab a new mapping is worked out on: the one OGRE opened last, or
    /// failing that the first tab showing a web page.
    async fn current_tab(&self) -> Result<CdpPage> {
        if let Some(page) = &self.opened
            && page.url().await.is_ok()
        {
            return Ok(page.clone());
        }
        for page in self.chrome()?.pages().await? {
            let url = page.url().await?;
            if url.starts_with("http") || url.starts_with("file:") {
                return Ok(page);
            }
        }
        Err(Error::Page(
            "No page is open. Open one of the site's grading pages in the OGRE Chrome window first."
                .into(),
        ))
    }

    async fn map_page(&mut self, ai: Option<(ProviderSettings, Option<String>)>) -> Result<Event> {
        let page = self.current_tab().await?;
        let url = page.url().await?;
        if let Some(adapter) = self.sites.adapter_for(&url) {
            return Err(Error::Page(format!(
                "OGRE already knows this page: it is {}. Nothing to map.",
                adapter.name()
            )));
        }

        let (report, how, notes) = match ai {
            None => {
                let snapshot = capture_snapshot(&page, &SnapshotOptions::default()).await?;
                let draft = draft_profile(&snapshot).ok_or_else(|| {
                    Error::Page(
                        "OGRE could not work this page out from its structure alone. \
                         Try again with AI."
                            .into(),
                    )
                })?;
                let report = validate_profile(&page, &draft).await?;
                if !report.passed() {
                    return Err(Error::Page(format!(
                        "OGRE's reading of this page did not hold up: {} Try again with AI.",
                        report.error_summary()
                    )));
                }
                (
                    report,
                    "Worked out from the page's structure, without AI.".to_owned(),
                    Vec::new(),
                )
            }
            Some((provider, api_key)) => {
                let provider =
                    grading::provider(&provider, api_key.as_deref()).map_err(Error::Page)?;
                let found = discover(&page, &provider, &DiscoverOptions::default())
                    .await
                    .map_err(|error| Error::Page(error.to_string()))?;
                let how = match found.source {
                    DiscoverySource::Heuristics { .. } => {
                        "Worked out from the page's structure; the AI was not needed.".to_owned()
                    }
                    DiscoverySource::Ai { attempts, .. } => format!(
                        "Worked out by the AI in {attempts} {}, then checked on the page.",
                        if attempts == 1 { "try" } else { "tries" }
                    ),
                };
                (found.report, how, found.notes)
            }
        };
        Ok(Event::Mapped(Box::new(map_report(report, how, notes))))
    }

    /// The page that was read, provided it is still showing the same address.
    async fn target(&self) -> Result<Target> {
        let target = self
            .target
            .as_ref()
            .ok_or_else(|| Error::Page("Read the students first.".into()))?;
        if target.page.url().await? != target.url {
            return Err(Error::Page(
                "The grading page has changed since it was read. Read the students again.".into(),
            ));
        }
        Ok(target.clone())
    }

    async fn write(&mut self, writes: Vec<GradeWrite>) -> Result<Event> {
        let total = writes.len();
        let mut report = WriteReport::default();
        let mut done = 0;
        {
            let target = self.target().await?;
            'batches: for batch in writes.chunks(WRITE_BATCH) {
                let mut written: Vec<(GradeWrite, WriteReceipt)> = Vec::new();
                for write in batch {
                    match target.adapter.write_grade(&target.page, write).await {
                        Ok(receipt) => written.push((write.clone(), receipt)),
                        // The page refused this student; the others can go on.
                        Err(Error::Page(reason)) => report.failed.push((write.index, reason)),
                        Err(other) => return Err(other),
                    }
                    done += 1;
                    self.report.progress(Event::WriteProgress { done, total });
                }
                let mismatches =
                    verify_writes(target.adapter.as_ref(), &target.page, &written).await?;
                self.audit.written(&written, &mismatches);
                report.written.extend(written.iter().map(|(w, _)| w.index));
                if !mismatches.is_empty() {
                    report.mismatches = mismatches;
                    break 'batches;
                }
            }
            report.page = target.adapter.read_page(&target.page).await.ok();
        }
        Ok(Event::Written(report))
    }
}

/// Whether a mapping says how to recognize that the site saved.
fn can_confirm_save(profile: &SiteProfile) -> bool {
    profile
        .page
        .save
        .as_ref()
        .is_some_and(|save| save.success.is_some())
}

fn map_report(report: ValidationReport, how: String, notes: Vec<String>) -> MapReport {
    let mut warnings: Vec<String> = report
        .problems()
        .iter()
        .filter(|problem| problem.severity == Severity::Warning)
        .map(|problem| problem.message.clone())
        .chain(notes)
        .collect();
    if !can_confirm_save(report.profile()) {
        warnings.push(
            "OGRE will fill in grades on this site but will not click Save: \
             it has no way to tell that a save worked. You save in the browser."
                .into(),
        );
    }
    MapReport {
        profile: report.profile().clone(),
        how,
        students: report.students,
        samples: report.samples.clone(),
        warnings,
    }
}
