//! Showing a tab somewhere other than Chrome's own window, and acting on it
//! from there as a person at that window would.
//!
//! Chrome sends a picture of the tab whenever it changes; mouse and keyboard
//! are passed to the tab as input events, which the page cannot tell from a
//! person's. This is for a Chrome that runs without a window of its own.
//!
//! What a real window does and this does not: the file picker, pop-up
//! windows of the browser itself (permission prompts, the password manager),
//! and the system clipboard, which the caller has to bridge with
//! [`CdpPage::selected_text`] and [`InputDriver::insert_text`].

use std::time::Duration;

use serde_json::{Value, json};
use tokio::sync::mpsc;

use super::{BASE64, COMMAND_TIMEOUT, CdpPage, Event, key_named};
use crate::{Error, PageDriver, Result};
use base64::Engine as _;

/// What Chrome answers for a tab that is between two pages.
const BETWEEN_PAGES: &str = "Not attached to an active page";

/// How large a tab is drawn.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewSize {
    /// In CSS pixels, which is also the unit of every mouse position.
    pub width: u32,
    pub height: u32,
    /// Picture pixels per CSS pixel, for a sharp picture on a dense screen.
    pub scale: f64,
}

/// News from a tab that is being shown.
#[derive(Debug, Clone, PartialEq)]
pub enum ViewEvent {
    /// The tab as it now looks, as a JPEG.
    Picture(Vec<u8>),
    /// The page asks something and stands still until it is answered with
    /// [`CdpPage::answer_dialog`].
    Asks(PageDialog),
    /// The question was answered, by whoever.
    Answered,
    /// The tab is at another address. Chrome draws the new page in a
    /// process of its own and can go on sending pictures of the old one,
    /// which never changes again: [`TabView::restart_pictures`] gets the new
    /// page.
    Moved(String),
}

/// A question a page asks with `alert`, `confirm` or `prompt`, or Chrome's
/// own "Leave site?".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageDialog {
    pub kind: DialogKind,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DialogKind {
    /// Something to read; there is only one answer.
    Alert,
    Confirm,
    /// Asks for text. Answered here with the text the page suggested.
    Prompt,
    /// The page has unsaved changes and is about to be left.
    Leave,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Middle,
    Right,
}

/// What the mouse did, at a position in CSS pixels from the tab's top left.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MouseAction {
    /// Moved, with the left button held or not.
    Move {
        held: bool,
    },
    /// `clicks` is 2 for the second press of a double click.
    Press {
        button: MouseButton,
        clicks: u32,
    },
    Release {
        button: MouseButton,
        clicks: u32,
    },
    /// Scrolled by this many CSS pixels; down and right are positive.
    Wheel {
        dx: f64,
        dy: f64,
    },
}

/// The modifier keys held during a mouse or key event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Held {
    pub alt: bool,
    pub ctrl: bool,
    pub meta: bool,
    pub shift: bool,
}

impl Held {
    fn bits(self) -> u8 {
        u8::from(self.alt)
            | u8::from(self.ctrl) << 1
            | u8::from(self.meta) << 2
            | u8::from(self.shift) << 3
    }
}

/// A tab's picture as it changes. Dropping it leaves the tab as it is;
/// [`TabView::stop`] also has Chrome stop sending.
pub struct TabView {
    page: CdpPage,
    events: mpsc::UnboundedReceiver<Event>,
    size: ViewSize,
}

impl CdpPage {
    /// Starts showing this tab at `size`.
    pub async fn view(&self, size: ViewSize) -> Result<TabView> {
        // Listening starts first, so the first picture is not missed.
        let view = TabView {
            page: self.clone(),
            events: self.conn.listen(&self.session),
            size,
        };
        view.restart_pictures().await?;
        Ok(view)
    }

    /// True if `other` is this same tab.
    pub fn is_same_tab(&self, other: &CdpPage) -> bool {
        self.target == other.target
    }

    /// Every tab of the browser this one belongs to, oldest first.
    pub async fn browser_tabs(&self) -> Result<Vec<CdpPage>> {
        self.conn.tabs().await
    }

    /// Passes a mouse event to the page.
    pub async fn mouse(&self, action: MouseAction, x: f64, y: f64, held: Held) -> Result<()> {
        let button = |button: MouseButton| match button {
            MouseButton::Left => "left",
            MouseButton::Middle => "middle",
            MouseButton::Right => "right",
        };
        let mut event = json!({ "x": x, "y": y, "modifiers": held.bits() });
        match action {
            MouseAction::Move { held } => {
                event["type"] = "mouseMoved".into();
                if held {
                    event["button"] = "left".into();
                    event["buttons"] = 1.into();
                }
            }
            MouseAction::Press {
                button: pressed,
                clicks,
            } => {
                event["type"] = "mousePressed".into();
                event["button"] = button(pressed).into();
                event["clickCount"] = clicks.into();
            }
            MouseAction::Release {
                button: released,
                clicks,
            } => {
                event["type"] = "mouseReleased".into();
                event["button"] = button(released).into();
                event["clickCount"] = clicks.into();
            }
            MouseAction::Wheel { dx, dy } => {
                event["type"] = "mouseWheel".into();
                event["deltaX"] = dx.into();
                event["deltaY"] = dy.into();
            }
        }
        self.call("Input.dispatchMouseEvent", event).await?;
        Ok(())
    }

    /// Presses or releases one key, named as in the DOM `KeyboardEvent.key`
    /// values. A key that types something types it, unless Control or the
    /// command key is held, in which case it is a shortcut.
    pub async fn key(&self, name: &str, pressed: bool, held: Held) -> Result<()> {
        let key = key_named(name).ok_or_else(|| Error::Browser(format!("no such key: {name}")))?;
        let shortcut = held.ctrl || held.meta;
        let text = key.text.filter(|_| pressed && !shortcut);
        let mut event = json!({
            "type": match (pressed, &text) {
                (false, _) => "keyUp",
                (true, Some(_)) => "keyDown",
                (true, None) => "rawKeyDown",
            },
            "key": name,
            "code": key.code,
            "windowsVirtualKeyCode": key.number,
            "nativeVirtualKeyCode": key.number,
            "modifiers": held.bits(),
        });
        if let Some(text) = text {
            event["text"] = text.into();
        }
        // Without a window there is no desktop to turn these into edits.
        if pressed && shortcut {
            let command = match (name.to_ascii_lowercase().as_str(), held.shift) {
                ("a", false) => Some("selectAll"),
                ("z", false) => Some("undo"),
                ("z", true) | ("y", false) => Some("redo"),
                _ => None,
            };
            if let Some(command) = command {
                event["commands"] = json!([command]);
            }
        }
        self.call("Input.dispatchKeyEvent", event).await?;
        Ok(())
    }

    /// Answers the question the page is asking. Declining an alert is the
    /// same as accepting it.
    pub async fn answer_dialog(&self, accept: bool) -> Result<()> {
        let answer = json!({ "accept": accept });
        self.call("Page.handleJavaScriptDialog", answer).await?;
        Ok(())
    }

    /// Goes one page back in the tab's history. Nothing happens at its start.
    pub async fn go_back(&self) -> Result<()> {
        self.step_in_history(-1).await
    }

    pub async fn go_forward(&self) -> Result<()> {
        self.step_in_history(1).await
    }

    async fn step_in_history(&self, by: i64) -> Result<()> {
        // While Chrome is still swapping in the page of the last step, it
        // answers that there is no page. A moment later there is.
        let mut tries = 0;
        loop {
            match self.try_step_in_history(by).await {
                Err(Error::Browser(why)) if why.contains(BETWEEN_PAGES) && tries < 20 => {
                    tries += 1;
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                done => return done,
            }
        }
    }

    async fn try_step_in_history(&self, by: i64) -> Result<()> {
        let history = self.call("Page.getNavigationHistory", json!({})).await?;
        let entry = history["currentIndex"]
            .as_i64()
            .and_then(|at| usize::try_from(at + by).ok())
            .and_then(|at| history["entries"].get(at))
            .and_then(|entry| entry["id"].as_i64());
        if let Some(entry) = entry {
            let to = json!({ "entryId": entry });
            self.call("Page.navigateToHistoryEntry", to).await?;
        }
        Ok(())
    }

    pub async fn reload(&self) -> Result<()> {
        self.call("Page.reload", json!({})).await?;
        Ok(())
    }

    /// The text that is selected on the page or in the box being typed in.
    pub async fn selected_text(&self) -> Result<String> {
        const SELECTED: &str = r"(() => {
            const box = document.activeElement;
            if (box && typeof box.value === 'string' && box.selectionStart != null
                && box.selectionStart !== box.selectionEnd && box.type !== 'password') {
                return box.value.substring(box.selectionStart, box.selectionEnd);
            }
            return String(window.getSelection());
        })()";
        let value = self.eval(SELECTED).await?;
        Ok(value.as_str().unwrap_or_default().to_owned())
    }
}

impl TabView {
    /// The tab being shown.
    pub fn page(&self) -> &CdpPage {
        &self.page
    }

    /// Draws the tab at another size. Chrome sends a picture at once.
    pub async fn resize(&mut self, size: ViewSize) -> Result<()> {
        self.size = size;
        self.restart_pictures().await
    }

    /// Has Chrome send pictures of the tab as it is now, starting at once.
    pub async fn restart_pictures(&self) -> Result<()> {
        let (page, size) = (&self.page, self.size);
        let metrics = json!({
            "width": size.width,
            "height": size.height,
            "deviceScaleFactor": size.scale,
            "mobile": false,
        });
        page.call("Emulation.setDeviceMetricsOverride", metrics)
            .await?;
        // Chrome only paints the tab in front.
        let front = json!({ "targetId": &*page.target });
        page.conn
            .call(None, "Target.activateTarget", front, COMMAND_TIMEOUT)
            .await?;
        // Starting again is what makes Chrome send a picture of a page that
        // is not changing.
        let _ = page.call("Page.stopScreencast", json!({})).await;
        let pixels = |length: u32| (f64::from(length) * size.scale).ceil();
        let cast = json!({
            "format": "jpeg",
            "quality": 80,
            "maxWidth": pixels(size.width),
            "maxHeight": pixels(size.height),
        });
        page.call("Page.startScreencast", cast).await?;
        Ok(())
    }

    /// The next thing that happened. `None` once the tab is closed or Chrome
    /// has gone.
    ///
    /// Safe to drop while it waits: nothing is lost, and the next call
    /// picks up where this one was.
    pub async fn next(&mut self) -> Option<ViewEvent> {
        loop {
            let Event { method, params } = self.events.recv().await?;
            match method.as_str() {
                "Page.screencastFrame" => {
                    // Chrome sends the next picture only after this one is
                    // acknowledged. Not waited for, so that giving up on
                    // this call half way loses nothing.
                    let seen = json!({ "sessionId": params["sessionId"] });
                    let page = self.page.clone();
                    tokio::spawn(async move {
                        let _ = page.call("Page.screencastFrameAck", seen).await;
                    });
                    let picture = params["data"]
                        .as_str()
                        .and_then(|data| BASE64.decode(data).ok());
                    if let Some(picture) = picture {
                        return Some(ViewEvent::Picture(picture));
                    }
                }
                "Page.javascriptDialogOpening" => {
                    return Some(ViewEvent::Asks(PageDialog {
                        kind: match params["type"].as_str() {
                            Some("confirm") => DialogKind::Confirm,
                            Some("prompt") => DialogKind::Prompt,
                            Some("beforeunload") => DialogKind::Leave,
                            _ => DialogKind::Alert,
                        },
                        message: params["message"].as_str().unwrap_or_default().to_owned(),
                    }));
                }
                "Page.javascriptDialogClosed" => return Some(ViewEvent::Answered),
                "Page.frameNavigated" if params["frame"]["parentId"].is_null() => {
                    if let Some(url) = address(&params["frame"]["url"]) {
                        return Some(ViewEvent::Moved(url));
                    }
                }
                _ => {}
            }
        }
    }

    /// Has Chrome stop sending pictures and draw the tab at its own size
    /// again.
    pub async fn stop(self) {
        let _ = self.page.call("Page.stopScreencast", json!({})).await;
        let _ = self
            .page
            .call("Emulation.clearDeviceMetricsOverride", json!({}))
            .await;
    }
}

fn address(url: &Value) -> Option<String> {
    url.as_str().map(str::to_owned)
}
