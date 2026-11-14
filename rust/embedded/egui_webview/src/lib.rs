//! Web pages as [egui](https://www.egui.rs/) widgets.
//!
//! The app creates a [`WebViewInstance`] once, keeps it, calls [`WebViewInstance::ui`] in every
//! pass in which the page should be shown, and [`WebViewInstance::place`] from
//! [`eframe::App::output_hook`].
//!
//! A [`WebViewInstance`] shows its page through a [`Backend`], in one of two ways:
//!
//! - Off-screen rendering (CEF, with the `cef` feature): the page renders into a texture that egui
//!   paints like any other image, and the widget forwards egui's input to the page.
//! - An embedded view (an `<iframe>` on the web): the page lies below egui's surface. Its rect is an [`egui::EmbeddedView`], which clears the rect to
//!   transparent so the page shows through. After every pass of the root viewport,
//!   [`WebViewInstance::place`] moves the page to where egui put that rect, which egui reports
//!   as an [`egui::EmbeddedViewOutput`]. egui layers above the page (windows, popups, …) paint
//!   over it, and the output tells the backend where egui takes the pointer input.
//!
//! Tab and Shift-Tab move the keyboard focus between egui widgets and the page's elements; see
//! [`WebViewInstance::ui`].
//!
//! A [`WebViewInstance`] isn't `Send`. If the code that shows the page can't keep one, use
//! [`WebView`]. It shows a page with one call, and the pages live in a [`WebViews`] that the app
//! owns.

mod backend;
#[cfg(all(feature = "cef", not(target_arch = "wasm32")))]
mod chromium;
mod instance;
mod mailbox;
#[cfg(target_arch = "wasm32")]
mod web;
mod webviews;

pub use backend::{Backend, EmbeddedWidget, PageWidget};
#[cfg(all(feature = "cef", not(target_arch = "wasm32")))]
pub use chromium::run_subprocess as run_cef_subprocess;
#[cfg(all(feature = "cef", not(target_arch = "wasm32")))]
pub use chromium::set_cache_dir as set_cef_cache_dir;
pub use instance::{WebViewInstance, WebViewResponse};
pub use webviews::{WebView, WebViews};

/// What should the webview load?
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WebViewSource {
    /// An HTML document, given as its source text.
    Html(String),

    /// The URL of a page.
    Url(String),
}

impl WebViewSource {
    /// Returns the HTML source if this is [`Self::Html`].
    pub fn html(&self) -> Option<&str> {
        match self {
            Self::Html(html) => Some(html),
            Self::Url(_) => None,
        }
    }
}

/// Events returned by the webview.
#[derive(Clone, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum WebViewEvent {
    /// A page started loading.
    Loading {
        /// The URL of the page. For a page given as [`WebViewSource::Html`], this is
        /// `about:srcdoc`, `about:blank` or a `data:` URL, depending on the backend.
        url: String,
    },

    /// A page finished loading.
    Loaded {
        /// The URL of the page, as in [`Self::Loading`].
        url: String,
    },

    /// A string that the page sent with `window.ipc.postMessage(text)`.
    ///
    /// On the web, a page loaded from a URL has no `window.ipc`. It sends messages with
    /// `window.parent.postMessage(text, "*")` instead, and only string messages are reported.
    Message(String),

    /// OGRE: one message from the browser's own debugging channel (the DevTools protocol), as
    /// the JSON the browser wrote: the reply to a message sent with
    /// [`WebViewInstance::send_devtools_message`], or an event. Only the CEF backend sends it,
    /// and only once a first message has been sent.
    DevTools(Vec<u8>),

    /// OGRE: the page asks something with `alert`, `confirm` or `prompt`, or the browser asks
    /// whether to leave a page with unsaved changes. The page stands still until it is answered
    /// with [`WebViewInstance::answer_dialog`]. Only the CEF backend sends it.
    Asks {
        /// Which kind of question it is.
        kind: DialogKind,
        /// The question's text.
        message: String,
        /// The text a `prompt` suggests as the answer.
        default_text: String,
    },

    /// OGRE: what the page asked was answered, or the page went away while it was asking.
    AsksNoMore,

    /// OGRE: the page asks for a file, as when a file box is clicked. A windowless browser
    /// has no window to show a file chooser in, so the host chooses and answers with
    /// [`WebViewInstance::answer_files`]. Only the CEF backend sends it.
    AsksForFiles {
        /// True if the page takes more than one file.
        many: bool,
        /// What the page calls the choice, if it says.
        title: String,
    },
}

/// OGRE: the kind of question in a [`WebViewEvent::Asks`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DialogKind {
    /// Something to read. There is only one answer.
    Alert,
    /// Yes or no.
    Confirm,
    /// Asks for text.
    Prompt,
    /// The browser's "Leave site?" for a page with unsaved changes.
    Leave,
}

/// Logs a warning for a failed call whose error isn't returned to the caller.
pub(crate) fn warn<E: std::fmt::Display>(result: Result<(), E>) {
    if let Err(err) = result {
        log::warn!("egui_webview: {err}");
    }
}

/// An error from creating or using a [`WebViewInstance`].
#[derive(Debug)]
#[non_exhaustive]
pub enum Error {
    /// No backend supports this platform, or the window handle of [`eframe::EmbeddedViews`] is
    /// not one the platform's backend can use.
    Unsupported,

    /// The backend reported an error.
    Backend(Box<dyn std::error::Error + Send + Sync>),
}

impl Error {
    /// Wraps `err` in [`Self::Backend`].
    pub fn backend(err: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::Backend(err.into())
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "No webview backend is available on this platform"),
            Self::Backend(err) => write!(f, "Webview failed: {err}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Unsupported => None,
            Self::Backend(err) => Some(err.as_ref()),
        }
    }
}
