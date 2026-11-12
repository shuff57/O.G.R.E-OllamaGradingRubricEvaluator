//! The OGRE desktop app.

mod agent_run;
mod app;
mod audit;
mod grading;
mod history;
mod keys;
mod kit;
mod profiles;
mod session;
mod settings;
mod theme;
mod worker;

pub use agent_run::{AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary, LineKind};
pub use app::OgreApp;
pub use grading::{Grade, GradeReport, GradedRow, Suggestion};
pub use history::{PastProposal, PastSession, PastStudent, SessionEnd};
pub use keys::{KeyStore, Keyring, MemoryKeys};
pub use profiles::ProfileSummary;
pub use settings::engine_leniency;
pub use settings::{ProviderSettings, STORAGE_KEY, Service, Settings, old_app_settings_file};
pub use worker::{
    Command, Event, ExamplesRequest, GradeRequest, MapReport, ReadReport, StandIn, Worker,
    WriteReport,
};
