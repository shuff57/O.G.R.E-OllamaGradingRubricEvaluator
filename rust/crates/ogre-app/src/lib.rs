//! The OGRE desktop app.

mod agent_run;
mod app;
mod audit;
mod grading;
mod keys;
mod kit;
mod profiles;
mod session;
mod settings;
mod theme;
mod worker;

pub use agent_run::{AgentAnswer, AgentLine, AgentQuestion, AgentRequest, AgentSummary, LineKind};
pub use app::OgreApp;
pub use grading::{Grade, GradeReport, GradedRow};
pub use keys::{KeyStore, Keyring, MemoryKeys};
pub use profiles::ProfileSummary;
pub use settings::{ProviderSettings, STORAGE_KEY, Service, Settings};
pub use worker::{
    Command, Event, GradeRequest, MapReport, ReadReport, StandIn, Worker, WriteReport,
};
