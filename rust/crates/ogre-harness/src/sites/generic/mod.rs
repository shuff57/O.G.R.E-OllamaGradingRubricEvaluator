//! Sites OGRE has not been built for: the teacher opens a grading page, OGRE
//! works out where the students, score boxes and feedback boxes are, proves
//! that mapping on the live page, and from then on reads and writes by it.
//!
//! The pieces, in the order they are used:
//!
//! 1. [`capture_snapshot`] takes a bounded outline of the visible page.
//! 2. [`detect`] proposes a mapping from the outline's structure alone;
//!    [`discover`] asks an AI when that is not conclusive.
//! 3. [`validate_profile`] tries a [`SiteProfile`] on the page and says, per
//!    mapped element, what it found. Only a profile that passes becomes a
//!    [`ValidatedProfile`].
//! 4. [`ProfileAdapter`] is the [`SiteAdapter`](super::SiteAdapter) for a
//!    validated profile.
//!
//! Profiles are stored as plain [`SiteProfile`]s. A stored profile is
//! validated against the page again each time it is about to be used: a site
//! that has changed must stop the run, not be written to by guesswork.

mod adapter;
mod discovery;
mod frame;
mod heuristics;
mod inspect;
mod pick;
mod profile;
mod snapshot;
mod validate;
mod walk;

pub use adapter::ProfileAdapter;
pub use discovery::{
    DISCOVERY_MAX_ATTEMPTS, DISCOVERY_SYSTEM_PROMPT, DiscoverOptions, Discovery, DiscoveryDraft,
    DiscoveryError, DiscoveryHints, DiscoveryParseError, DiscoverySource, discover,
    discovery_request, extract_discovery_json, is_valid_discovery_result, parse_discovery_response,
};
pub use frame::{FRAME_INSIDE, Framed, frame_inside, main_frame};
pub use heuristics::{Candidates, Detection, Mode, detect, draft_profile};
pub use pick::{PICK_SECONDS, PickFor, pick_element};
pub use profile::{
    ButtonRule, FeedbackBox, MaxScoreRule, PROFILE_VERSION, PageMap, ProfileError, SaveRule,
    SaveSuccess, Saving, SiteProfile, UrlRule,
};
pub use snapshot::{
    Outline, Priority, Snapshot, SnapshotNode, SnapshotOptions, SnapshotStats, capture_snapshot,
};
pub use validate::{
    Element, ElementCheck, Problem, Severity, StudentSample, ValidatedProfile, ValidationReport,
    validate_profile,
};
