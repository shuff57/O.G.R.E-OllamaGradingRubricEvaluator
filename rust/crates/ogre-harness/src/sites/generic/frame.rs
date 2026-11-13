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

/// One frame of a page, driven as if it were the page: scripts run inside
/// the frame. The address is still the page's own, which is what the
/// teacher sees and what a site profile is kept under.
pub struct Framed<'a> {
    page: &'a dyn PageDriver,
    /// A JavaScript expression that gives the frame's element.
    frame: String,
}

impl<'a> Framed<'a> {
    /// The frame of `page` that the CSS selector `selector` finds.
    pub fn new(page: &'a dyn PageDriver, selector: &str) -> Self {
        // A string in JSON is a string in JavaScript.
        let selector = Value::String(selector.to_owned());
        Self {
            page,
            frame: format!(
                "(() => {{ try {{ return document.querySelector({selector}); }} catch (e) {{ return null; }} }})()"
            ),
        }
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
        self.page.eval_in_frame(&self.frame, expression).await
    }

    async fn eval_in_frame(&self, _frame: &str, _expression: &str) -> Result<Value> {
        Err(Error::Page(
            "OGRE does not read a frame inside a frame.".into(),
        ))
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
