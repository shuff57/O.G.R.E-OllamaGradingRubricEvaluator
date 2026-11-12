use eframe::egui::{self, Align, Frame, Layout, Margin, RichText};
use egui_commonmark::{CommonMarkCache, CommonMarkViewer};
use egui_extras::{Column, TableBuilder};
use ogre_core::format_score;
use ogre_grader::CancelFlag;

use crate::agent_run::{
    AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary, LineKind,
};
use crate::grading::Suggestion;
use crate::history::{self, PastProposal, PastSession, SessionEnd};
use crate::keys::KeyStore;
use crate::kit;
use crate::profiles::ProfileSummary;
use crate::session::{Note, RubricOutline, Session, Status, count, score_text};
use crate::settings::{
    AS_WRITTEN_LENIENCY, DEFAULT_LENIENCY, STORAGE_KEY, Service, Settings, engine_leniency,
    old_app_provider,
};
use crate::theme::{self, icon, pal, ty};
use crate::worker::{Command, Event, ExamplesRequest, GradeRequest, MapReport, Worker};

pub struct OgreApp {
    worker: Worker,
    keys: Box<dyn KeyStore>,
    settings: Settings,
    /// The Electron app's settings file, where there is one to copy from.
    old_app: Option<std::path::PathBuf>,
    screen: Screen,
    /// The step whose button is the primary one this frame.
    next: Step,
    /// The API key for the chosen service, as typed or loaded.
    api_key: String,
    /// Model names the service reported.
    models: Vec<String>,
    settings_note: Option<String>,
    chrome_running: bool,
    busy: Option<Busy>,
    address: String,
    session: Option<Session>,
    /// Another question the teacher asked to go to while work on this one
    /// would be lost, waiting for them to confirm.
    leaving: Option<String>,
    selected: Option<usize>,
    error: Option<String>,
    /// Good news from the last step, such as a confirmed save.
    notice: Option<String>,
    markdown: CommonMarkCache,
    /// The teacher's saved site mappings.
    profiles: Vec<ProfileSummary>,
    /// A mapping that was just worked out and is waiting to be saved.
    mapping: Option<MapReport>,
    /// Past sessions, as last read from their records.
    history: Vec<PastSession>,
    /// The past session whose details are shown, by when it was read.
    history_open: Option<u64>,
    agent: AgentView,
}

/// The Agent screen's state.
#[derive(Default)]
struct AgentView {
    task: String,
    /// Let it act without asking, except where OGRE always asks.
    auto: bool,
    screenshots: bool,
    running: bool,
    log: Vec<AgentLine>,
    question: Option<AgentQuestion>,
    /// What to tell the AI when declining its action.
    note: String,
    result: Option<AgentSummary>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Grade,
    Agent,
    Sites,
    History,
    Settings,
}

/// What the worker is doing right now.
struct Busy {
    label: &'static str,
    /// Students done and in total, for work that reports progress.
    progress: Option<(usize, usize)>,
    can_stop: bool,
    /// When the window first drew this work, in the window's own seconds.
    started: Option<f64>,
}

/// How much of the window's height an open rubric may take before it scrolls.
const RUBRIC_SHARE_OF_WINDOW: f32 = 0.42;

/// Work shorter than this shows no clock.
const CLOCK_AFTER_SECONDS: f64 = 5.0;

/// "1:05" for 65 seconds.
fn clock(seconds: f64) -> String {
    let seconds = seconds.max(0.0) as u64;
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

/// Something the teacher asked for this frame. Collected while drawing and
/// carried out afterwards, so drawing code never needs the whole app.
enum Action {
    StartChrome,
    Open(String),
    Read,
    /// Take the grading tab to another question of the assignment.
    GoTo(String),
    /// The same, but work would be lost: ask first.
    AskToLeave(String),
    Stay,
    Grade,
    StopGrading,
    /// Have the AI write scoring examples for the rubric.
    WriteExamples,
    Write,
    Save,
    ListModels,
    CopyFromOldApp,
    ServiceChanged,
    KeyChanged,
    Show(Screen),
    ToggleDark,
    MapPage {
        with_ai: bool,
    },
    SaveMapping,
    DiscardMapping,
    DeleteProfile(String),
    StartAgent,
    AnswerAgent(AgentAnswer),
    SetLeniency(u8),
}

/// The one step the teacher would take next. Its button is the primary one.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Step {
    StartChrome,
    Read,
    Grade,
    Write,
    Save,
}

const CONTENT_MARGIN: Margin = Margin {
    left: 6,
    right: 16,
    top: 10,
    bottom: 10,
};

impl OgreApp {
    pub fn new(
        ctx: &egui::Context,
        worker: Worker,
        settings: Settings,
        keys: Box<dyn KeyStore>,
    ) -> Self {
        theme::setup(ctx, settings.dark);
        let api_key = keys.load(settings.provider.service).unwrap_or_default();
        Self {
            old_app: None,
            worker,
            keys,
            settings,
            screen: Screen::Grade,
            next: Step::StartChrome,
            api_key,
            models: Vec::new(),
            settings_note: None,
            chrome_running: false,
            busy: None,
            address: String::new(),
            session: None,
            leaving: None,
            selected: None,
            error: None,
            notice: None,
            markdown: CommonMarkCache::default(),
            profiles: Vec::new(),
            history: Vec::new(),
            history_open: None,
            mapping: None,
            agent: AgentView::default(),
        }
    }

    /// Offers, in Settings, to copy the AI service from the Electron app's
    /// settings at `file`.
    pub fn with_old_app_settings(mut self, file: Option<std::path::PathBuf>) -> Self {
        self.old_app = file;
        self
    }

    /// Takes the service, model and key the Electron app was set up with.
    fn copy_from_old_app(&mut self) {
        let found = self
            .old_app
            .as_ref()
            .and_then(|file| std::fs::read_to_string(file).ok())
            .and_then(|text| old_app_provider(&text));
        let Some(found) = found else {
            self.settings_note =
                Some("The old OGRE app’s settings could not be read. Enter them here.".into());
            return;
        };
        self.models.clear();
        self.settings.provider = found.provider;
        self.api_key = found.api_key.unwrap_or_default();
        let stored = self
            .keys
            .store(self.settings.provider.service, self.api_key.trim());
        self.settings_note = stored.err().map(|problem| {
            format!("The key will be used now but could not be remembered: {problem}")
        });
        self.error = None;
        self.notice = Some(format!(
            "Copied from the old OGRE app: {}, model {}.",
            self.settings.provider.service.label(),
            self.settings.provider.model
        ));
    }

    fn send(&mut self, command: Command, label: &'static str) {
        self.error = None;
        self.notice = None;
        self.busy = Some(Busy {
            label,
            progress: None,
            can_stop: matches!(command, Command::Grade(_) | Command::RunAgent(_)),
            started: None,
        });
        self.worker.send(command);
    }

    fn take_events(&mut self) {
        let events: Vec<Event> = self.worker.poll().collect();
        for event in events {
            if !event.is_progress() {
                self.busy = None;
            }
            match event {
                Event::ChromeStarted => self.chrome_running = true,
                Event::Opened(url) => self.address = url,
                Event::Read(read) => {
                    self.selected = None;
                    self.leaving = None;
                    self.session = Some(Session::new(read));
                }
                Event::Models(Ok(models)) => {
                    self.settings_note = models
                        .is_empty()
                        .then(|| "The service lists no models.".into());
                    self.models = models;
                }
                Event::Models(Err(problem)) => {
                    self.models.clear();
                    self.settings_note = Some(problem);
                }
                Event::GradeProgress { done, total } | Event::WriteProgress { done, total } => {
                    if let Some(busy) = &mut self.busy {
                        busy.progress = Some((done, total));
                    }
                }
                Event::Graded(report) => {
                    if let Some(session) = &mut self.session {
                        session.apply_grades(report);
                    }
                }
                Event::Examples(Ok(examples)) => {
                    if let Some(session) = &mut self.session {
                        session.examples_arrived(examples);
                    }
                }
                Event::Examples(Err(problem)) => self.error = Some(problem),
                Event::Written(report) => {
                    if let Some(session) = &mut self.session {
                        let written = report.written.len();
                        self.error = session.apply_write(report);
                        if self.error.is_none() {
                            self.notice = Some(if session.saves_on_write {
                                format!("{} stored on {}.", count(written, "grade"), session.site)
                            } else {
                                format!(
                                    "{} filled in on the page and checked. Nothing is saved until you save on {}.",
                                    count(written, "grade"),
                                    session.site
                                )
                            });
                        }
                    }
                }
                Event::Saved(page) => {
                    if let Some(session) = &mut self.session {
                        session.apply_saved(page);
                        self.notice = Some(format!("{} confirmed the save.", session.site));
                    }
                }
                Event::Mapped(report) => self.mapping = Some(*report),
                Event::AgentLine(line) => self.agent.log.push(line),
                Event::AgentAsks(question) => {
                    self.agent.note.clear();
                    self.agent.question = Some(question);
                }
                Event::AgentDone(summary) => {
                    self.agent.running = false;
                    self.agent.question = None;
                    self.agent.result = Some(summary);
                    // Whatever was read before may no longer match the page.
                    self.session = None;
                    self.selected = None;
                }
                Event::Profiles(profiles) => self.profiles = profiles,
                Event::History(sessions) => self.history = sessions,
                Event::Failed(message) => {
                    self.agent.running = false;
                    self.agent.question = None;
                    self.error = Some(message);
                }
                Event::ChromeStopped(message) => {
                    self.chrome_running = false;
                    self.error = Some(format!("Chrome is no longer running ({message})."));
                }
            }
        }
    }

    fn carry_out(&mut self, ctx: &egui::Context, action: Action) {
        match action {
            Action::StartChrome => self.send(Command::StartChrome, "Starting Chrome…"),
            Action::Open(address) => self.send(Command::Open(address), "Opening the page…"),
            Action::Read => self.send(Command::ReadStudents, "Reading the page…"),
            Action::GoTo(address) => {
                self.leaving = None;
                self.send(Command::GoTo(address), "Opening the question…");
            }
            Action::AskToLeave(address) => self.leaving = Some(address),
            Action::Stay => self.leaving = None,
            Action::Grade => {
                let Some(session) = &self.session else { return };
                let request = GradeRequest {
                    rubric: session.rubric_for_grading(),
                    rubric_text: session.edited_rubric_text(),
                    students: session.to_grade(),
                    provider: self.settings.provider.clone(),
                    api_key: self.key(),
                    leniency: engine_leniency(self.settings.leniency),
                    score_from_verdicts: self.settings.score_from_verdicts,
                    examples: session.examples_for_grading(),
                    cancel: CancelFlag::new(),
                };
                self.send(Command::Grade(Box::new(request)), "Grading…");
            }
            Action::WriteExamples => {
                let leniency = self.settings.leniency;
                let Some(session) = &mut self.session else {
                    return;
                };
                session.examples_asked_for(leniency);
                let request = ExamplesRequest {
                    rubric: session.rubric_for_grading(),
                    rubric_text: session.edited_rubric_text(),
                    provider: self.settings.provider.clone(),
                    api_key: self.key(),
                    leniency: engine_leniency(leniency),
                };
                self.send(
                    Command::WriteExamples(Box::new(request)),
                    "Writing scoring examples…",
                );
            }
            Action::StopGrading => self.worker.cancel(),
            Action::Write => {
                let Some(session) = &self.session else { return };
                let writes = session.to_write();
                self.send(Command::Write(writes), "Writing grades…");
            }
            Action::Save => self.send(Command::Save, "Saving on the site…"),
            Action::ListModels => {
                self.settings_note = None;
                let command = Command::ListModels {
                    provider: self.settings.provider.clone(),
                    api_key: self.key(),
                };
                self.send(command, "Asking for the model list…");
            }
            Action::CopyFromOldApp => self.copy_from_old_app(),
            Action::ServiceChanged => {
                self.models.clear();
                self.settings_note = None;
                self.settings.provider.base_url.clear();
                self.settings.provider.model.clear();
                self.api_key = self
                    .keys
                    .load(self.settings.provider.service)
                    .unwrap_or_default();
            }
            Action::KeyChanged => {
                let stored = self
                    .keys
                    .store(self.settings.provider.service, self.api_key.trim());
                self.settings_note = stored.err().map(|problem| {
                    format!("The key will be used now but could not be remembered: {problem}")
                });
            }
            Action::Show(screen) => {
                self.screen = screen;
                if screen == Screen::Sites && self.busy.is_none() {
                    self.send(Command::ListProfiles, "Loading your sites…");
                }
                if screen == Screen::History && self.busy.is_none() {
                    self.send(Command::ListHistory, "Loading your history…");
                }
            }
            Action::MapPage { with_ai } => {
                self.mapping = None;
                let ai = with_ai.then(|| (self.settings.provider.clone(), self.key()));
                self.send(Command::MapPage { ai }, "Working out the page…");
            }
            Action::SaveMapping => {
                if let Some(report) = self.mapping.take() {
                    let name = report.profile.name.clone();
                    self.send(
                        Command::SaveProfile(Box::new(report.profile)),
                        "Saving the mapping…",
                    );
                    self.notice = Some(format!(
                        "\"{name}\" is saved. Open one of its grading pages and read the students on the Grade screen."
                    ));
                }
            }
            Action::DiscardMapping => self.mapping = None,
            Action::SetLeniency(leniency) => self.settings.leniency = leniency,
            Action::StartAgent => {
                let request = AgentRequest {
                    task: self.agent.task.trim().to_owned(),
                    auto: self.agent.auto,
                    screenshots: self.agent.screenshots,
                    provider: self.settings.provider.clone(),
                    api_key: self.key(),
                    cancel: ogre_agent::CancelFlag::new(),
                };
                self.agent.log.clear();
                self.agent.question = None;
                self.agent.result = None;
                self.agent.running = true;
                self.send(
                    Command::RunAgent(Box::new(request)),
                    "The agent is working…",
                );
            }
            Action::AnswerAgent(answer) => {
                self.agent.question = None;
                self.worker.answer(answer);
            }
            Action::DeleteProfile(id) => {
                self.send(Command::DeleteProfile(id), "Removing the mapping…");
            }
            Action::ToggleDark => {
                self.settings.dark = !self.settings.dark;
                theme::set_dark(ctx, self.settings.dark);
            }
        }
    }

    fn key(&self) -> Option<String> {
        let key = self.api_key.trim();
        (!key.is_empty()).then(|| key.to_owned())
    }

    fn next_step(&self) -> Step {
        if !self.chrome_running {
            return Step::StartChrome;
        }
        match &self.session {
            None => Step::Read,
            Some(session) if session.unsaved && !session.blocked && !session.manual_save => {
                Step::Save
            }
            Some(session) if session.unsaved => Step::Read,
            Some(session) if !session.blocked && session.write_count() > 0 => Step::Write,
            Some(session) if session.grade_count() > 0 => Step::Grade,
            Some(_) => Step::Read,
        }
    }

    /// A button for `step`: the primary one if it is the next step to take.
    fn step_button(&self, ui: &mut egui::Ui, step: Step, label: &str, enabled: bool) -> bool {
        if self.next == step {
            kit::primary(ui, label, enabled).clicked()
        } else {
            kit::ghost(ui, label, enabled).clicked()
        }
    }

    fn dock(&self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let rail = ui.max_rect();
        ui.painter().rect_filled(rail, 18, pal().rail);
        if theme::is_dark() {
            ui.painter().rect_stroke(
                rail,
                18,
                egui::Stroke::new(1.0, pal().border),
                egui::StrokeKind::Inside,
            );
        }
        ui.vertical_centered(|ui| {
            ui.spacing_mut().item_spacing.y = 4.0;
            ui.add_space(16.0);
            ui.label(
                RichText::new("OGRE")
                    .family(theme::serif_family())
                    .size(18.0)
                    .color(theme::DOCK_TEXT),
            );
            ui.add_space(14.0);
            for (screen, glyph, label) in [
                (Screen::Grade, icon::GRADE, "Grade"),
                (Screen::Agent, icon::AGENT, "Agent"),
                (Screen::Sites, icon::SITES, "Sites"),
                (Screen::History, icon::HISTORY, "History"),
                (Screen::Settings, icon::SETTINGS, "Settings"),
            ] {
                if kit::dock_item(ui, glyph, label, self.screen == screen) {
                    actions.push(Action::Show(screen));
                }
            }
            ui.with_layout(Layout::bottom_up(Align::Center), |ui| {
                ui.add_space(10.0);
                if kit::theme_switch(ui, self.settings.dark) {
                    actions.push(Action::ToggleDark);
                }
            });
        });
    }

    /// What the worker is doing, and how the last step went.
    fn messages(&self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        if let Some(busy) = &self.busy {
            ui.horizontal(|ui| {
                ui.spinner();
                match busy.progress {
                    Some((done, total)) => {
                        ui.label(theme::body(format!("{} {done} of {total}", busy.label)))
                    }
                    None => ui.label(theme::body(busy.label)),
                };
                // A slow model must not look like a window that has stopped.
                let elapsed = busy
                    .started
                    .map_or(0.0, |start| ui.input(|i| i.time) - start);
                if elapsed >= CLOCK_AFTER_SECONDS {
                    ui.label(theme::meta(clock(elapsed)));
                }
                if busy.can_stop && kit::ghost(ui, "Stop", true).clicked() {
                    actions.push(Action::StopGrading);
                }
            });
        }
        if let Some(error) = &self.error {
            kit::icon_line(ui, icon::WARNING, error, pal().danger);
        }
        if let Some(notice) = &self.notice {
            kit::icon_line(ui, icon::CHECK, notice, pal().accent);
        }
    }

    fn browser_card(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        kit::card().show(ui, |ui| {
            ui.set_width(ui.available_width());
            if !self.chrome_running {
                ui.horizontal_wrapped(|ui| {
                    if self.step_button(ui, Step::StartChrome, "Start Chrome", idle) {
                        actions.push(Action::StartChrome);
                    }
                    ui.label(theme::muted(
                        "Opens a separate Chrome window with its own profile. \
                         Log in to your grading site there once.",
                    ));
                });
            } else {
                ui.horizontal(|ui| {
                    if self.step_button(ui, Step::Read, "Read students", idle) {
                        actions.push(Action::Read);
                    }
                    let open = kit::ghost(ui, "Open", idle);
                    let address = ui.add(
                        egui::TextEdit::singleline(&mut self.address)
                            .hint_text("Address of a grading page")
                            .desired_width(f32::INFINITY),
                    );
                    let entered =
                        address.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                    let address = self.address.trim();
                    if idle && !address.is_empty() && (open.clicked() || entered) {
                        actions.push(Action::Open(address.to_owned()));
                    }
                });
            }
            self.messages(ui, actions);
        });
    }

    /// The buttons that move a session forward, one stage at a time.
    fn stages(&self, ui: &mut egui::Ui, session: &mut Session, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let to_grade = session.grade_count();
        let to_write = session.write_count();
        let has_key = !self.api_key.trim().is_empty();
        let provider_problem = self.settings.provider.problem(has_key);
        let weight_problem = session.rubric_outline().weight_problem.clone();

        ui.horizontal_wrapped(|ui| {
            let label = format!("Grade {}", count(to_grade, "student"));
            let enabled =
                idle && to_grade > 0 && provider_problem.is_none() && weight_problem.is_none();
            if self.step_button(ui, Step::Grade, &label, enabled) {
                actions.push(Action::Grade);
            }
            ui.checkbox(
                &mut session.include_graded,
                "Include students who are already graded",
            );
        });
        ui.horizontal_wrapped(|ui| {
            let label = kit::section_label(ui, "Leniency");
            let mut leniency = self.settings.leniency;
            let slider = ui
                .scope(|ui| {
                    // The rail is drawn in the widget fill, which on a card is
                    // the card's own colour. Give it one that shows.
                    ui.spacing_mut().slider_width = 180.0;
                    ui.visuals_mut().widgets.inactive.bg_fill = pal().border;
                    ui.add_enabled(
                        idle,
                        egui::Slider::new(&mut leniency, 0..=100).trailing_fill(true),
                    )
                })
                .inner
                .labelled_by(label.id);
            if slider.changed() {
                actions.push(Action::SetLeniency(leniency));
            }
            ui.label(theme::muted(leniency_note(leniency)));
        });
        if let Some(problem) = provider_problem {
            kit::icon_line(ui, icon::WARNING, problem, pal().warn);
        } else if let Some(problem) = &weight_problem {
            kit::icon_line(
                ui,
                icon::WARNING,
                &format!("{problem} Open the rubric to put it right."),
                pal().warn,
            );
        } else if to_grade == 0 && session.rows.iter().all(|row| row.proposal.is_none()) {
            ui.label(theme::muted(
                "There are no ungraded written answers on this page.",
            ));
        } else if self.settings.provider.service.is_remote() {
            ui.label(theme::muted(format!(
                "Student names and answers will be sent to {}.",
                self.settings.provider.service.label()
            )));
        }

        if session.rows.iter().any(|row| row.proposal.is_some()) {
            ui.horizontal_wrapped(|ui| {
                let label = if session.saves_on_write {
                    format!("Send {} to {}", count(to_write, "grade"), session.site)
                } else {
                    format!("Fill in {}", count(to_write, "grade"))
                };
                let enabled = idle && to_write > 0 && !session.blocked;
                if self.step_button(ui, Step::Write, &label, enabled) {
                    actions.push(Action::Write);
                }
                ui.checkbox(
                    &mut session.policy.overwrite_scores,
                    "Replace scores that already have points",
                );
                // A site that stores on write adds comments; it cannot replace one.
                let feedback_label = if session.saves_on_write {
                    "Add a comment even where one exists"
                } else {
                    "Replace existing feedback"
                };
                ui.checkbox(&mut session.policy.replace_feedback, feedback_label);
            });
        }

        match session.open_suggestions() {
            0 => {}
            n => {
                ui.label(theme::muted(format!(
                    "The consistency check suggests a different grade for {}. Open each one \
                     to use the suggestion or keep the proposal; left alone, the proposal is written.",
                    count(n, "student")
                )));
            }
        }

        if session.unsaved && session.manual_save {
            kit::icon_line(
                ui,
                icon::WARNING,
                &format!(
                    "Grades are filled in but not saved. OGRE cannot confirm a save on {}: \
                     save in the browser, then read the students again.",
                    session.site
                ),
                pal().warn,
            );
        } else if session.unsaved {
            ui.horizontal_wrapped(|ui| {
                let label = format!("Save on {}", session.site);
                if self.step_button(ui, Step::Save, &label, idle && !session.blocked) {
                    actions.push(Action::Save);
                }
                ui.label(theme::muted(
                    "Grades are filled in on the page but not saved yet.",
                ));
            });
        }
        for warning in &session.warnings {
            kit::icon_line(ui, icon::WARNING, warning, pal().warn);
        }
    }

    /// Where this question sits in its assignment, and the way to the ones
    /// beside it. Nothing is drawn where the site lists no questions.
    fn question_bar(&self, ui: &mut egui::Ui, session: &Session, actions: &mut Vec<Action>) {
        let Some(place) = session.place() else { return };
        let idle = self.busy.is_none();
        ui.horizontal_wrapped(|ui| {
            kit::section_label(
                ui,
                &format!("Question {} of {}", place.current.number, place.total),
            );
            if !place.current.title.is_empty() {
                ui.label(theme::body(&place.current.title));
            }
            for (label, to) in [
                ("Previous question", place.previous),
                ("Next question", place.next),
            ] {
                if kit::ghost(ui, label, idle && to.is_some()).clicked()
                    && let Some(to) = to
                {
                    // Work that would be lost is named before anything moves.
                    actions.push(match session.at_stake() {
                        Some(_) => Action::AskToLeave(to.url.clone()),
                        None => Action::GoTo(to.url.clone()),
                    });
                }
            }
        });
        if let Some(address) = &self.leaving
            && let Some(at_stake) = session.at_stake()
        {
            kit::icon_line(ui, icon::WARNING, &at_stake, pal().warn);
            ui.horizontal(|ui| {
                if kit::ghost(ui, "Leave this question", idle).clicked() {
                    actions.push(Action::GoTo(address.clone()));
                }
                if kit::ghost(ui, "Stay here", true).clicked() {
                    actions.push(Action::Stay);
                }
            });
        }
        ui.add_space(4.0);
    }

    /// How much each category counts, for the teacher to set. Nothing is
    /// drawn for a rubric with fewer than two categories.
    fn weights(ui: &mut egui::Ui, session: &mut Session) {
        let outline = session.rubric_outline();
        if outline.shares.len() < 2 && !outline.weights_written {
            return;
        }
        kit::section_label(ui, "Category weights");
        if !outline.weights_written {
            let mut set = false;
            ui.horizontal_wrapped(|ui| {
                ui.label(theme::muted("None are set, so the categories count alike."));
                set = kit::ghost(ui, "Set category weights", true).clicked();
            });
            if let Some(problem) = &outline.weight_problem {
                kit::icon_line(ui, icon::WARNING, problem, pal().warn);
            }
            if set {
                session.share_weights_equally();
            }
            return;
        }

        let shares = outline.shares.clone();
        let problem = outline.weight_problem.clone();
        let mut change = None;
        egui::Grid::new("category-weights")
            .num_columns(2)
            .spacing([22.0, 6.0])
            .show(ui, |ui| {
                for share in &shares {
                    let name = ui.label(theme::body(&share.category));
                    let mut weight = share.weight;
                    let field = ui
                        .add(
                            egui::DragValue::new(&mut weight)
                                .range(0.0..=100.0)
                                .speed(0.5)
                                .max_decimals(1)
                                // "50%", not "50.0%".
                                .custom_formatter(|weight, _| format_score(weight))
                                .suffix("%"),
                        )
                        .labelled_by(name.id);
                    if field.changed() {
                        change = Some((share.category.clone(), weight));
                    }
                    ui.end_row();
                }
            });
        match &problem {
            Some(problem) => kit::icon_line(ui, icon::WARNING, problem, pal().warn),
            None => {
                ui.label(theme::muted(
                    "They add up to 100%. Each category counts for its share of the student\u{2019}s score.",
                ));
            }
        }
        let (mut equal, mut remove) = (false, false);
        ui.horizontal_wrapped(|ui| {
            equal = kit::ghost(ui, "Share equally", true).clicked();
            remove = kit::ghost(ui, "Remove the weights", true).clicked();
        });
        if let Some((category, weight)) = change {
            session.set_category_weight(&category, weight);
        }
        if equal {
            session.share_weights_equally();
        }
        if remove {
            session.remove_weights();
        }
    }

    /// Example answers at four levels that the grader is shown: written by
    /// the AI when the teacher asks, and theirs to edit.
    fn examples(&self, ui: &mut egui::Ui, session: &mut Session, actions: &mut Vec<Action>) {
        let has_key = !self.api_key.trim().is_empty();
        let can_ask = self.busy.is_none()
            && self.settings.provider.problem(has_key).is_none()
            && session.rubric_outline().requirements > 0;
        let label = kit::section_label(ui, "Scoring examples");
        if session.examples.trim().is_empty() {
            ui.label(theme::muted(
                "Optional. The AI writes a short example answer at four levels for this \
                 question, and the grader is shown them so it knows what each level looks \
                 like. You can edit them before grading.",
            ));
            if kit::ghost(ui, "Write scoring examples", can_ask).clicked() {
                actions.push(Action::WriteExamples);
            }
            return;
        }
        ui.add(
            egui::TextEdit::multiline(&mut session.examples)
                .desired_rows(6)
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);
        if session.examples_out_of_date(self.settings.leniency) {
            kit::icon_line(
                ui,
                icon::WARNING,
                "The rubric or the leniency has changed since these were written.",
                pal().warn,
            );
        }
        let mut remove = false;
        ui.horizontal_wrapped(|ui| {
            if kit::ghost(ui, "Write them again", can_ask).clicked() {
                actions.push(Action::WriteExamples);
            }
            remove = kit::ghost(ui, "Remove the examples", true).clicked();
        });
        if remove {
            session.remove_examples();
        }
    }

    fn rubric(&self, ui: &mut egui::Ui, session: &mut Session, actions: &mut Vec<Action>) {
        let heading = theme::strong("Rubric").size(ty::BODY);
        // An open rubric is as tall as the window allows and scrolls beyond
        // that, so the steps below it never leave the screen.
        let room = (ui.ctx().content_rect().height() * RUBRIC_SHARE_OF_WINDOW).max(160.0);
        egui::CollapsingHeader::new(heading)
            .id_salt("rubric")
            .show(ui, |ui| {
                egui::ScrollArea::vertical()
                    .id_salt("rubric-body")
                    .max_height(room)
                    .auto_shrink([false, true])
                    .show(ui, |ui| {
                        if let Some(problem) = &session.rubric_problem {
                            kit::icon_line(
                                ui,
                                icon::WARNING,
                                &format!("The rubric could not be read from the page: {problem}"),
                                pal().warn,
                            );
                        }
                        ui.label(theme::meta(format!(
                            "Out of {}",
                            format_score(session.rubric.max_score_value())
                        )));
                        if let Some(prompt) = session
                            .rubric
                            .essay_prompt
                            .as_deref()
                            .filter(|p| !p.is_empty())
                        {
                            kit::section_label(ui, "Question");
                            ui.label(theme::body(prompt));
                        }

                        let label = kit::section_label(ui, "Requirements and model response");
                        let editor = ui
                            .add(
                                egui::TextEdit::multiline(&mut session.rubric_text)
                                    .hint_text(RUBRIC_HINT)
                                    .desired_rows(6)
                                    .desired_width(f32::INFINITY),
                            )
                            .labelled_by(label.id);
                        if editor.changed() {
                            session.rubric_text_changed();
                        }
                        let mut restore = false;
                        ui.horizontal_wrapped(|ui| {
                            if session.rubric_edited() {
                                kit::marker_pill(ui, "Edited");
                            }
                            ui.label(theme::muted(rubric_summary(session.rubric_outline())));
                            if session.rubric_edited() {
                                restore =
                                    kit::ghost(ui, "Use the page\u{2019}s rubric", true).clicked();
                            }
                        });
                        if restore {
                            session.restore_rubric_text();
                        }
                        if let Some(warning) = unread_warning(&session.rubric_outline().unread) {
                            kit::icon_line(ui, icon::WARNING, &warning, pal().warn);
                        }
                        Self::weights(ui, session);
                        let label = kit::section_label(ui, "Your instructions to the grader");
                        ui.add(
                            egui::TextEdit::multiline(&mut session.instructions)
                                .hint_text("Optional. For example: accept answers given in words.")
                                .desired_rows(2)
                                .desired_width(f32::INFINITY),
                        )
                        .labelled_by(label.id);
                        self.examples(ui, session, actions);
                    });
            });
    }

    fn status_cell(ui: &mut egui::Ui, status: &Status) {
        match status {
            Status::Ready => {
                kit::calm_pill(ui, &status.text());
            }
            // The marker: a decision is waiting here.
            Status::Suggested => {
                kit::marker_pill(ui, &status.text());
            }
            // The marker: these grades just went onto the page and are not saved.
            Status::Note(Note::Written) => {
                kit::marker_pill(ui, &status.text());
            }
            _ if status.is_problem() => {
                ui.label(
                    RichText::new(status.text())
                        .size(ty::META)
                        .color(pal().warn),
                );
            }
            Status::Held | Status::Skipped(_) => {
                ui.label(theme::meta(status.text()));
            }
            _ => {
                ui.label(theme::muted(status.text()));
            }
        }
    }

    fn details(
        ui: &mut egui::Ui,
        session: &mut Session,
        index: usize,
        markdown: &mut CommonMarkCache,
    ) {
        let status = session.status(index);
        let submission = &session.page.submissions[index];
        let max = submission.max_score();
        kit::panel_title(ui, &submission.name);
        ui.label(theme::meta(format!(
            "On the page: {}",
            score_text(submission)
        )));
        ui.horizontal(|ui| Self::status_cell(ui, &status));
        ui.separator();
        egui::ScrollArea::vertical().show(ui, |ui| {
            if let Some(proposal) = &mut session.rows[index].proposal {
                ui.horizontal(|ui| {
                    let label = kit::section_label(ui, "Proposed score");
                    let mut score = egui::DragValue::new(&mut proposal.score)
                        .speed(0.1)
                        .max_decimals(2);
                    score = match max {
                        Some(max) => score.range(0.0..=max),
                        None => score.range(0.0..=f64::MAX),
                    };
                    ui.add(score).labelled_by(label.id);
                    if let Some(max) = max {
                        ui.label(theme::meta(format!("of {}", format_score(max))));
                    }
                    ui.checkbox(&mut proposal.accepted, "Write this one");
                });
                if let Some(flag) = &proposal.flag {
                    kit::icon_line(ui, icon::WARNING, flag, pal().warn);
                }
                if let Some(suggestion) = &proposal.suggestion {
                    let text = suggestion_text(proposal.score, suggestion);
                    let (mut take, mut keep) = (false, false);
                    kit::card().show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.horizontal(|ui| {
                            kit::marker_pill(ui, "Suggestion");
                            ui.label(theme::meta("from the consistency check"));
                        });
                        ui.label(theme::body(text));
                        ui.horizontal_wrapped(|ui| {
                            take = kit::ghost(ui, "Use the suggestion", true).clicked();
                            keep = kit::ghost(ui, "Keep the proposal", true).clicked();
                        });
                    });
                    if take {
                        proposal.use_suggestion();
                    } else if keep {
                        proposal.keep_proposal();
                    }
                }
                let label = kit::section_label(ui, "Proposed feedback");
                let edit = ui
                    .add(
                        egui::TextEdit::multiline(&mut proposal.text)
                            .desired_rows(5)
                            .desired_width(f32::INFINITY),
                    )
                    .labelled_by(label.id);
                if edit.changed() {
                    proposal.mark_edited();
                }
                ui.add_space(8.0);
            }
            if let Some(prompt) = &submission.prompt {
                kit::section_label(ui, "Question");
                CommonMarkViewer::new().show(ui, markdown, prompt);
                ui.add_space(8.0);
            }
            kit::section_label(ui, "Response");
            if submission.response.is_empty() {
                ui.label(theme::muted("No written response."));
            } else {
                CommonMarkViewer::new().show(ui, markdown, &submission.response);
            }
            if let Some(feedback) = submission.feedback.as_ref().filter(|f| !f.text.is_empty()) {
                ui.add_space(8.0);
                kit::section_label(ui, "Feedback on the page");
                ui.label(theme::body(&feedback.text));
            }
        });
    }

    fn table(ui: &mut egui::Ui, session: &Session, selected: &mut Option<usize>) {
        const ROW_HEIGHT: f32 = 32.0;
        // Selectable text would swallow the click that is meant to pick the row.
        ui.style_mut().interaction.selectable_labels = false;
        TableBuilder::new(ui)
            .striped(true)
            .sense(egui::Sense::click())
            .cell_layout(Layout::left_to_right(Align::Center))
            .min_scrolled_height(120.0)
            .column(Column::auto().at_least(24.0))
            .column(Column::auto().at_least(140.0))
            .column(Column::auto().at_least(80.0))
            .column(Column::auto().at_least(70.0))
            .column(Column::auto().at_least(150.0))
            .column(Column::remainder().clip(true))
            .header(ROW_HEIGHT, |mut header| {
                for title in [
                    "#",
                    "Student",
                    "On the page",
                    "Proposed",
                    "Status",
                    "Response",
                ] {
                    header.col(|ui| {
                        kit::section_label(ui, title);
                    });
                }
            })
            .body(|body| {
                body.rows(ROW_HEIGHT, session.page.submissions.len(), |mut row| {
                    let index = row.index();
                    let submission = &session.page.submissions[index];
                    let status = session.status(index);
                    row.set_selected(*selected == Some(index));
                    row.col(|ui| {
                        ui.label(theme::muted((index + 1).to_string()));
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(&submission.name)
                                .family(theme::semibold_family())
                                .color(pal().ink),
                        );
                    });
                    row.col(|ui| {
                        ui.label(theme::body(score_text(submission)));
                    });
                    row.col(|ui| {
                        match &session.rows[index].proposal {
                            Some(proposal) => ui.label(theme::strong(format_score(proposal.score))),
                            None => ui.label(theme::muted("–")),
                        };
                    });
                    row.col(|ui| Self::status_cell(ui, &status));
                    row.col(|ui| {
                        let first_line = submission.response.lines().next().unwrap_or_default();
                        ui.add(egui::Label::new(theme::body(first_line)).truncate());
                    });
                    if row.response().clicked() {
                        *selected = Some(index);
                    }
                });
            });
    }

    fn grade_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        // Taken out while drawing so the panels can borrow it and `self` separately.
        let mut session = self.session.take();

        if let Some(session) = &mut session
            && let Some(index) = self.selected.filter(|i| *i < session.rows.len())
        {
            let margin = Margin {
                left: 0,
                ..CONTENT_MARGIN
            };
            egui::Panel::right("details")
                .default_size(420.0)
                .show_separator_line(false)
                .frame(Frame::new().inner_margin(margin))
                .show(ui, |ui| {
                    kit::card().show(ui, |ui| {
                        ui.set_min_size(ui.available_size());
                        Self::details(ui, session, index, &mut self.markdown);
                    });
                });
        }

        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                match &session {
                    None => kit::page_header(
                        ui,
                        "OGRE  /  Grade",
                        "Grade a page",
                        Some(
                            "Open a grading page in Chrome, read the students, \
                             and let the AI propose scores for you to review.",
                        ),
                    ),
                    Some(session) => kit::page_header(
                        ui,
                        &format!("OGRE  /  Grade  /  {}", session.site),
                        &session.page.title,
                        Some(&summary(session)),
                    ),
                }
                self.browser_card(ui, actions);
                let Some(session) = &mut session else {
                    ui.add_space(24.0);
                    ui.vertical_centered(|ui| {
                        ui.label(theme::muted("No students read yet."));
                    });
                    return;
                };
                ui.add_space(4.0);
                kit::card().show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    self.question_bar(ui, session, actions);
                    self.rubric(ui, session, actions);
                    ui.add_space(2.0);
                    self.stages(ui, session, actions);
                });
                ui.add_space(4.0);
                kit::card().show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    Self::table(ui, session, &mut self.selected);
                });
            });

        self.session = session;
    }

    fn agent_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let provider_problem = self
            .settings
            .provider
            .problem(!self.api_key.trim().is_empty());
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                kit::page_header(
                    ui,
                    "OGRE  /  Agent",
                    "Agent",
                    Some(
                        "Describe a task. The AI works the page open in Chrome one step at a time, \
                         and asks you first.",
                    ),
                );
                egui::ScrollArea::vertical().show(ui, |ui| {
                    // A question waiting for an answer comes first.
                    if let Some(question) = &self.agent.question {
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.horizontal(|ui| {
                                kit::panel_title(ui, &format!("Step {}", question.step));
                                kit::marker_pill(ui, "Needs your OK");
                            });
                            ui.label(theme::strong(&question.description).size(ty::BODY));
                            for reason in &question.reasons {
                                kit::icon_line(ui, icon::WARNING, reason, pal().warn);
                            }
                            if !question.reasoning.trim().is_empty() {
                                kit::section_label(ui, "The AI's reason");
                                ui.label(theme::muted(&question.reasoning));
                            }
                            ui.add_space(4.0);
                            ui.horizontal(|ui| {
                                if kit::primary(ui, "Allow", true).clicked() {
                                    actions.push(Action::AnswerAgent(AgentAnswer::Allow));
                                }
                                if kit::ghost(ui, "Don't do this", true).clicked() {
                                    actions.push(Action::AnswerAgent(AgentAnswer::Deny(
                                        self.agent.note.clone(),
                                    )));
                                }
                                if kit::ghost(ui, "Stop the agent", true).clicked() {
                                    actions.push(Action::AnswerAgent(AgentAnswer::Stop));
                                }
                            });
                            ui.horizontal(|ui| {
                                let label = kit::section_label(ui, "Tell it why not");
                                ui.add(
                                    egui::TextEdit::singleline(&mut self.agent.note)
                                        .hint_text("Optional")
                                        .desired_width(f32::INFINITY),
                                )
                                .labelled_by(label.id);
                            });
                        });
                        ui.add_space(4.0);
                    }

                    kit::card().show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        let label = kit::section_label(ui, "Task");
                        ui.add_enabled(
                            !self.agent.running,
                            egui::TextEdit::multiline(&mut self.agent.task)
                                .hint_text(
                                    "For example: which students on this page have no score yet?",
                                )
                                .desired_rows(3)
                                .desired_width(f32::INFINITY),
                        )
                        .labelled_by(label.id);
                        ui.horizontal_wrapped(|ui| {
                            let ready = idle
                                && self.chrome_running
                                && provider_problem.is_none()
                                && !self.agent.task.trim().is_empty();
                            let start = if self.agent.question.is_none() {
                                kit::primary(ui, "Start", ready)
                            } else {
                                kit::ghost(ui, "Start", ready)
                            };
                            if start.clicked() {
                                actions.push(Action::StartAgent);
                            }
                            ui.add_enabled(
                                !self.agent.running,
                                egui::Checkbox::new(
                                    &mut self.agent.auto,
                                    "Let it act without asking each time",
                                ),
                            );
                            ui.add_enabled(
                                !self.agent.running,
                                egui::Checkbox::new(
                                    &mut self.agent.screenshots,
                                    "Send a picture of the page with each step",
                                ),
                            );
                        });
                        ui.label(theme::muted(
                            "It always asks before saving, submitting, deleting, changing a score, \
                             running a script, or leaving the site. It never types into a password box.",
                        ));
                        if !self.chrome_running {
                            ui.label(theme::muted("Start Chrome on the Grade screen first."));
                        } else if let Some(problem) = provider_problem {
                            kit::icon_line(ui, icon::WARNING, problem, pal().warn);
                        } else if self.settings.provider.service.is_remote() {
                            ui.label(theme::muted(format!(
                                "What is on the page, including student names and scores, is sent to {}.",
                                self.settings.provider.service.label()
                            )));
                        }
                        self.messages(ui, actions);
                    });

                    if let Some(result) = &self.agent.result {
                        ui.add_space(4.0);
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            kit::panel_title(
                                ui,
                                if result.finished {
                                    "Finished"
                                } else {
                                    "Stopped before finishing"
                                },
                            );
                            ui.label(theme::body(&result.message));
                        });
                    }
                    if !self.agent.log.is_empty() {
                        ui.add_space(4.0);
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            kit::section_label(ui, "What it did");
                            for (number, line) in self.agent.log.iter().enumerate() {
                                let text = format!("{}. {}", number + 1, line.text);
                                match line.kind {
                                    LineKind::Step => ui.label(theme::body(text)),
                                    LineKind::Said => ui.label(theme::muted(text).size(ty::BODY)),
                                    LineKind::Failed => ui.label(
                                        RichText::new(text).size(ty::BODY).color(pal().warn),
                                    ),
                                };
                            }
                        });
                    }
                });
            });
    }

    fn history_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let can_open = self.busy.is_none() && self.chrome_running;
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                kit::page_header(
                    ui,
                    "OGRE  /  History",
                    "History",
                    Some("Pages graded on this computer, newest first."),
                );
                self.messages(ui, actions);
                egui::ScrollArea::vertical().show(ui, |ui| {
                    if self.history.is_empty() && self.busy.is_none() {
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.label(theme::muted(
                                "Nothing has been graded yet. A page appears here once \
                                 grades have been proposed for it.",
                            ));
                        });
                    }
                    let mut toggled = None;
                    for session in &self.history {
                        let open = self.history_open == Some(session.at);
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            if Self::past_session(ui, session, open) {
                                toggled = Some(session.at);
                            }
                            if open {
                                Self::past_session_details(ui, session, can_open, actions);
                            }
                        });
                        ui.add_space(4.0);
                    }
                    if let Some(at) = toggled {
                        self.history_open = (self.history_open != Some(at)).then_some(at);
                    }
                });
            });
    }

    /// One past session's summary. True when its details were asked for or
    /// dismissed.
    fn past_session(ui: &mut egui::Ui, session: &PastSession, open: bool) -> bool {
        let title = match session.title.trim() {
            "" => "A page without a title",
            title => title,
        };
        kit::panel_title(ui, title);
        let place = session
            .site
            .as_deref()
            .unwrap_or_else(|| host(&session.url));
        ui.label(theme::muted(format!(
            "{} · {place}",
            history::when(session.at)
        )));
        let mut toggled = false;
        ui.horizontal_wrapped(|ui| {
            kit::calm_pill(ui, &format!("{} graded", session.graded()));
            match session.end {
                SessionEnd::NothingWritten => {}
                // Worth a second look: these may never have reached the gradebook.
                SessionEnd::FilledIn => {
                    kit::marker_pill(
                        ui,
                        &format!("{} filled in, no save recorded", session.written()),
                    );
                }
                SessionEnd::Saved => {
                    kit::calm_pill(ui, &format!("{} saved", session.written()));
                }
            }
            let mut notes = Vec::new();
            if session.not_graded() > 0 {
                notes.push(format!("{} not graded", session.not_graded()));
            }
            if session.end == SessionEnd::NothingWritten {
                notes.push("nothing written".to_owned());
            }
            if !notes.is_empty() {
                ui.label(theme::muted(notes.join(" · ")));
            }
            let label = if open { "Hide details" } else { "Show details" };
            toggled = kit::ghost(ui, label, true).clicked();
        });
        toggled
    }

    fn past_session_details(
        ui: &mut egui::Ui,
        session: &PastSession,
        can_open: bool,
        actions: &mut Vec<Action>,
    ) {
        ui.add_space(4.0);
        for problem in &session.problems {
            kit::icon_line(ui, icon::WARNING, problem, pal().warn);
        }
        egui::Grid::new(("past-students", session.at))
            .num_columns(4)
            .spacing([22.0, 6.0])
            .show(ui, |ui| {
                for title in ["Student", "On the page", "Proposed", "Written"] {
                    kit::section_label(ui, title);
                }
                ui.end_row();
                for student in session.touched() {
                    ui.label(theme::strong(&student.name).size(ty::BODY));
                    ui.label(theme::body(
                        student.on_page.map_or("–".to_owned(), format_score),
                    ));
                    match &student.proposal {
                        Some(PastProposal::Score(score)) => {
                            ui.label(theme::body(format_score(*score)))
                        }
                        Some(PastProposal::NotGraded(reason)) => {
                            ui.label(theme::muted(format!("Not graded: {reason}")))
                        }
                        None => ui.label(theme::body("–")),
                    };
                    ui.label(theme::body(student.written.as_deref().unwrap_or("–")));
                    ui.end_row();
                }
            });
        if let Some(rubric) = &session.rubric {
            egui::CollapsingHeader::new(theme::strong("Rubric used").size(ty::BODY))
                .id_salt(("past-rubric", session.at))
                .show(ui, |ui| {
                    ui.label(theme::body(rubric));
                });
        }
        if let Some(examples) = &session.examples {
            egui::CollapsingHeader::new(theme::strong("Scoring examples used").size(ty::BODY))
                .id_salt(("past-examples", session.at))
                .show(ui, |ui| {
                    ui.label(theme::body(examples));
                });
        }
        ui.horizontal_wrapped(|ui| {
            if kit::ghost(ui, "Open this page", can_open).clicked() {
                actions.push(Action::Show(Screen::Grade));
                actions.push(Action::Open(session.url.clone()));
            }
            ui.label(theme::muted(&session.url));
        });
    }

    fn sites_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                kit::page_header(
                    ui,
                    "OGRE  /  Sites",
                    "Sites",
                    Some(
                        "The grading sites OGRE works with, and the ones you have mapped yourself.",
                    ),
                );
                egui::ScrollArea::vertical().show(ui, |ui| {
                    // A mapping waiting for a decision comes first: its Save button
                    // must not sit below the fold.
                    if let Some(report) = &mut self.mapping {
                        kit::card().show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.horizontal(|ui| {
                                kit::panel_title(ui, "What OGRE found");
                                kit::marker_pill(ui, "Not saved yet");
                            });
                            ui.label(theme::body(&report.how));
                            ui.label(theme::body(format!(
                                "{} on this page. Check that these match what you see:",
                                count(report.students, "student")
                            )));
                            egui::Grid::new("samples")
                                .num_columns(4)
                                .spacing([18.0, 6.0])
                                .show(ui, |ui| {
                                    for title in ["Student", "Score", "Answer", "Feedback box"] {
                                        kit::section_label(ui, title);
                                    }
                                    ui.end_row();
                                    for sample in &report.samples {
                                        ui.label(theme::strong(&sample.name).size(ty::BODY));
                                        let score = match (sample.score.trim(), sample.max) {
                                            ("", Some(max)) => format!("–/{}", format_score(max)),
                                            (score, Some(max)) => {
                                                format!("{score}/{}", format_score(max))
                                            }
                                            ("", None) => "–".to_owned(),
                                            (score, None) => score.to_owned(),
                                        };
                                        ui.label(theme::body(score));
                                        ui.label(theme::body(format!(
                                            "{} characters",
                                            sample.response_chars
                                        )));
                                        ui.label(theme::body(if sample.has_feedback_box {
                                            "Yes"
                                        } else {
                                            "None"
                                        }));
                                        ui.end_row();
                                    }
                                });
                            for warning in &report.warnings {
                                kit::icon_line(ui, icon::WARNING, warning, pal().warn);
                            }
                            ui.add_space(4.0);
                            ui.horizontal(|ui| {
                                let label = kit::section_label(ui, "Name");
                                ui.add(
                                    egui::TextEdit::singleline(&mut report.profile.name)
                                        .desired_width(260.0),
                                )
                                .labelled_by(label.id);
                            });
                            ui.horizontal(|ui| {
                                let named = !report.profile.name.trim().is_empty();
                                if kit::primary(ui, "Save this mapping", idle && named).clicked() {
                                    actions.push(Action::SaveMapping);
                                }
                                if kit::ghost(ui, "Discard", idle).clicked() {
                                    actions.push(Action::DiscardMapping);
                                }
                            });
                        });
                        ui.add_space(4.0);
                    }
                    kit::card().show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        kit::panel_title(ui, "Ready to use");
                        ui.horizontal(|ui| {
                            kit::calm_pill(ui, "MyOpenMath");
                            kit::calm_pill(ui, "Canvas");
                        });
                        ui.add_space(6.0);
                        kit::section_label(ui, "Your sites");
                        if self.profiles.is_empty() {
                            ui.label(theme::muted("You have not mapped any site yet."));
                        }
                        for profile in &self.profiles {
                            ui.horizontal(|ui| {
                                ui.label(theme::strong(&profile.name).size(ty::BODY));
                                ui.label(theme::muted(&profile.pages));
                                let remove = format!("Remove {}", profile.name);
                                if kit::ghost(ui, &remove, idle).clicked() {
                                    actions.push(Action::DeleteProfile(profile.id.clone()));
                                }
                            });
                        }
                    });
                    ui.add_space(4.0);
                    kit::card().show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        kit::panel_title(ui, "Map a new site");
                        ui.label(theme::body(
                            "Open one of the site's grading pages in the OGRE Chrome window. \
                             OGRE works out where the students, scores and feedback are, \
                             and checks its reading on the page before you save it.",
                        ));
                        let can_map = idle && self.chrome_running;
                        let provider_problem = self
                            .settings
                            .provider
                            .problem(!self.api_key.trim().is_empty());
                        ui.horizontal_wrapped(|ui| {
                            let map = if self.mapping.is_none() {
                                kit::primary(ui, "Map the open page", can_map)
                            } else {
                                kit::ghost(ui, "Map the open page", can_map)
                            };
                            if map.clicked() {
                                actions.push(Action::MapPage { with_ai: false });
                            }
                            let with_ai = kit::ghost(
                                ui,
                                "Map with AI",
                                can_map && provider_problem.is_none(),
                            );
                            if with_ai.clicked() {
                                actions.push(Action::MapPage { with_ai: true });
                            }
                        });
                        if !self.chrome_running {
                            ui.label(theme::muted("Start Chrome on the Grade screen first."));
                        }
                        let service = self.settings.provider.service;
                        ui.label(theme::muted(if service.is_remote() {
                            format!(
                                "With AI, the page's layout is sent to {}, with the names and \
                                 the first 60 characters of text of the first three students.",
                                service.label()
                            )
                        } else {
                            "Mapping without AI sends nothing anywhere. With AI, your local \
                             model is asked; nothing leaves this computer."
                                .to_owned()
                        }));
                        self.messages(ui, actions);
                    });
                });
            });
    }

    fn settings_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                kit::page_header(
                    ui,
                    "OGRE  /  Settings",
                    "Settings",
                    Some("Which AI grades, how it is reached, and how scores are worked out."),
                );
                kit::card().show(ui, |ui| {
                    ui.set_max_width(560.0);
                    kit::panel_title(ui, "AI service");
                    ui.add_space(4.0);
                    let copy_offered = self.old_app.is_some();
                    let provider = &mut self.settings.provider;
                    egui::Grid::new("provider")
                        .num_columns(2)
                        .spacing([14.0, 10.0])
                        .show(ui, |ui| {
                            let label = ui.label(theme::body("Service"));
                            let before = provider.service;
                            egui::ComboBox::from_id_salt("service")
                                .selected_text(provider.service.label())
                                .width(300.0)
                                .show_ui(ui, |ui| {
                                    for service in Service::ALL {
                                        ui.selectable_value(
                                            &mut provider.service,
                                            service,
                                            service.label(),
                                        );
                                    }
                                })
                                .response
                                .labelled_by(label.id);
                            if provider.service != before {
                                actions.push(Action::ServiceChanged);
                            }
                            ui.end_row();

                            let label = ui.label(theme::body("Address"));
                            ui.add(
                                egui::TextEdit::singleline(&mut provider.base_url)
                                    .hint_text(provider.service.kind().default_base_url())
                                    .desired_width(300.0),
                            )
                            .labelled_by(label.id);
                            ui.end_row();

                            if provider.service.needs_key() {
                                let label = ui.label(theme::body("API key"));
                                let key = ui
                                    .add(
                                        egui::TextEdit::singleline(&mut self.api_key)
                                            .password(true)
                                            .desired_width(300.0),
                                    )
                                    .labelled_by(label.id);
                                if key.lost_focus() {
                                    actions.push(Action::KeyChanged);
                                }
                                ui.end_row();
                            }

                            let label = ui.label(theme::body("Model"));
                            ui.horizontal(|ui| {
                                ui.add(
                                    egui::TextEdit::singleline(&mut provider.model)
                                        .hint_text("Model name")
                                        .desired_width(190.0),
                                )
                                .labelled_by(label.id);
                                if !self.models.is_empty() {
                                    egui::ComboBox::from_id_salt("models")
                                        .selected_text("Choose")
                                        .show_ui(ui, |ui| {
                                            for model in &self.models {
                                                ui.selectable_value(
                                                    &mut provider.model,
                                                    model.clone(),
                                                    model,
                                                );
                                            }
                                        })
                                        .response
                                        .labelled_by(label.id);
                                }
                            });
                            ui.end_row();
                        });
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        if kit::ghost(ui, "List models", idle).clicked() {
                            actions.push(Action::ListModels);
                        }
                        if copy_offered
                            && kit::ghost(ui, "Copy from the old OGRE app", idle).clicked()
                        {
                            actions.push(Action::CopyFromOldApp);
                        }
                    });
                    let where_it_runs = if provider.service.is_remote() {
                        "Student names and answers are sent to this service for grading."
                    } else {
                        "Grading runs on this computer. Nothing is sent anywhere else."
                    };
                    ui.label(theme::muted(where_it_runs));
                    if let Some(note) = &self.settings_note {
                        kit::icon_line(ui, icon::WARNING, note, pal().warn);
                    }
                    self.messages(ui, actions);
                });
                ui.add_space(4.0);
                kit::card().show(ui, |ui| {
                    ui.set_max_width(560.0);
                    kit::panel_title(ui, "Scores");
                    ui.add_space(4.0);
                    ui.checkbox(
                        &mut self.settings.score_from_verdicts,
                        "Work out each score from the feedback",
                    );
                    ui.label(theme::muted(if self.settings.score_from_verdicts {
                        "Each requirement is an equal share of its category: marked Correct \
                         it earns the share, Incomplete half, anything else none. The same \
                         feedback always gives the same score. The consistency check is not run."
                    } else {
                        "Each score is the AI\u{2019}s own judgment out of 10, scaled to the \
                         question. Turn this on to have the score follow from what the \
                         feedback says about each requirement instead."
                    }));
                });
            });
    }
}

impl eframe::App for OgreApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.take_events();
        if let Some(busy) = &mut self.busy {
            let now = ui.input(|i| i.time);
            busy.started.get_or_insert(now);
        }
        // Decided once, before the screens borrow the session to draw it.
        self.next = self.next_step();
        let mut actions = Vec::new();

        // The desk: every panel below is transparent and sits on this.
        let desk = ui.max_rect();
        ui.painter().rect_filled(desk, 0, pal().desk);
        theme::paint_grid(ui.painter(), desk);

        egui::Panel::left("dock")
            .exact_size(kit::DOCK_WIDTH + 2.0 * kit::APP_PADDING)
            .resizable(false)
            .show_separator_line(false)
            .frame(Frame::new().inner_margin(Margin::same(kit::APP_PADDING as i8)))
            .show(ui, |ui| self.dock(ui, &mut actions));

        match self.screen {
            Screen::Grade => self.grade_screen(ui, &mut actions),
            Screen::Agent => self.agent_screen(ui, &mut actions),
            Screen::Sites => self.sites_screen(ui, &mut actions),
            Screen::History => self.history_screen(ui, &mut actions),
            Screen::Settings => self.settings_screen(ui, &mut actions),
        }

        let ctx = ui.ctx().clone();
        for action in actions {
            self.carry_out(&ctx, action);
        }
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        eframe::set_value(storage, STORAGE_KEY, &self.settings);
    }
}

/// The host of an address, for telling sites apart: "www.myopenmath.com".
fn host(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    rest.split(['/', '?', '#']).next().unwrap_or(rest)
}

/// What the consistency check proposes, in a sentence or two.
fn suggestion_text(proposed: f64, suggestion: &Suggestion) -> String {
    let mut text = if suggestion.score == proposed {
        format!(
            "Keep the score of {} but reword the feedback.",
            format_score(proposed)
        )
    } else {
        format!(
            "{} instead of {}{}.",
            format_score(suggestion.score),
            format_score(proposed),
            if suggestion.feedback_html.is_some() {
                ", with feedback rewritten to match"
            } else {
                ""
            }
        )
    };
    if let Some(reason) = suggestion
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
    {
        text.push(' ');
        text.push_str(reason);
    }
    text
}

/// What a leniency setting does, in a line.
fn leniency_note(setting: u8) -> &'static str {
    match setting {
        DEFAULT_LENIENCY => {
            "The usual setting: the AI rewords the rubric to be easier to meet before grading."
        }
        AS_WRITTEN_LENIENCY => "The rubric is used as written.",
        s if s < DEFAULT_LENIENCY => {
            "More lenient than usual: the AI rewords the rubric to be easier still to meet."
        }
        s if s < AS_WRITTEN_LENIENCY => {
            "Less lenient than usual: the AI rewords the rubric to be a little easier to meet."
        }
        _ => "Strict: the AI rewords the rubric to be harder to meet before grading.",
    }
}

/// Shown in the empty rubric editor.
const RUBRIC_HINT: &str = "One requirement per line. A line that starts with ## \
is a heading for the requirements under it:\n\
## Method\n\
Sets up the equation with the rate given in the question";

/// One line saying what the grader will find in the rubric text.
fn rubric_summary(outline: &RubricOutline) -> String {
    let exemplar = if outline.exemplar {
        "a model response"
    } else {
        "no model response"
    };
    if outline.requirements == 0 {
        return format!(
            "No requirements, {exemplar}. The AI grades against the question and your instructions."
        );
    }
    format!(
        "{} in {}, {exemplar}.",
        count(outline.requirements, "requirement"),
        count_of(outline.categories, "category", "categories"),
    )
}

fn count_of(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

/// Tells the teacher which lines of their rubric will be left out, if any.
fn unread_warning(unread: &[String]) -> Option<String> {
    let first: String = unread.first()?.chars().take(60).collect();
    let ellipsis = if unread[0].chars().count() > 60 {
        "…"
    } else {
        ""
    };
    Some(match unread.len() {
        1 => format!("This line will not be used for grading: “{first}{ellipsis}”."),
        n => {
            format!("{n} lines will not be used for grading, the first being “{first}{ellipsis}”.")
        }
    })
}

fn summary(session: &Session) -> String {
    let page = &session.page;
    let students = page.submissions.len();
    let without_points = page
        .submissions
        .iter()
        .filter(|s| !s.has_nonzero_score())
        .count();
    let mut text = format!(
        "{} · {}, {without_points} with no points yet",
        session.site,
        count(students, "student")
    );
    if let Some(position) = page.position {
        text.push_str(&format!(
            " · page {} of {}",
            position.current, position.total
        ));
    }
    text
}
