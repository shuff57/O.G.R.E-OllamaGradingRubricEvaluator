//! The page harness: how OGRE reads from and writes to a grading page.
//!
//! [`PageDriver`] is the only thing site code knows about a browser. The
//! [`cdp`] module implements it for a Chrome the teacher is logged in to;
//! other ways of reaching a page can be added without touching [`sites`].

#[cfg(feature = "cdp")]
pub mod cdp;
mod driver;
mod error;
pub mod feedback;
pub mod sites;

pub use driver::{InputDriver, PageDriver};
pub use error::{Error, Result};
