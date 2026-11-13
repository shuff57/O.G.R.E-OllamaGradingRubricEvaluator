//! Browser and AI work runs on its own thread so the window never waits.

use std::path::PathBuf;
use std::sync::mpsc as std_mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use ogre_core::{GradeWrite, GradingPage, QuestionLink, Rubric, StudentWork};
use ogre_grader::CancelFlag;
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_harness::sites::generic::{
    DiscoverOptions, DiscoverySource, ElementCheck, PickFor, Problem, ProfileAdapter, Severity,
    SiteProfile, SnapshotOptions, StudentSample, ValidationReport, capture_snapshot, discover,
    draft_profile, pick_element, validate_profile,
};
use ogre_harness::sites::{Mismatch, SiteAdapter, Sites, WriteReceipt, verify_writes};
use ogre_harness::{Error, InputDriver, PageDriver, Result};
use tokio::sync::mpsc;

use crate::agent_run::{
    self, AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary, SkillSummary,
};
use crate::audit::AuditLog;
use crate::built_in::{BuiltInPage, Requests};
use crate::grading::{self, GradeReport, PreparedCache};
use crate::history::{self, PastSession};
use crate::profiles::{ProfileStore, ProfileSummary};
use crate::rubrics::{RubricStore, SavedRubric};
use crate::settings::ProviderSettings;
use crate::tab_view::{self, Control, Shown, ViewInput, ViewLink};

/// Writes are checked against the page after this many students.
const WRITE_BATCH: usize = 5;

/// How long after a page is opened a read keeps trying before it reports
/// that there is nothing to read. MyOpenMath takes about three seconds to get
/// from its sign-in page to the page that was asked for.
const SETTLE_TIME: Duration = Duration::from_secs(8);
const SETTLE_STEP: Duration = Duration::from_millis(400);

/// Something the window asks the worker to do.
#[derive(Debug)]
pub enum Command {
    /// `inside`: without a window of its own, to be shown in OGRE's.
    StartChrome {
        inside: bool,
    },
    /// Work in the browser built into the window instead of a Chrome. Only
    /// a build of OGRE that brings one sends this.
    StartBuiltIn,
    /// Shut Chrome down. With a window of its own the teacher closes that.
    /// The built-in browser is only let go of.
    StopChrome,
    /// Open this address: in the tab on show where the page is shown inside
    /// the window, otherwise in a new tab.
    Open(String),
    ReadStudents,
    /// Take the grading tab to another question's page and read it.
    GoTo(String),
    ListModels {
        provider: ProviderSettings,
        api_key: Option<String>,
    },
    Grade(Box<GradeRequest>),
    /// Run the consistency check on these grades, without grading anyone
    /// again. The request is what a grading run of the same students would
    /// be given.
    Sweep(Box<GradeRequest>, Vec<ogre_core::StudentResult>),
    /// Have the AI write example answers at four levels for a rubric.
    WriteExamples(Box<ExamplesRequest>),
    /// Have the AI reword a rubric for a leniency, for the teacher to read
    /// and change before grading.
    RewordRubric(Box<ExamplesRequest>),
    /// Have the AI read the rubric from a screenshot of the grading tab.
    RubricFromPicture {
        provider: ProviderSettings,
        api_key: Option<String>,
    },
    /// Have the AI write a rubric for a question, worth `max_score` points.
    DraftRubric {
        question: String,
        max_score: f64,
        provider: ProviderSettings,
        api_key: Option<String>,
    },
    /// Keep a rubric for other pages, replacing the one of the same name.
    SaveRubric(Box<SavedRubric>),
    /// Keep a rubric written or changed in the library. `was` is the name
    /// it was saved under before, if it was.
    PutRubric {
        was: Option<String>,
        rubric: Box<SavedRubric>,
    },
    /// Send the saved rubrics.
    ListRubrics,
    DeleteRubric(String),
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
    /// Read the past sessions from their records.
    ListHistory,
    /// Let the AI work the open page on a task the teacher describes.
    RunAgent(Box<AgentRequest>),
    /// Say what the agent knows: its site guides and the teacher's skills.
    ListSkills,
    /// Show the teacher's skills folder in the file manager.
    OpenSkillsFolder,
    /// Write a skill of the teacher's: over the one with this id, or as a
    /// new one.
    SaveSkill {
        id: Option<String>,
        draft: Box<ogre_agent::SkillDraft>,
    },
    DeleteSkill(String),
    /// Send a saved mapping whole, to be changed by hand.
    EditProfile(String),
    /// Try a mapping on the open page and say what it finds. Changes
    /// nothing, on the page or in what is saved.
    CheckProfile(Box<SiteProfile>),
    /// Wait for the teacher to click something on the open page, and give a
    /// selector for it.
    PickElement(PickFor),
    /// Ask the AI for its next turn in the interview that writes a skill.
    /// The last of `turns` is the teacher's.
    SkillInterview {
        turns: Vec<ogre_agent::InterviewTurn>,
        provider: ProviderSettings,
        api_key: Option<String>,
    },
}

#[derive(Debug)]
pub struct GradeRequest {
    /// The rubric as read from the page, with the teacher's instructions.
    pub rubric: Rubric,
    /// The rubric text as the teacher left it, if they changed it. It then
    /// replaces the page's requirements and exemplar answer.
    pub rubric_text: Option<String>,
    pub students: Vec<StudentWork>,
    pub provider: ProviderSettings,
    pub api_key: Option<String>,
    /// On the grading engine's scale, not the setting's: 0 the Electron
    /// app's most lenient, 50 the rubric as written, 100 most strict.
    pub leniency: i16,
    /// Work each score out from the feedback's verdicts.
    pub score_from_verdicts: bool,
    /// Example answers at four levels to show the grader, if the teacher
    /// has any.
    pub examples: Option<String>,
    /// The skills the teacher has switched on or off, by id. Those that are
    /// on and are not a guide to a site are given to the grader.
    pub skill_choices: std::collections::BTreeMap<String, bool>,
    /// Stops the run after the AI call in flight.
    pub cancel: CancelFlag,
}

/// What scoring examples are written from. No student's work is part of it.
#[derive(Debug)]
pub struct ExamplesRequest {
    /// The rubric as read from the page.
    pub rubric: Rubric,
    /// The rubric text as the teacher left it, if they changed it.
    pub rubric_text: Option<String>,
    pub provider: ProviderSettings,
    pub api_key: Option<String>,
    /// On the grading engine's scale, as in [`GradeRequest::leniency`].
    pub leniency: i16,
}

/// News from the worker. Every command ends with exactly one event for which
/// [`Event::is_progress`] is false.
#[derive(Debug)]
pub enum Event {
    ChromeStarted,
    /// Chrome was shut down because the teacher asked.
    ChromeClosed,
    Opened(String),
    Read(Box<ReadReport>),
    Models(std::result::Result<Vec<String>, String>),
    GradeProgress {
        done: usize,
        total: usize,
    },
    /// One student's grade, as soon as it is there. The run goes on, and
    /// [`Event::Graded`] has the last word on every student.
    StudentGraded(crate::grading::GradedRow),
    Graded(GradeReport),
    /// What the consistency check suggests for the grades it was given, by
    /// the student's place on the page, or why it suggests nothing.
    Swept(std::result::Result<Vec<(usize, crate::grading::Suggestion)>, String>),
    /// The scoring examples the AI wrote, or why there are none.
    Examples(std::result::Result<String, String>),
    /// The rubric's requirements as the AI reworded them, or why not.
    Reworded(std::result::Result<String, String>),
    /// The rubric the AI read from a picture of the page, or why none.
    RubricRead(std::result::Result<OutsideRubric, String>),
    /// The rubric the AI wrote for the question, or why none.
    RubricDrafted(std::result::Result<OutsideRubric, String>),
    /// The teacher's saved rubrics, after a change to them.
    Rubrics(Vec<SavedRubric>),
    WriteProgress {
        done: usize,
        total: usize,
    },
    Written(WriteReport),
    Saved(Option<GradingPage>),
    Mapped(Box<MapReport>),
    /// A saved mapping, to be changed by hand.
    ProfileToEdit(Box<SiteProfile>),
    /// What a mapping found on the open page.
    ProfileChecked(Box<ProfileCheck>),
    /// A selector for what the teacher clicked on the page. `None` if they
    /// clicked nothing, or something that cannot be used.
    Picked(Option<String>),
    /// The teacher's saved mappings, after any change to them.
    Profiles(Vec<ProfileSummary>),
    /// Past grading sessions, newest first.
    History(Vec<PastSession>),
    /// What the agent knows, and the folder the teacher's own skills are in.
    Skills {
        folder: String,
        skills: Vec<SkillSummary>,
    },
    /// What the AI said next in the interview that writes a skill, or why
    /// it said nothing.
    SkillInterview(std::result::Result<String, String>),
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
                | Self::StudentGraded(_)
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
    /// The assignment's questions, where the site lists them. Empty otherwise.
    pub questions: Vec<QuestionLink>,
    /// The rubrics the teacher has saved, to use in place of the page's.
    pub saved_rubrics: Vec<SavedRubric>,
    /// What the agent knows, for the Grade screen to say which of the
    /// teacher's skills the grader will be given.
    pub skills: Vec<SkillSummary>,
    /// Grades an earlier run proposed for students who are still ungraded
    /// on the page, with when that run's page was read. For the teacher to
    /// bring back or leave.
    pub unfinished: Option<(u64, Vec<crate::grading::GradedRow>)>,
}

/// The grades an earlier run on this page proposed that the page does not
/// show: each for a student who is here now, has an answer and has no grade.
fn unfinished(
    sessions_dir: &std::path::Path,
    page: &GradingPage,
) -> Option<(u64, Vec<crate::grading::GradedRow>)> {
    let (at, kept) = history::proposed_before(sessions_dir, &page.url)?;
    let rows: Vec<_> = page
        .submissions
        .iter()
        .enumerate()
        .filter(|(_, s)| {
            !s.response.trim().is_empty() && !s.has_nonzero_score() && !s.has_feedback()
        })
        .filter_map(|(index, s)| {
            // By the site's own id where both have one; a name can be shared.
            let grade = kept
                .iter()
                .find(|grade| match (&grade.student_id, &s.student_id) {
                    (Some(then), Some(now)) => then == now,
                    _ => grade.name == s.name,
                })?;
            Some(crate::grading::GradedRow {
                index,
                outcome: Ok(crate::grading::Grade {
                    score: grade.score,
                    feedback_html: grade.feedback_html.clone(),
                    flag: grade.flag.clone(),
                    suggestion: None,
                }),
            })
        })
        .collect();
    (!rows.is_empty()).then_some((at, rows))
}

/// A rubric that did not come from the page's own rubric: read from a
/// screenshot, or written by the AI for the question.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutsideRubric {
    /// The requirements as text for the rubric editor.
    pub requirements: String,
    /// How many criteria it has.
    pub parts: usize,
    /// The title the AI found for the rubric. May be empty.
    pub name: String,
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

/// What a mapping found when it was tried on the open page.
#[derive(Debug, Clone)]
pub struct ProfileCheck {
    /// The mapping that was tried.
    pub profile: SiteProfile,
    /// True if it can be used on this page as it stands.
    pub passed: bool,
    pub students: usize,
    /// For each thing it points at, for how many students that was found.
    pub checks: Vec<ElementCheck>,
    pub problems: Vec<Problem>,
    /// The first students as it read them, to check by eye.
    pub samples: Vec<StudentSample>,
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
    view: ViewLink,
    /// What the worker asks of the built-in browser's page, for the window
    /// to carry out.
    page_requests: Requests,
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
    /// The page shown inside the window: set what it shows through this.
    pub view: ViewLink,
    /// What the teacher did on the page shown inside the window.
    pub view_input: mpsc::UnboundedReceiver<ViewInput>,
    /// The built-in browser's page, to ask things of as the worker would.
    pub built_in_page: BuiltInPage,
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
        let (view, view_input) = ViewLink::new();
        let wake: Arc<dyn Fn() + Send + Sync> = Arc::new(wake);
        let (built_in_page, page_requests) = BuiltInPage::new(wake.clone());
        let wires = Wires {
            commands: inbox,
            answers: answer_inbox,
            view: view.clone(),
            view_input,
            events: outbox,
            built_in_page,
        };
        let thread = std::thread::Builder::new()
            .name("ogre-worker".into())
            .spawn(move || run(chrome, sites, data_dir, wires, wake))
            .expect("the operating system can start a thread");
        Self {
            commands: Some(commands),
            events,
            running: Mutex::new(None),
            answers,
            view,
            page_requests: Mutex::new(page_requests),
            thread: Some(thread),
        }
    }

    /// A handle with no worker behind it. The returned [`StandIn`] plays the
    /// worker's part, for driving the window in tests.
    pub fn detached() -> (Self, StandIn) {
        let (commands, inbox) = mpsc::unbounded_channel();
        let (outbox, events) = std_mpsc::channel();
        let (answers, answer_inbox) = mpsc::unbounded_channel();
        let (view, view_input) = ViewLink::new();
        let (built_in_page, page_requests) = BuiltInPage::new(Arc::new(|| {}));
        let worker = Self {
            commands: Some(commands),
            events,
            running: Mutex::new(None),
            answers,
            view: view.clone(),
            page_requests: Mutex::new(page_requests),
            thread: None,
        };
        let stand_in = StandIn {
            events: outbox,
            commands: inbox,
            answers: answer_inbox,
            view,
            view_input,
            built_in_page,
        };
        (worker, stand_in)
    }

    pub fn send(&self, command: Command) {
        let stoppable = match &command {
            Command::Grade(request) | Command::Sweep(request, _) => {
                Some(Running::Grading(request.cancel.clone()))
            }
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

    /// The page shown inside the window, where Chrome runs without one.
    pub fn view(&self) -> &ViewLink {
        &self.view
    }

    /// What the worker has asked of the built-in browser's page.
    pub(crate) fn page_requests(&self) -> &Requests {
        &self.page_requests
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

/// The worker's ends of everything it shares with the window.
struct Wires {
    commands: mpsc::UnboundedReceiver<Command>,
    answers: mpsc::UnboundedReceiver<AgentAnswer>,
    view: ViewLink,
    view_input: mpsc::UnboundedReceiver<ViewInput>,
    events: std_mpsc::Sender<Event>,
    built_in_page: BuiltInPage,
}

fn run(
    launch: LaunchOptions,
    sites: Sites,
    data_dir: PathBuf,
    wires: Wires,
    wake: Arc<dyn Fn() + Send + Sync>,
) {
    let Wires {
        commands: mut inbox,
        answers,
        view,
        view_input,
        events: outbox,
        built_in_page,
    } = wires;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("the async runtime starts");
    runtime.block_on(async move {
        let (view_control, controls) = mpsc::unbounded_channel();
        let shown = Shown::default();
        let showing = tokio::spawn(tab_view::run(
            view,
            view_input,
            controls,
            shown.clone(),
            wake.clone(),
        ));
        let mut task = Task {
            built_in: false,
            built_in_page,
            inside: false,
            view_control,
            shown,
            launch,
            sites,
            profiles: ProfileStore::open(data_dir.clone()),
            rubrics: RubricStore::open(data_dir.clone()),
            skills_dir: data_dir.join("skills"),
            answers,
            chrome: None,
            opened: None,
            opened_at: None,
            target: None,
            prepared: PreparedCache::default(),
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
        showing.abort();
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

/// A page OGRE reads and writes: a tab of the Chrome it started, or the
/// page of the browser built into the window.
#[derive(Clone)]
enum Tab {
    Chrome(CdpPage),
    BuiltIn(BuiltInPage),
}

impl Tab {
    /// The page as something to click and type on and take a picture of.
    /// Only a Chrome tab is one so far.
    fn input(&self) -> Result<&dyn InputDriver> {
        match self {
            Self::Chrome(page) => Ok(page),
            Self::BuiltIn(_) => Err(Error::Page(
                "The built-in browser cannot do this yet. In Settings, have the page \
                 shown in Chrome\u{2019}s own window, or as a picture of Chrome, and start \
                 the browser again."
                    .into(),
            )),
        }
    }
}

#[async_trait::async_trait]
impl PageDriver for Tab {
    async fn url(&self) -> Result<String> {
        match self {
            Self::Chrome(page) => page.url().await,
            Self::BuiltIn(page) => page.url().await,
        }
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        match self {
            Self::Chrome(page) => page.navigate(url).await,
            Self::BuiltIn(page) => page.navigate(url).await,
        }
    }

    async fn eval(&self, expression: &str) -> Result<serde_json::Value> {
        match self {
            Self::Chrome(page) => page.eval(expression).await,
            Self::BuiltIn(page) => page.eval(expression).await,
        }
    }
}

/// The grading page that was last read, which later writes go to.
#[derive(Clone)]
struct Target {
    page: Tab,
    adapter: Arc<dyn SiteAdapter>,
    url: String,
}

/// The adapter chosen for a page, and what is known about saving with it.
#[derive(Clone)]
struct Chosen {
    page: Tab,
    adapter: Arc<dyn SiteAdapter>,
    manual_save: bool,
}

struct Task {
    launch: LaunchOptions,
    sites: Sites,
    profiles: ProfileStore,
    rubrics: RubricStore,
    /// The teacher's own skill files for agent mode.
    skills_dir: PathBuf,
    answers: mpsc::UnboundedReceiver<AgentAnswer>,
    chrome: Option<Chrome>,
    /// The tab OGRE opened most recently.
    opened: Option<Tab>,
    /// The teacher works in the browser built into the window, and no
    /// Chrome is running.
    built_in: bool,
    built_in_page: BuiltInPage,
    /// When the last page was opened from the app.
    opened_at: Option<Instant>,
    target: Option<Target>,
    audit: AuditLog,
    report: Reporter,
    prepared: PreparedCache,
    /// Chrome runs without a window and its page is shown in OGRE's.
    inside: bool,
    /// Tells the task that shows the page which tab to show.
    view_control: mpsc::UnboundedSender<Control>,
    /// The tab that task is showing.
    shown: Shown,
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
                    self.forget_chrome();
                    Event::ChromeStopped(message)
                } else {
                    Event::Failed(message)
                }
            }
        }
    }

    async fn run(&mut self, command: Command) -> Result<Event> {
        match command {
            Command::StartChrome { inside } => {
                if self.chrome.is_none() {
                    std::fs::create_dir_all(&self.launch.profile_dir).map_err(|e| {
                        Error::Browser(format!("cannot create profile folder: {e}"))
                    })?;
                    let launch = LaunchOptions {
                        headless: inside || self.launch.headless,
                        ..self.launch.clone()
                    };
                    let chrome = Chrome::launch(launch).await?;
                    self.inside = inside;
                    if inside {
                        // The tab Chrome starts with is the one to show.
                        let first = match chrome.pages().await?.into_iter().next() {
                            Some(first) => first,
                            None => chrome.open("about:blank").await?,
                        };
                        self.show(&Tab::Chrome(first.clone()));
                        self.opened = Some(Tab::Chrome(first));
                    }
                    self.chrome = Some(chrome);
                }
                Ok(Event::ChromeStarted)
            }
            Command::StartBuiltIn => {
                // The browser is the window's own: there is nothing to start.
                self.built_in = true;
                Ok(Event::ChromeStarted)
            }
            Command::StopChrome => {
                let chrome = self.chrome.take();
                self.built_in = false;
                self.forget_chrome();
                if let Some(chrome) = chrome {
                    chrome.close().await?;
                }
                Ok(Event::ChromeClosed)
            }
            Command::Open(address) => {
                // Shown inside the window there is one tab the teacher looks
                // at, and that is the one to send somewhere.
                let page = match self.shown_tab().or_else(|| self.built_in_tab()) {
                    Some(page) => {
                        page.navigate(&address).await?;
                        page
                    }
                    None => Tab::Chrome(self.chrome()?.open(&address).await?),
                };
                let url = page.url().await?;
                self.opened = Some(page);
                self.opened_at = Some(Instant::now());
                Ok(Event::Opened(url))
            }
            Command::ReadStudents => self.read(None).await,
            Command::GoTo(url) => {
                // Only to a page OGRE was built for: a mapped site's pages
                // are proven one by one, by a read the teacher asks for.
                let adapter = self.sites.adapter_for(&url).ok_or_else(|| {
                    Error::Page("OGRE does not know the grading page at that address.".into())
                })?;
                let page = self
                    .target
                    .as_ref()
                    .map(|target| target.page.clone())
                    .ok_or_else(|| Error::Page("Read the students first.".into()))?;
                page.navigate(&url).await?;
                self.opened_at = Some(Instant::now());
                self.read(Some(Chosen {
                    page,
                    adapter,
                    manual_save: false,
                }))
                .await
            }
            Command::ListModels { provider, api_key } => Ok(Event::Models(
                grading::list_models(&provider, api_key.as_deref()).await,
            )),
            Command::Grade(request) => {
                let total = request.students.len();
                let report = self.report.clone();
                let cancel = request.cancel.clone();
                let skills = agent_run::grading_skills(&self.skills_dir, &request.skill_choices);
                let graded = grading::grade(
                    *request,
                    &skills,
                    &cancel,
                    &mut self.prepared,
                    move |done, row| {
                        report.progress(Event::StudentGraded(row));
                        report.progress(Event::GradeProgress { done, total });
                    },
                )
                .await;
                self.audit.graded(&graded);
                Ok(Event::Graded(graded))
            }
            Command::Sweep(request, grades) => {
                let cancel = request.cancel.clone();
                let skills = agent_run::grading_skills(&self.skills_dir, &request.skill_choices);
                Ok(Event::Swept(
                    grading::sweep(*request, grades, &skills, &cancel, &mut self.prepared).await,
                ))
            }
            Command::WriteExamples(request) => Ok(Event::Examples(
                grading::write_examples(*request, &mut self.prepared).await,
            )),
            Command::RewordRubric(request) => Ok(Event::Reworded(
                grading::reword_rubric(*request, &mut self.prepared).await,
            )),
            Command::RubricFromPicture { provider, api_key } => {
                let page = match &self.target {
                    Some(target) => target.page.clone(),
                    None => self.current_tab().await?,
                };
                let png = page.input()?.screenshot_png().await?;
                Ok(Event::RubricRead(
                    grading::rubric_from_picture(&provider, api_key.as_deref(), &png).await,
                ))
            }
            Command::DraftRubric {
                question,
                max_score,
                provider,
                api_key,
            } => Ok(Event::RubricDrafted(
                grading::draft_rubric(&provider, api_key.as_deref(), &question, max_score).await,
            )),
            Command::SaveRubric(rubric) => {
                self.rubrics.save(*rubric).map_err(Error::Page)?;
                Ok(Event::Rubrics(self.rubrics.all()))
            }
            Command::PutRubric { was, rubric } => {
                self.rubrics
                    .put(was.as_deref(), *rubric)
                    .map_err(Error::Page)?;
                Ok(Event::Rubrics(self.rubrics.all()))
            }
            Command::ListRubrics => Ok(Event::Rubrics(self.rubrics.all())),
            Command::DeleteRubric(name) => {
                self.rubrics.delete(&name).map_err(Error::Page)?;
                Ok(Event::Rubrics(self.rubrics.all()))
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
            Command::EditProfile(id) => match self.profiles.get(&id) {
                Some(profile) => Ok(Event::ProfileToEdit(Box::new(profile.clone()))),
                None => Err(Error::Page("That mapping is no longer saved.".into())),
            },
            Command::CheckProfile(profile) => self.check_profile(*profile).await,
            Command::PickElement(what) => {
                let page = self.current_tab().await?;
                Ok(Event::Picked(pick_element(&page, &what).await?))
            }
            Command::ListHistory => Ok(Event::History(history::load(self.audit.dir()))),
            Command::ListSkills => Ok(self.skills()),
            Command::SaveSkill { id, draft } => {
                agent_run::save_skill(&self.skills_dir, id.as_deref(), &draft)
                    .map_err(Error::Page)?;
                Ok(self.skills())
            }
            Command::DeleteSkill(id) => {
                agent_run::delete_skill(&self.skills_dir, &id).map_err(Error::Page)?;
                Ok(self.skills())
            }
            Command::SkillInterview {
                turns,
                provider,
                api_key,
            } => Ok(Event::SkillInterview(
                agent_run::skill_interview(&provider, api_key.as_deref(), &turns).await,
            )),
            Command::OpenSkillsFolder => {
                std::fs::create_dir_all(&self.skills_dir)
                    .and_then(|()| {
                        std::process::Command::new("xdg-open")
                            .arg(&self.skills_dir)
                            .spawn()
                    })
                    .map_err(|error| {
                        Error::Page(format!(
                            "The folder could not be opened ({error}). It is {}.",
                            self.skills_dir.display()
                        ))
                    })?;
                Ok(self.skills())
            }
            Command::RunAgent(request) => {
                let page = self.current_tab().await?;
                let summary = agent_run::run(
                    page.input()?,
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

    /// Has `page` shown inside the window, where a picture of Chrome's page
    /// is shown there. The built-in browser's page is in the window already.
    fn show(&self, page: &Tab) {
        if let (true, Tab::Chrome(page)) = (self.inside, page) {
            let _ = self.view_control.send(Control::Show(page.clone()));
        }
    }

    /// The built-in browser's page, while the teacher works in that.
    fn built_in_tab(&self) -> Option<Tab> {
        self.built_in
            .then(|| Tab::BuiltIn(self.built_in_page.clone()))
    }

    /// Every page there is to look for a grading page among.
    async fn tabs(&self) -> Result<Vec<Tab>> {
        match self.built_in_tab() {
            Some(page) => Ok(vec![page]),
            None => Ok(self
                .chrome()?
                .pages()
                .await?
                .into_iter()
                .map(Tab::Chrome)
                .collect()),
        }
    }

    /// Chrome is gone: nothing that was held of it is good any more.
    fn forget_chrome(&mut self) {
        self.chrome = None;
        self.opened = None;
        self.target = None;
        let _ = self.view_control.send(Control::Hide);
    }

    fn skills(&self) -> Event {
        Event::Skills {
            folder: self.skills_dir.display().to_string(),
            skills: agent_run::list_skills(&self.skills_dir),
        }
    }

    fn chrome(&self) -> Result<&Chrome> {
        self.chrome
            .as_ref()
            .ok_or_else(|| Error::Browser("Chrome is not running".into()))
    }

    /// Reads `tab`, or the grading page that is open when none is named.
    async fn read(&mut self, tab: Option<Chosen>) -> Result<Event> {
        // A grading page that was only just opened may not be there yet: a
        // site can show its sign-in page at that address for a moment and
        // then bring up what was asked for. Keep trying for a little while
        // after an open. A page OGRE does not know at all fails at once.
        let settled = self.opened_at.map(|at| at + SETTLE_TIME);
        let (chosen, read) = loop {
            let chosen = match &tab {
                Some(chosen) => chosen.clone(),
                None => self.grading_page().await?,
            };
            match chosen.adapter.read_page(&chosen.page).await {
                Ok(read) => break (chosen, read),
                Err(error) if settled.is_none_or(|settled| Instant::now() >= settled) => {
                    return Err(error);
                }
                Err(_) => tokio::time::sleep(SETTLE_STEP).await,
            }
        };
        let Chosen {
            page,
            adapter,
            manual_save,
        } = chosen;
        let rubric = adapter
            .read_rubric(&page)
            .await
            .map_err(|error| error.to_string());
        // Moving between questions is a convenience; a list that cannot be
        // read must not stop the students from being read.
        let questions = adapter.questions(&page).await.unwrap_or_default();
        // Before this read starts a record of its own.
        let unfinished = unfinished(self.audit.dir(), &read);
        self.audit
            .begin(&read, adapter.name(), adapter.saves_on_write());
        let report = ReadReport {
            unfinished,
            rubric,
            questions,
            site: adapter.name(),
            saves_on_write: adapter.saves_on_write(),
            manual_save,
            page: read.clone(),
            saved_rubrics: self.rubrics.all(),
            skills: agent_run::list_skills(&self.skills_dir),
        };
        // The page that was read is the one the teacher will want to see.
        self.show(&page);
        self.target = Some(Target {
            page,
            adapter,
            url: read.url,
        });
        Ok(Event::Read(Box::new(report)))
    }

    /// The tab to read and the adapter for it: a site OGRE was built for, or
    /// one the teacher has mapped.
    async fn grading_page(&self) -> Result<Chosen> {
        let pages = self.tabs().await?;
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

    /// The tab shown inside the window, where the page is shown there. The
    /// tab is forgotten a moment after the switch is turned off, so the
    /// switch is asked too.
    fn shown_tab(&self) -> Option<Tab> {
        tab_view::shown_tab(&self.shown)
            .filter(|_| self.inside)
            .map(Tab::Chrome)
    }

    /// The tab the teacher means by "the page": the one shown inside the
    /// window, else the one OGRE opened last, or failing that the first tab
    /// showing a web page.
    async fn current_tab(&self) -> Result<Tab> {
        if let Some(page) = self.built_in_tab() {
            return Ok(page);
        }
        for page in [self.shown_tab(), self.opened.clone()]
            .into_iter()
            .flatten()
        {
            if page.url().await.is_ok() {
                return Ok(page);
            }
        }
        for page in self.tabs().await? {
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

    /// Tries `profile` on the open page. Where the page shows the feedback
    /// box to be of another kind than the mapping says, the mapping is put
    /// right and tried again: which kind it is is the page's to say.
    async fn check_profile(&mut self, mut profile: SiteProfile) -> Result<Event> {
        let page = self.current_tab().await?;
        let mut report = validate_profile(&page, &profile).await?;
        if let (Some(seen), Some(feedback)) =
            (report.feedback_kind_seen, profile.page.feedback.as_mut())
            && feedback.kind != seen
            && !report.passed()
        {
            feedback.kind = seen;
            report = validate_profile(&page, &profile).await?;
        }
        Ok(Event::ProfileChecked(Box::new(ProfileCheck {
            passed: report.passed(),
            students: report.students,
            checks: report.elements.clone(),
            problems: report.problems().to_vec(),
            samples: report.samples.clone(),
            profile,
        })))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn page(students: serde_json::Value) -> GradingPage {
        serde_json::from_value(serde_json::json!({
            "url": "https://www.myopenmath.com/course/gradeallq2.php?cid=1",
            "title": "Unit 4 FRQ",
            "position": null,
            "submissions": students,
        }))
        .unwrap()
    }

    fn student(
        index: usize,
        id: &str,
        name: &str,
        raw: &str,
        feedback: &str,
        response: &str,
    ) -> serde_json::Value {
        serde_json::json!({
            "index": index,
            "student_id": id,
            "name": name,
            "scores": [{ "field": format!("ud-{id}"), "label": "Score", "raw": raw, "max": 10.0 }],
            "feedback": { "field": format!("fb-{id}"), "kind": "rich_text", "text": feedback },
            "response": response,
            "prompt": null,
        })
    }

    #[test]
    fn grades_left_by_an_earlier_run_are_matched_to_who_is_still_ungraded() {
        let dir = std::env::temp_dir().join(format!("ogre-unfinished-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // That run read four students and graded all of them.
        let read = serde_json::json!({
            "event": "read",
            "url": "https://www.myopenmath.com/course/gradeallq2.php?cid=1",
            "students": [
                { "index": 0, "id": "1", "name": "Avery, Sam" },
                { "index": 1, "id": "2", "name": "Brook, Kai" },
                { "index": 2, "id": "3", "name": "Cruz, Jo" },
                { "index": 3, "id": "4", "name": "Diaz, Remy" },
            ],
        });
        let graded = serde_json::json!({
            "event": "graded",
            "results": (0..4).map(|index| serde_json::json!({
                "index": index, "score": 5.0 + f64::from(index), "feedback": "<p>ok</p>", "flag": null,
            })).collect::<Vec<_>>(),
        });
        std::fs::write(dir.join("100.jsonl"), format!("{read}\n{graded}\n")).unwrap();

        // Now: Sam's grade was saved, Kai has moved up the list and is still
        // ungraded, Jo has withdrawn their answer, and Remy has left.
        let now = page(serde_json::json!([
            student(0, "2", "Brook, Kai", "0", "", "An answer."),
            student(1, "1", "Avery, Sam", "5", "ok", "An answer."),
            student(2, "3", "Cruz, Jo", "", "", ""),
            student(3, "7", "Ellis, Pat", "", "", "A new student's answer."),
        ]));
        let (at, rows) = unfinished(&dir, &now).expect("Kai's grade is still unwritten");
        assert_eq!(at, 100);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].index, 0, "where Kai is on the page now");
        assert_eq!(rows[0].outcome.as_ref().unwrap().score, 6.0);

        // Nothing to offer once the page shows a grade for everyone it had.
        let all_graded = page(serde_json::json!([student(
            0,
            "2",
            "Brook, Kai",
            "6",
            "ok",
            "An answer."
        )]));
        assert!(unfinished(&dir, &all_graded).is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
