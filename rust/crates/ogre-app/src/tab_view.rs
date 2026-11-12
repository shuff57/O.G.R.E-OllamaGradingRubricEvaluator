//! The page shown inside OGRE's window, for a Chrome that runs without a
//! window of its own.
//!
//! The window and the worker share a [`ViewLink`]: pictures of the tab and
//! what the page is asking come one way, the teacher's mouse and keyboard go
//! the other. Input does not wait in line behind the worker's commands, so
//! the page can be used while grading runs.
//!
//! Keystrokes pass through here on their way to Chrome, passwords included.
//! Nothing on that way is kept or written down.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use ogre_harness::cdp::{CdpPage, Held, MouseAction, PageDialog, TabView, ViewEvent, ViewSize};
use ogre_harness::{InputDriver, PageDriver};
use tokio::sync::mpsc;

/// How often the browser is asked whether a link has opened a new tab.
const NEW_TAB_CHECK: Duration = Duration::from_millis(1200);

/// Something the teacher did on the page shown.
#[derive(Debug, Clone, PartialEq)]
pub enum ViewInput {
    /// The space the page is drawn in changed.
    Size(ViewSize),
    Mouse {
        action: MouseAction,
        x: f64,
        y: f64,
        held: Held,
    },
    /// A key named as in the DOM `KeyboardEvent.key` values.
    Key {
        name: String,
        pressed: bool,
        held: Held,
    },
    /// Text that arrives whole: a paste, or what an input method composed.
    Text(String),
    /// The answer to what the page is asking.
    Answer(bool),
    Back,
    Forward,
    Reload,
    /// Put the selected text where the window can take it for the clipboard.
    Copy,
    /// The same, and delete it from the page.
    Cut,
}

/// A decoded picture of the tab.
#[derive(Clone, PartialEq, Eq)]
pub struct Picture {
    /// Width and height in picture pixels.
    pub size: [usize; 2],
    /// Four bytes a pixel: red, green, blue, opacity.
    pub rgba: Vec<u8>,
}

/// What the worker tells the window about the tab on show.
#[derive(Default)]
pub struct ViewState {
    /// True while a tab is being shown.
    pub showing: bool,
    /// The newest picture the window has not drawn yet.
    pub picture: Option<Picture>,
    /// Where the tab is.
    pub address: String,
    /// What the page is asking, until it is answered.
    pub dialog: Option<PageDialog>,
    /// Text the teacher copied on the page, for the window's clipboard.
    pub copied: Option<String>,
}

/// The window's end of the link, and the worker's when cloned.
#[derive(Clone)]
pub struct ViewLink {
    state: Arc<Mutex<ViewState>>,
    input: mpsc::UnboundedSender<ViewInput>,
}

impl ViewLink {
    /// A link and the receiving end of its input, for whoever shows the tab.
    pub fn new() -> (Self, mpsc::UnboundedReceiver<ViewInput>) {
        let (input, inbox) = mpsc::unbounded_channel();
        let link = Self {
            state: Arc::default(),
            input,
        };
        (link, inbox)
    }

    /// What is known about the tab on show. Hold it briefly.
    pub fn state(&self) -> MutexGuard<'_, ViewState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn send(&self, input: ViewInput) {
        let _ = self.input.send(input);
    }
}

/// What the worker's command loop tells the task that shows the tab.
pub(crate) enum Control {
    /// Show this tab from now on.
    Show(CdpPage),
    /// Chrome is gone, or the page is no longer shown in the window.
    Hide,
}

/// The tab on show, for commands that act on "the page the teacher is
/// looking at".
pub(crate) type Shown = Arc<Mutex<Option<CdpPage>>>;

pub(crate) fn shown_tab(shown: &Shown) -> Option<CdpPage> {
    shown.lock().unwrap_or_else(PoisonError::into_inner).clone()
}

/// Shows one tab at a time for as long as the worker lives: forwards its
/// pictures and questions to the window, and the teacher's input to it.
pub(crate) async fn run(
    link: ViewLink,
    mut inputs: mpsc::UnboundedReceiver<ViewInput>,
    mut control: mpsc::UnboundedReceiver<Control>,
    shown: Shown,
    wake: Arc<dyn Fn() + Send + Sync>,
) {
    // Input is passed on by a task of its own: a click that makes the page
    // ask a question does not return until the question is answered, and the
    // answer has to get through meanwhile.
    let (to_page, for_page) = mpsc::unbounded_channel::<(CdpPage, ViewInput)>();
    let passing_on = tokio::spawn(pass_on(for_page, link.clone(), wake.clone()));

    let mut size = ViewSize {
        width: 1200,
        height: 800,
        scale: 1.0,
    };
    let mut view: Option<TabView> = None;
    let mut known_tabs: Vec<CdpPage> = Vec::new();
    let mut check = tokio::time::interval(NEW_TAB_CHECK);
    check.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        // What to show next, if this round changes it.
        let mut switch_to: Option<Option<CdpPage>> = None;
        tokio::select! {
            control = control.recv() => match control {
                Some(Control::Show(page)) => switch_to = Some(Some(page)),
                Some(Control::Hide) => switch_to = Some(None),
                None => break,
            },
            Some(input) = inputs.recv() => match (input, &view) {
                (ViewInput::Size(new), _) => {
                    // Only the last of a run of sizes matters.
                    let mut new = new;
                    let mut after = None;
                    while let Ok(next) = inputs.try_recv() {
                        match next {
                            ViewInput::Size(newer) => new = newer,
                            other => {
                                after = Some(other);
                                break;
                            }
                        }
                    }
                    if new != size {
                        size = new;
                        if let Some(view) = &view {
                            let _ = view.resize(size).await;
                        }
                    }
                    if let (Some(after), Some(view)) = (after, &view) {
                        let _ = to_page.send((view.page().clone(), after));
                    }
                }
                (ViewInput::Answer(accept), Some(view)) => {
                    let _ = view.page().answer_dialog(accept).await;
                }
                (input, Some(view)) => {
                    // A page that is asking something takes no other input.
                    let asking = link.state().dialog.is_some();
                    if !asking {
                        let _ = to_page.send((view.page().clone(), input));
                    }
                }
                (_, None) => {}
            },
            event = next_event(&mut view) => match event {
                Some(ViewEvent::Picture(jpeg)) => {
                    if let Some(picture) = decode(&jpeg) {
                        link.state().picture = Some(picture);
                        wake();
                    }
                }
                Some(ViewEvent::Asks(dialog)) => {
                    link.state().dialog = Some(dialog);
                    wake();
                }
                Some(ViewEvent::Answered) => {
                    link.state().dialog = None;
                    wake();
                }
                Some(ViewEvent::Moved(address)) => {
                    link.state().address = address;
                    wake();
                    // Chrome draws the new page in a process of its own and
                    // can go on sending pictures of the old one, which never
                    // changes again. Asking afresh gets the new page.
                    if let Some(view) = &view {
                        let _ = view.resize(size).await;
                    }
                }
                // The tab was closed: show another if there is one.
                None => {
                    let closed = view.take().map(|view| view.page().clone());
                    let others = match &closed {
                        Some(closed) => closed.browser_tabs().await.unwrap_or_default(),
                        None => Vec::new(),
                    };
                    switch_to = Some(others.into_iter().next_back());
                }
            },
            _ = check.tick() => {
                if let Some(view) = &view
                    && let Ok(tabs) = view.page().browser_tabs().await
                {
                    // A link that opens a new tab would otherwise seem to do
                    // nothing: the new tab is the one to look at.
                    let new = tabs
                        .iter()
                        .rev()
                        .find(|tab| !known_tabs.iter().any(|known| known.is_same_tab(tab)))
                        .cloned();
                    known_tabs = tabs;
                    if new.is_some() {
                        switch_to = Some(new);
                    }
                }
            }
        }

        let Some(next) = switch_to else { continue };
        if let Some(old) = view.take() {
            old.stop().await;
        }
        let mut address = String::new();
        if let Some(page) = &next {
            address = page.url().await.unwrap_or_default();
            known_tabs = page.browser_tabs().await.unwrap_or_default();
            view = page.view(size).await.ok();
        }
        let showing = view.is_some();
        *shown.lock().unwrap_or_else(PoisonError::into_inner) = next.filter(|_| showing);
        {
            let mut state = link.state();
            state.showing = showing;
            state.address = address;
            state.dialog = None;
            if !showing {
                state.picture = None;
            }
        }
        wake();
    }
    passing_on.abort();
}

/// The next event of the tab on show; waits forever while there is none.
async fn next_event(view: &mut Option<TabView>) -> Option<ViewEvent> {
    match view {
        Some(view) => view.next().await,
        None => std::future::pending().await,
    }
}

/// Passes the teacher's input to the page, in the order it was made.
async fn pass_on(
    mut inputs: mpsc::UnboundedReceiver<(CdpPage, ViewInput)>,
    link: ViewLink,
    wake: Arc<dyn Fn() + Send + Sync>,
) {
    let mut waiting: Option<(CdpPage, ViewInput)> = None;
    loop {
        let Some((page, mut input)) = (match waiting.take() {
            Some(next) => Some(next),
            None => inputs.recv().await,
        }) else {
            return;
        };
        // The pointer is only ever where it last was: of a run of moves the
        // last one is enough, and the page keeps up.
        while is_plain_move(&input) {
            match inputs.try_recv() {
                Ok((_, newer)) if is_plain_move(&newer) => input = newer,
                Ok(other) => {
                    waiting = Some(other);
                    break;
                }
                Err(_) => break,
            }
        }
        // A page that has gone, or will not answer, is not this task's to
        // report: the pictures stop and the window says so.
        let _ = match input {
            ViewInput::Mouse { action, x, y, held } => page.mouse(action, x, y, held).await,
            ViewInput::Key {
                name,
                pressed,
                held,
            } => page.key(&name, pressed, held).await,
            ViewInput::Text(text) => page.insert_text(&text).await,
            ViewInput::Back => page.go_back().await,
            ViewInput::Forward => page.go_forward().await,
            ViewInput::Reload => page.reload().await,
            ViewInput::Copy | ViewInput::Cut => {
                let cut = input == ViewInput::Cut;
                match page.selected_text().await {
                    Ok(text) if !text.is_empty() => {
                        link.state().copied = Some(text);
                        wake();
                        if cut {
                            page.key("Delete", true, Held::default())
                                .await
                                .and(page.key("Delete", false, Held::default()).await)
                        } else {
                            Ok(())
                        }
                    }
                    other => other.map(|_| ()),
                }
            }
            // Handled where the tab is shown.
            ViewInput::Size(_) | ViewInput::Answer(_) => Ok(()),
        };
    }
}

fn is_plain_move(input: &ViewInput) -> bool {
    matches!(
        input,
        ViewInput::Mouse {
            action: MouseAction::Move { .. },
            ..
        }
    )
}

fn decode(jpeg: &[u8]) -> Option<Picture> {
    let image = image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg).ok()?;
    let image = image.into_rgba8();
    Some(Picture {
        size: [image.width() as usize, image.height() as usize],
        rgba: image.into_raw(),
    })
}
