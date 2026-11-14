//! A grading page that is shown inside a frame of another page, as when a
//! school's site shows a grading tool inside itself.

use std::time::{Duration, Instant};

use async_trait::async_trait;
use serde_json::Value;

use crate::driver::eval_as;
use crate::{Error, PageDriver, Result};

const FRAME_SCRIPT: &str = include_str!("frame.js");

/// The longest a frame may take to load a page it was sent to.
const LOAD_TIME: Duration = Duration::from_secs(60);

/// A selector for the frame that takes up most of `page`, if it has one.
/// What that frame shows is then the page to map and to grade on.
pub async fn main_frame(page: &dyn PageDriver) -> Result<Option<String>> {
    eval_as(page, FRAME_SCRIPT).await
}

/// What stands between two frames in a selector for a frame inside a frame:
/// `iframe#outer >>> iframe#inner`. It is no CSS, so no selector has it.
pub const FRAME_INSIDE: &str = ">>>";

/// A selector for the frame `inner` finds inside the frame `outer` finds.
pub fn frame_inside(outer: &str, inner: &str) -> String {
    format!("{outer} {FRAME_INSIDE} {inner}")
}

/// One frame of a page, driven as if it were the page: scripts run inside
/// the frame. The address is still the page's own, which is what the
/// teacher sees and what a site profile is kept under.
pub struct Framed<'a> {
    page: &'a dyn PageDriver,
    /// JavaScript expressions that give the frame's element, from the
    /// outermost frame to the one that is driven.
    frames: Vec<String>,
}

impl<'a> Framed<'a> {
    /// The frame of `page` that the CSS selector `selector` finds. For a
    /// frame inside a frame, the selectors from the outermost in, with
    /// [`FRAME_INSIDE`] between them.
    pub fn new(page: &'a dyn PageDriver, selector: &str) -> Self {
        let frames = selector
            .split(FRAME_INSIDE)
            .map(str::trim)
            .filter(|selector| !selector.is_empty())
            .map(|selector| {
                // A string in JSON is a string in JavaScript.
                let selector = Value::String(selector.to_owned());
                format!(
                    "(() => {{ try {{ return document.querySelector({selector}); }} catch (e) {{ return null; }} }})()"
                )
            })
            .collect();
        Self { page, frames }
    }

    /// The frames down to this one, and then `more`.
    fn path<'p>(&'p self, more: &[&'p str]) -> Vec<&'p str> {
        self.frames
            .iter()
            .map(String::as_str)
            .chain(more.iter().copied())
            .collect()
    }
}

#[async_trait]
impl PageDriver for Framed<'_> {
    async fn url(&self) -> Result<String> {
        self.page.url().await
    }

    /// Sends the frame, not the page around it, to `url`, and waits for the
    /// page there to have loaded.
    async fn navigate(&self, url: &str) -> Result<()> {
        let to = Value::String(url.to_owned());
        // The page that goes is marked, so that the one that comes can be
        // told from it. An address that differs only after its `#` brings
        // no new page.
        let leaves = self
            .eval(&format!(
                "(() => {{ const to = new URL({to}, location.href); \
                 const here = (address) => address.split('#')[0]; \
                 const leaves = !(to.hash && here(to.href) === here(location.href)); \
                 if (leaves) window.__ogreLeaving = true; \
                 location.assign(to.href); return leaves; }})()"
            ))
            .await?;
        if leaves != Value::Bool(true) {
            return Ok(());
        }
        let started = Instant::now();
        while started.elapsed() < LOAD_TIME {
            tokio::time::sleep(Duration::from_millis(100)).await;
            // Between two pages the frame may not answer at all.
            let arrived = self
                .eval("window.__ogreLeaving !== true && document.readyState === 'complete'")
                .await;
            if matches!(arrived, Ok(Value::Bool(true))) {
                return Ok(());
            }
        }
        Err(Error::Browser(format!(
            "the frame did not finish loading {url} within {} seconds",
            LOAD_TIME.as_secs()
        )))
    }

    async fn eval(&self, expression: &str) -> Result<Value> {
        self.page.eval_in_frames(&self.path(&[]), expression).await
    }

    async fn eval_in_frame(&self, frame: &str, expression: &str) -> Result<Value> {
        self.page
            .eval_in_frames(&self.path(&[frame]), expression)
            .await
    }

    async fn eval_in_frames(&self, frames: &[&str], expression: &str) -> Result<Value> {
        self.page
            .eval_in_frames(&self.path(frames), expression)
            .await
    }
}

/// `page` itself, or the frame of it a profile says the grading page is in.
/// Keeps what it made alive for as long as the page is used.
pub(super) enum Within<'a> {
    Page(&'a dyn PageDriver),
    Frame(Framed<'a>),
}

impl<'a> Within<'a> {
    pub fn of(page: &'a dyn PageDriver, frame: Option<&str>) -> Self {
        match frame {
            Some(selector) => Self::Frame(Framed::new(page, selector)),
            None => Self::Page(page),
        }
    }

    pub fn page(&self) -> &dyn PageDriver {
        match self {
            Self::Page(page) => *page,
            Self::Frame(framed) => framed,
        }
    }
}
