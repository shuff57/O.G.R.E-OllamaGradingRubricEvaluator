//! The OGRE desktop app.

mod agent_run;
mod app;
mod audit;
mod grading;
mod history;
mod keys;
mod kit;
mod profiles;
mod rubrics;
mod session;
mod settings;
mod tab_view;
mod theme;
mod worker;

pub use agent_run::{
    AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary, LineKind, SkillSummary,
};
pub use app::OgreApp;
pub use grading::{Grade, GradeReport, GradedRow, Suggestion};
pub use history::{PastProposal, PastSession, PastStudent, SessionEnd};
pub use keys::{KeyStore, Keyring, MemoryKeys};
pub use profiles::ProfileSummary;
pub use rubrics::SavedRubric;
pub use settings::engine_leniency;
pub use settings::{ProviderSettings, STORAGE_KEY, Service, Settings, old_app_settings_file};
pub use tab_view::{ViewInput, ViewLink, ViewState};
pub use worker::{
    Command, Event, ExamplesRequest, GradeRequest, MapReport, OutsideRubric, ProfileCheck,
    ReadReport, StandIn, Worker, WriteReport,
};
