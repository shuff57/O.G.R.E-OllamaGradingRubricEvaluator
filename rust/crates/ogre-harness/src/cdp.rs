//! Drives Chrome over the DevTools Protocol.

use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::input::InsertTextParams;
use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use chromiumoxide::error::CdpError;
use chromiumoxide::handler::Handler;
use chromiumoxide::layout::Point;
use chromiumoxide::page::{Page, ScreenshotParams};
use futures::StreamExt;
use tokio::task::JoinHandle;

use crate::{Error, InputDriver, PageDriver, Result};

/// How to start Chrome.
#[derive(Debug, Clone)]
pub struct LaunchOptions {
    /// Folder holding the browser profile (cookies, logins). Chrome refuses
    /// remote control of its default profile, so this must be a folder of
    /// OGRE's own; the teacher logs in to their sites there once.
    pub profile_dir: PathBuf,
    /// Run without a window. The teacher-facing app wants `false`.
    pub headless: bool,
    /// Chrome binary to run. `None` finds an installed Chrome or Edge.
    pub executable: Option<PathBuf>,
}

/// A running Chrome that OGRE controls.
pub struct Chrome {
    browser: Browser,
    /// Pumps protocol messages; nothing works unless this keeps running.
    events: JoinHandle<()>,
    launched: bool,
}

impl Chrome {
    /// Starts a new Chrome with the given profile.
    pub async fn launch(options: LaunchOptions) -> Result<Self> {
        // The library's default flags are for throwaway test browsers: they
        // turn off sync and swap the password store, which would break a
        // profile a teacher logs in to and comes back to.
        let mut config = BrowserConfig::builder()
            .disable_default_args()
            .args(["no-first-run", "no-default-browser-check"])
            .user_data_dir(&options.profile_dir)
            .viewport(None);
        config = if options.headless {
            config.new_headless_mode()
        } else {
            config.with_head()
        };
        if let Some(path) = &options.executable {
            config = config.chrome_executable(path);
        }
        let config = config.build().map_err(Error::Browser)?;

        let (browser, handler) = Browser::launch(config).await.map_err(browser_error)?;
        Ok(Self {
            browser,
            events: pump(handler),
            launched: true,
        })
    }

    /// Connects to a Chrome that is already running with remote debugging on.
    /// `endpoint` is its `ws://` DevTools address or `http://host:port`.
    pub async fn attach(endpoint: &str) -> Result<Self> {
        let (mut browser, handler) = Browser::connect(endpoint).await.map_err(browser_error)?;
        let events = pump(handler);
        // An attached browser starts out knowing none of the tabs already
        // open, and they take a moment to become usable after being fetched.
        browser.fetch_targets().await.map_err(browser_error)?;
        tokio::time::sleep(Duration::from_millis(300)).await;
        Ok(Self {
            browser,
            events,
            launched: false,
        })
    }

    /// The browser's DevTools address, which [`Chrome::attach`] accepts.
    pub fn endpoint(&self) -> &str {
        self.browser.websocket_address()
    }

    /// Opens `url` in a new tab and waits for it to load.
    pub async fn open(&self, url: &str) -> Result<CdpPage> {
        let page = self.browser.new_page(url).await.map_err(browser_error)?;
        Ok(CdpPage(page))
    }

    /// The tabs currently open.
    pub async fn pages(&self) -> Result<Vec<CdpPage>> {
        let pages = self.browser.pages().await.map_err(browser_error)?;
        Ok(pages.into_iter().map(CdpPage).collect())
    }

    /// Whether the browser still answers. False once its window is closed.
    pub async fn is_alive(&self) -> bool {
        self.browser.version().await.is_ok()
    }

    /// Shuts down a browser that [`Chrome::launch`] started. A browser that
    /// was attached to belongs to the teacher and is left running.
    pub async fn close(mut self) -> Result<()> {
        if self.launched {
            self.browser.close().await.map_err(browser_error)?;
            self.browser
                .wait()
                .await
                .map_err(|e| Error::Browser(e.to_string()))?;
        }
        self.events.abort();
        Ok(())
    }
}

impl Drop for Chrome {
    fn drop(&mut self) {
        self.events.abort();
    }
}

/// Keeps the connection's message loop running until the browser goes away.
fn pump(mut handler: Handler) -> JoinHandle<()> {
    tokio::spawn(async move {
        // An `Err` item is one message the library could not decode (a newer
        // Chrome sends events it does not know). The connection is still good,
        // so keep going; the stream itself ends when the browser disconnects.
        while handler.next().await.is_some() {}
    })
}

/// A tab in a [`Chrome`].
#[derive(Debug, Clone)]
pub struct CdpPage(Page);

#[async_trait]
impl PageDriver for CdpPage {
    async fn url(&self) -> Result<String> {
        let url = self.0.url().await.map_err(browser_error)?;
        Ok(url.unwrap_or_default())
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        self.0.goto(url).await.map_err(browser_error)?;
        Ok(())
    }

    async fn eval(&self, expression: &str) -> Result<serde_json::Value> {
        let result = self
            .0
            .evaluate_expression(expression)
            .await
            .map_err(|e| match e {
                CdpError::JavascriptException(details) => Error::Script(
                    details
                        .exception
                        .and_then(|e| e.description)
                        .unwrap_or(details.text),
                ),
                other => browser_error(other),
            })?;
        // `undefined` has no JSON form; treat it as null.
        Ok(result.value().cloned().unwrap_or(serde_json::Value::Null))
    }
}

#[async_trait]
impl InputDriver for CdpPage {
    async fn click_at(&self, x: f64, y: f64) -> Result<()> {
        self.0.click(Point { x, y }).await.map_err(browser_error)?;
        Ok(())
    }

    async fn insert_text(&self, text: &str) -> Result<()> {
        self.0
            .execute(InsertTextParams::new(text))
            .await
            .map_err(browser_error)?;
        Ok(())
    }

    async fn press_key(&self, key: &str) -> Result<()> {
        // The library only exposes key presses through an element handle, but
        // sends them to the page, where the focused element receives them.
        let anchor = self.0.find_element("html").await.map_err(browser_error)?;
        anchor.press_key(key).await.map_err(browser_error)?;
        Ok(())
    }

    async fn screenshot_png(&self) -> Result<Vec<u8>> {
        let params = ScreenshotParams::builder()
            .format(CaptureScreenshotFormat::Png)
            .build();
        self.0.screenshot(params).await.map_err(browser_error)
    }
}

fn browser_error(e: CdpError) -> Error {
    Error::Browser(e.to_string())
}
