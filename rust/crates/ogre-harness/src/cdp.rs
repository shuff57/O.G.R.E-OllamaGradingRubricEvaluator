//! Drives Chrome over the DevTools Protocol.
//!
//! Chrome is started with `--remote-debugging-pipe`: it reads commands on
//! file descriptor 3 and writes replies and events on 4, each one a JSON
//! object ended by a NUL byte. Unlike a debugging port, no other program on
//! the machine can attach to the teacher's logged-in browser, and Chrome
//! quits by itself when the pipe closes, so it cannot outlive OGRE.

use std::collections::HashMap;
use std::ffi::OsString;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio::time::timeout;

use crate::{Error, InputDriver, PageDriver, Result};

mod view;

pub use view::{
    DialogKind, Held, MouseAction, MouseButton, PageDialog, TabView, ViewEvent, ViewSize,
};

/// Chrome starting up and answering its first command.
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(20);
/// A command Chrome answers by itself, normally within milliseconds.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
/// A page loading, from the request to its `load` event.
const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
/// A script, which may wait on the page: the site adapters wait up to 30
/// seconds for a site to confirm a save, so this has to be well over that.
const EVAL_TIMEOUT: Duration = Duration::from_secs(120);
/// How long a frame showing another site may take to become reachable.
const FRAME_WAIT: Duration = Duration::from_secs(5);
/// Whether Chrome still answers. A live Chrome does so at once.
const ALIVE_TIMEOUT: Duration = Duration::from_secs(5);
/// How long Chrome gets to quit by itself before it is killed.
const EXIT_TIMEOUT: Duration = Duration::from_secs(5);

const EXITED: &str = "Chrome has exited";
const TAB_CLOSED: &str = "the tab was closed";

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

/// A running Chrome that OGRE started and controls.
pub struct Chrome {
    conn: Arc<Connection>,
    /// The tasks reading and writing Chrome's pipe, which closes when they end.
    pipe: [JoinHandle<()>; 2],
    /// Fired or dropped to have `process` see Chrome out.
    quit: Option<oneshot::Sender<()>>,
    /// The task that owns the Chrome process; done once Chrome has exited.
    process: JoinHandle<()>,
}

impl Chrome {
    /// Starts a new Chrome with the given profile.
    pub async fn launch(options: LaunchOptions) -> Result<Self> {
        if cfg!(not(unix)) {
            return Err(Error::Browser(NOT_ON_THIS_SYSTEM.into()));
        }
        let executable = match options.executable {
            Some(path) => path,
            None => find_browser()?,
        };
        // Only what a browser the teacher logs in to and comes back to needs.
        // The flags usual for throwaway test browsers (no sync, a plain-text
        // password store, automation banners) would break such a profile.
        let mut profile = OsString::from("--user-data-dir=");
        profile.push(&options.profile_dir);
        let mut args = vec![
            "--remote-debugging-pipe".into(),
            "--no-first-run".into(),
            "--no-default-browser-check".into(),
            "--disable-extensions".into(),
            profile,
        ];
        if options.headless {
            args.extend(["--headless=new", "--hide-scrollbars", "--mute-audio"].map(Into::into));
        }
        let (child, to_chrome, from_chrome) = spawn(&executable, &args)?;

        let (outbox, queued) = mpsc::unbounded_channel();
        let conn = Arc::new(Connection {
            next_id: AtomicU64::new(1),
            outbox,
            piped: true,
            state: Mutex::default(),
        });
        let (quit, quitting) = oneshot::channel();
        // From here on, dropping `chrome` on an error also ends the process.
        let chrome = Self {
            pipe: [
                tokio::spawn(read_loop(conn.clone(), from_chrome)),
                tokio::spawn(write_loop(to_chrome, queued)),
            ],
            quit: Some(quit),
            process: tokio::spawn(supervise(child, conn.clone(), quitting)),
            conn,
        };
        chrome
            .conn
            .call(None, "Browser.getVersion", json!({}), LAUNCH_TIMEOUT)
            .await
            .map_err(|error| {
                Error::Browser(format!(
                    "{} did not start: {}. If a Chrome using the profile {} is already open, \
                     close it first.",
                    executable.display(),
                    reason(error),
                    options.profile_dir.display()
                ))
            })?;
        Ok(chrome)
    }

    /// Opens `url` in a new tab and waits for it to load.
    pub async fn open(&self, url: &str) -> Result<CdpPage> {
        let conn = &self.conn;
        // The tab starts blank and is then sent to `url`, because only a
        // navigation that was asked for says when it has finished.
        let created = conn
            .call(
                None,
                "Target.createTarget",
                json!({ "url": "about:blank" }),
                COMMAND_TIMEOUT,
            )
            .await?;
        let target = text(&created, "targetId")?;
        let opened = async {
            let page = conn.tab(target).await?;
            // A page Chrome could not load stays open, showing why: the
            // teacher can try again there, or accept a certificate.
            if page.load(url).await?.is_none() {
                // The blank page is not somewhere to go back to.
                let _ = page.call("Page.resetNavigationHistory", json!({})).await;
            }
            Ok(page)
        };
        match opened.await {
            Ok(page) => Ok(page),
            Err(error) => {
                let closing = json!({ "targetId": target });
                let _ = conn
                    .call(None, "Target.closeTarget", closing, COMMAND_TIMEOUT)
                    .await;
                Err(error)
            }
        }
    }

    /// The tabs currently open, including those the teacher opened by hand.
    pub async fn pages(&self) -> Result<Vec<CdpPage>> {
        self.conn.tabs().await
    }

    /// Whether the browser still answers. False once its window is closed.
    pub async fn is_alive(&self) -> bool {
        self.conn
            .call(None, "Browser.getVersion", json!({}), ALIVE_TIMEOUT)
            .await
            .is_ok()
    }

    /// Shuts the browser down and waits until its process has gone.
    pub async fn close(mut self) -> Result<()> {
        // Asked first so Chrome writes the profile out before it goes. No
        // answer is fine: closing the pipe below tells it the same thing.
        let _ = self
            .conn
            .call(None, "Browser.close", json!({}), EXIT_TIMEOUT)
            .await;
        self.hang_up();
        (&mut self.process)
            .await
            .map_err(|e| Error::Browser(format!("could not wait for Chrome to exit: {e}")))
    }

    /// Closes the pipe, which makes Chrome quit, and has the process task
    /// kill it should it not.
    fn hang_up(&mut self) {
        self.conn.shut("Chrome was closed");
        for task in &self.pipe {
            task.abort();
        }
        self.quit.take();
    }
}

impl Drop for Chrome {
    fn drop(&mut self) {
        self.hang_up();
    }
}

/// A tab in a [`Chrome`].
#[derive(Clone)]
pub struct CdpPage {
    conn: Arc<Connection>,
    target: Arc<str>,
    session: Arc<str>,
}

impl fmt::Debug for CdpPage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CdpPage")
            .field("target", &self.target)
            .finish_non_exhaustive()
    }
}

/// The one page of a browser that is not a Chrome OGRE started, reached over
/// that browser's own debugging channel: the browser built into OGRE's
/// window. Whoever embeds the browser carries the messages both ways.
pub struct EmbeddedLink {
    /// The page, driven as a tab of Chrome is.
    pub page: CdpPage,
    /// Messages for the browser, each one whole message of the DevTools
    /// protocol as JSON.
    pub to_browser: mpsc::UnboundedReceiver<Vec<u8>>,
    /// Where the browser's own messages are handed in.
    pub from_browser: FromBrowser,
}

/// The way in for what an embedded browser sends. Safe to use from the
/// thread the browser calls back on.
#[derive(Clone)]
pub struct FromBrowser(Arc<Connection>);

impl FromBrowser {
    /// Takes one message from the browser: a reply or an event.
    pub fn message(&self, bytes: &[u8]) {
        self.0.dispatch(bytes);
    }

    /// Says that the browser is gone. Everything waiting for it fails with
    /// `why`, as does everything asked of the page from now on.
    pub fn closed(&self, why: &str) {
        self.0.shut(why);
    }
}

impl CdpPage {
    /// A page of an embedded browser. Nothing is sent until the page is used.
    pub fn embedded() -> EmbeddedLink {
        let (outbox, to_browser) = mpsc::unbounded_channel();
        let conn = Arc::new(Connection {
            next_id: AtomicU64::new(1),
            outbox,
            piped: false,
            state: Mutex::default(),
        });
        EmbeddedLink {
            page: Self {
                conn: conn.clone(),
                target: "".into(),
                session: "".into(),
            },
            to_browser,
            from_browser: FromBrowser(conn),
        }
    }

    /// Asks an embedded browser for the events a page load is known by.
    /// To be called once the browser is there, before the page is driven.
    pub async fn prepare(&self) -> Result<()> {
        for (method, params) in [
            ("Page.enable", json!({})),
            ("Page.setLifecycleEventsEnabled", json!({ "enabled": true })),
        ] {
            self.call(method, params).await?;
        }
        Ok(())
    }

    /// True for the page of an embedded browser, which is no tab of a Chrome.
    fn is_embedded(&self) -> bool {
        self.target.is_empty()
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value> {
        self.conn
            .call(Some(&self.session), method, params, COMMAND_TIMEOUT)
            .await
    }

    /// Sends the tab to `url` and waits for the page to load. `Some` is
    /// Chrome's reason for a page it could not load; the tab then shows
    /// Chrome's error page.
    async fn load(&self, url: &str) -> Result<Option<String>> {
        // Listening starts before the request so no event can be missed.
        let mut events = self.conn.listen(&self.session);
        // A page with unsaved changes may ask "Leave site?", and Chrome then
        // holds the navigation until someone answers. Whoever calls this has
        // decided to leave, so the answer is yes.
        let mut early = Vec::new();
        let reply = {
            let navigate = self.call("Page.navigate", json!({ "url": url }));
            tokio::pin!(navigate);
            loop {
                tokio::select! {
                    reply = &mut navigate => break reply?,
                    Some(event) = events.recv() => {
                        if event.method == "Page.javascriptDialogOpening"
                            && event.params["type"] == "beforeunload"
                        {
                            let leave = json!({ "accept": true });
                            let _ = self.call("Page.handleJavaScriptDialog", leave).await;
                        } else {
                            early.push(event);
                        }
                    }
                }
            }
        };
        if let Some(reason) = reply["errorText"].as_str() {
            return Ok(Some(reason.to_owned()));
        }
        let frame = text(&reply, "frameId")?;
        // No new document: only the part of the address after `#` changed.
        let Some(mut loader) = reply["loaderId"].as_str().map(str::to_owned) else {
            return Ok(None);
        };
        let mut committed = false;
        let loaded = async {
            let mut early = early.into_iter();
            loop {
                // What arrived while the request was pending comes first.
                let event = match early.next() {
                    Some(event) => event,
                    None => match events.recv().await {
                        Some(event) => event,
                        None => break,
                    },
                };
                let params = &event.params;
                match event.method.as_str() {
                    "Page.frameNavigated" if params["frame"]["id"] == frame => {
                        let now = params["frame"]["loaderId"].as_str().unwrap_or_default();
                        if now == loader {
                            committed = true;
                        } else if committed {
                            // The page sent itself on before it had loaded;
                            // the page to wait for is where it went.
                            loader = now.to_owned();
                        }
                    }
                    "Page.lifecycleEvent"
                        if params["name"] == "load"
                            && params["frameId"] == frame
                            && params["loaderId"] == loader.as_str() =>
                    {
                        return true;
                    }
                    _ => {}
                }
            }
            false
        };
        match timeout(LOAD_TIMEOUT, loaded).await {
            Ok(true) => Ok(None),
            Ok(false) => Err(self.conn.ended(TAB_CLOSED)),
            Err(_) => Err(Error::Browser(format!(
                "{url} did not finish loading within {} seconds",
                LOAD_TIMEOUT.as_secs()
            ))),
        }
    }
}

#[async_trait]
impl PageDriver for CdpPage {
    async fn url(&self) -> Result<String> {
        if self.is_embedded() {
            return Ok(self
                .eval("location.href")
                .await?
                .as_str()
                .unwrap_or_default()
                .to_owned());
        }
        // Asked of the browser rather than the page, so that a page too busy
        // to answer does not hold up a look across the tabs.
        let reply = self
            .conn
            .call(
                None,
                "Target.getTargetInfo",
                json!({ "targetId": &*self.target }),
                COMMAND_TIMEOUT,
            )
            .await?;
        Ok(reply["targetInfo"]["url"]
            .as_str()
            .unwrap_or_default()
            .to_owned())
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        match self.load(url).await? {
            None => Ok(()),
            Some(reason) => Err(Error::Browser(format!("cannot open {url}: {reason}"))),
        }
    }

    async fn eval(&self, expression: &str) -> Result<Value> {
        let params = json!({
            "expression": expression,
            "awaitPromise": true,
            "returnByValue": true,
        });
        let reply = self
            .conn
            .call(
                Some(&self.session),
                "Runtime.evaluate",
                params,
                EVAL_TIMEOUT,
            )
            .await?;
        value_of(reply)
    }

    async fn eval_in_frame(&self, frame: &str, expression: &str) -> Result<Value> {
        self.eval_in_frames(&[frame], expression).await
    }

    async fn eval_in_frames(&self, frames: &[&str], expression: &str) -> Result<Value> {
        let no_frame = || Error::Page("The frame was not found on the page.".into());
        // Where the innermost frame so far runs its scripts: in this tab or
        // in a target of its own, and there in the page or in a frame of it.
        let mut target: Option<CdpPage> = None;
        let mut scope = Scope::Page;
        for frame in frames {
            let page = target.as_ref().unwrap_or(self);
            // The frame's element, kept as a handle rather than brought back.
            let element = page.handle_in(&scope, frame).await?;
            let entered = match &element {
                Some(element) => page.enter_frame(element).await,
                None => Err(no_frame()),
            };
            // The handles were for that one step.
            if let Some(element) = &element {
                page.release(element).await;
            }
            if let Scope::Document(document) = &scope {
                page.release(document).await;
            }
            let (inner, within) = entered?;
            if inner.is_some() {
                target = inner;
            }
            scope = within;
        }
        let page = target.as_ref().unwrap_or(self);
        let value = page.value_in(&scope, expression).await;
        if let Scope::Document(document) = &scope {
            page.release(document).await;
        }
        value
    }
}

/// Where in a target a script is run.
enum Scope {
    /// In the target's own page.
    Page,
    /// In a frame that Chrome runs in the page's own process, by a handle
    /// on the frame's document: a function called on it runs in the frame.
    Document(String),
}

impl CdpPage {
    /// A handle on the object `expression` gives in `scope`. `None` if it
    /// throws or gives no object.
    async fn handle_in(&self, scope: &Scope, expression: &str) -> Result<Option<String>> {
        let found = match scope {
            Scope::Page => {
                let params = json!({ "expression": expression, "returnByValue": false });
                self.call("Runtime.evaluate", params).await?
            }
            Scope::Document(document) => {
                let params = json!({
                    "objectId": document,
                    "functionDeclaration": format!("function() {{ return ({expression}\n); }}"),
                    "returnByValue": false,
                });
                self.call("Runtime.callFunctionOn", params).await?
            }
        };
        if found.get("exceptionDetails").is_some() {
            return Ok(None);
        }
        Ok(found["result"]["objectId"].as_str().map(str::to_owned))
    }

    /// What `expression` gives in `scope`, as [`PageDriver::eval`] gives it
    /// in the page.
    async fn value_in(&self, scope: &Scope, expression: &str) -> Result<Value> {
        let Scope::Document(document) = scope else {
            return self.eval(expression).await;
        };
        let params = json!({
            "objectId": document,
            "functionDeclaration": format!("function() {{ return ({expression}\n); }}"),
            "awaitPromise": true,
            "returnByValue": true,
        });
        let reply = self
            .conn
            .call(
                Some(&self.session),
                "Runtime.callFunctionOn",
                params,
                EVAL_TIMEOUT,
            )
            .await?;
        value_of(reply)
    }

    async fn release(&self, object: &str) {
        let _ = self
            .call("Runtime.releaseObject", json!({ "objectId": object }))
            .await;
    }

    /// Where the frame runs its scripts whose element `element` is a handle
    /// on: in this target, by its document, or in a target of its own.
    async fn enter_frame(&self, element: &str) -> Result<(Option<CdpPage>, Scope)> {
        let no_frame = || Error::Page("The frame was not found on the page.".into());
        let mut described = self
            .call("DOM.describeNode", json!({ "objectId": element }))
            .await?;
        let node = described["node"].take();

        // A frame that Chrome runs in the page's own process: its document
        // is at hand.
        if let Some(document) = node["contentDocument"]["backendNodeId"].as_i64() {
            let resolved = self
                .call("DOM.resolveNode", json!({ "backendNodeId": document }))
                .await?;
            let document = text(&resolved["object"], "objectId")?;
            return Ok((None, Scope::Document(document.to_owned())));
        }
        // A frame showing another site runs in a process of its own, and is
        // a target of its own, named after the frame.
        let frame_id = node["frameId"].as_str().ok_or_else(no_frame)?;
        let started = Instant::now();
        loop {
            // Chrome only has a target for such a frame once it has been
            // asked what targets there are, and just after the page loaded
            // the frame may not be among them yet.
            self.conn
                .call(None, "Target.getTargets", json!({}), COMMAND_TIMEOUT)
                .await?;
            match self.conn.tab(frame_id).await {
                Ok(inner) => return Ok((Some(inner), Scope::Page)),
                Err(_) if started.elapsed() < FRAME_WAIT && !self.conn.is_closed() => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Err(_) => return Err(no_frame()),
            }
        }
    }
}

/// The value a script gave, or what it threw.
fn value_of(mut reply: Value) -> Result<Value> {
    if let Some(thrown) = reply.get("exceptionDetails") {
        let message = thrown["exception"]["description"]
            .as_str()
            .or(thrown["text"].as_str())
            .unwrap_or("the script threw");
        return Err(Error::Script(message.to_owned()));
    }
    // `undefined` has no JSON form; treat it as null.
    Ok(reply
        .pointer_mut("/result/value")
        .map(Value::take)
        .unwrap_or_default())
}

#[async_trait]
impl InputDriver for CdpPage {
    async fn click_at(&self, x: f64, y: f64) -> Result<()> {
        for kind in ["mouseMoved", "mousePressed", "mouseReleased"] {
            let mut event = json!({ "type": kind, "x": x, "y": y });
            if kind != "mouseMoved" {
                event["button"] = "left".into();
                event["clickCount"] = 1.into();
            }
            self.call("Input.dispatchMouseEvent", event).await?;
        }
        Ok(())
    }

    async fn insert_text(&self, text: &str) -> Result<()> {
        self.call("Input.insertText", json!({ "text": text }))
            .await?;
        Ok(())
    }

    async fn press_key(&self, key: &str) -> Result<()> {
        let Key { code, number, text } =
            key_named(key).ok_or_else(|| Error::Browser(format!("no such key: {key}")))?;
        let mut event = json!({
            // A key that types something is sent with its text; any other is
            // sent "raw", which is what makes Tab, Enter and the arrows act.
            "type": if text.is_some() { "keyDown" } else { "rawKeyDown" },
            "key": key,
            "code": code,
            "windowsVirtualKeyCode": number,
            "nativeVirtualKeyCode": number,
        });
        if let Some(text) = text {
            event["text"] = text.into();
        }
        self.call("Input.dispatchKeyEvent", event.clone()).await?;
        event["type"] = "keyUp".into();
        self.call("Input.dispatchKeyEvent", event).await?;
        Ok(())
    }

    async fn screenshot_png(&self) -> Result<Vec<u8>> {
        // Chrome only paints the tab in front. An embedded page is the
        // only one there is.
        if !self.is_embedded() {
            let front = json!({ "targetId": &*self.target });
            self.conn
                .call(None, "Target.activateTarget", front, COMMAND_TIMEOUT)
                .await?;
        }
        let reply = self
            .call("Page.captureScreenshot", json!({ "format": "png" }))
            .await?;
        BASE64
            .decode(text(&reply, "data")?)
            .map_err(|e| Error::Browser(format!("Chrome sent a picture that cannot be read: {e}")))
    }
}

// ---------------------------------------------------------------------------
// The connection
// ---------------------------------------------------------------------------

/// The pipe to Chrome, shared by the browser and all its tabs.
struct Connection {
    next_id: AtomicU64,
    /// Messages for the task that writes to Chrome. Never full, so a Chrome
    /// that has stopped reading cannot block whoever sends.
    outbox: mpsc::UnboundedSender<Vec<u8>>,
    /// True for the pipe to a Chrome, where each message ends with a zero
    /// byte. False where an embedded browser is handed whole messages.
    piped: bool,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    /// Why the connection ended, once it has.
    closed: Option<String>,
    /// Commands waiting for their reply, by id.
    pending: HashMap<u64, Pending>,
    /// Who wants the events of each session.
    listeners: HashMap<String, Vec<mpsc::UnboundedSender<Event>>>,
    /// The session attached to each tab, by target id.
    tabs: HashMap<String, Arc<str>>,
}

struct Pending {
    session: Option<String>,
    reply: oneshot::Sender<Result<Value>>,
}

#[derive(Clone)]
struct Event {
    method: String,
    params: Value,
}

/// A reply or an event, as Chrome writes it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Incoming {
    id: Option<u64>,
    method: Option<String>,
    #[serde(default)]
    params: Value,
    #[serde(default)]
    result: Value,
    error: Option<ProtocolError>,
    session_id: Option<String>,
}

#[derive(Deserialize)]
struct ProtocolError {
    message: String,
}

/// Takes a command off the waiting list when its caller stops waiting,
/// whether it was answered, timed out, or was dropped half way.
struct Forget<'a>(&'a Connection, u64);

impl Drop for Forget<'_> {
    fn drop(&mut self) {
        self.0.state().pending.remove(&self.1);
    }
}

impl Connection {
    fn state(&self) -> MutexGuard<'_, State> {
        // Nothing panics while holding the lock, and the state is sound
        // between statements anyway.
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn is_closed(&self) -> bool {
        self.state().closed.is_some()
    }

    /// The error for something cut short: why the connection ended, or
    /// `otherwise` if it is still up.
    fn ended(&self, otherwise: &str) -> Error {
        Error::Browser(
            self.state()
                .closed
                .clone()
                .unwrap_or_else(|| otherwise.to_owned()),
        )
    }

    /// Sends a command, to a tab's session or to the browser itself, and
    /// waits at most `limit` for the reply.
    async fn call(
        &self,
        session: Option<&str>,
        method: &str,
        params: Value,
        limit: Duration,
    ) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let mut message = json!({ "id": id, "method": method, "params": params });
        // An embedded browser's one page has no session to name.
        if let Some(session) = session.filter(|session| !session.is_empty()) {
            message["sessionId"] = session.into();
        }
        let mut bytes = serde_json::to_vec(&message)?;
        if self.piped {
            bytes.push(0);
        }

        let (reply, answer) = oneshot::channel();
        {
            let mut state = self.state();
            if let Some(why) = &state.closed {
                return Err(Error::Browser(why.clone()));
            }
            let session = session.map(str::to_owned);
            state.pending.insert(id, Pending { session, reply });
        }
        let _forget = Forget(self, id);
        if self.outbox.send(bytes).is_err() {
            return Err(self.ended(EXITED));
        }
        match timeout(limit, answer).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(self.ended(EXITED)),
            Err(_) => Err(Error::Browser(format!(
                "Chrome did not answer {method} within {} seconds",
                limit.as_secs()
            ))),
        }
    }

    /// The events of one session from now on, until the receiver is dropped.
    fn listen(&self, session: &str) -> mpsc::UnboundedReceiver<Event> {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut state = self.state();
        if state.closed.is_none() {
            // A listener that has gone is otherwise only noticed by the next
            // event for its session, which for a closed tab never comes.
            state.listeners.retain(|_, listeners| {
                listeners.retain(|listener| !listener.is_closed());
                !listeners.is_empty()
            });
            state
                .listeners
                .entry(session.to_owned())
                .or_default()
                .push(sender);
        }
        receiver
    }

    /// The tabs currently open.
    async fn tabs(self: &Arc<Self>) -> Result<Vec<CdpPage>> {
        let reply = self
            .call(None, "Target.getTargets", json!({}), COMMAND_TIMEOUT)
            .await?;
        let mut pages = Vec::new();
        for target in reply["targetInfos"].as_array().into_iter().flatten() {
            // A page being loaded ahead of time is also a "page", with a
            // subtype; it is not a tab the teacher can see.
            let is_tab = target["type"] == "page"
                && target["subtype"].as_str().unwrap_or_default().is_empty();
            let Some(id) = target["targetId"].as_str().filter(|_| is_tab) else {
                continue;
            };
            match self.tab(id).await {
                Ok(page) => pages.push(page),
                Err(error) if self.is_closed() => return Err(error),
                // Closed between being listed and being attached to.
                Err(_) => {}
            }
        }
        Ok(pages)
    }

    /// The tab with this target id, attaching to it on first use.
    async fn tab(self: &Arc<Self>, target: &str) -> Result<CdpPage> {
        let known = self.state().tabs.get(target).cloned();
        let session = match known {
            Some(session) => session,
            None => {
                let attaching = json!({ "targetId": target, "flatten": true });
                let reply = self
                    .call(None, "Target.attachToTarget", attaching, COMMAND_TIMEOUT)
                    .await?;
                let session: Arc<str> = text(&reply, "sessionId")?.into();
                // Page events are how a load is known to have finished.
                for (method, params) in [
                    ("Page.enable", json!({})),
                    ("Page.setLifecycleEventsEnabled", json!({ "enabled": true })),
                ] {
                    self.call(Some(&session), method, params, COMMAND_TIMEOUT)
                        .await?;
                }
                self.state().tabs.insert(target.to_owned(), session.clone());
                session
            }
        };
        Ok(CdpPage {
            conn: self.clone(),
            target: target.into(),
            session,
        })
    }

    /// Handles one message from Chrome.
    fn dispatch(&self, bytes: &[u8]) {
        // A message this client cannot read is not worth losing the
        // connection over; whoever waits for it runs into their time limit.
        let Ok(message) = serde_json::from_slice::<Incoming>(bytes) else {
            return;
        };
        let mut state = self.state();
        if let Some(id) = message.id {
            if let Some(pending) = state.pending.remove(&id) {
                let _ = pending.reply.send(match message.error {
                    Some(error) => Err(Error::Browser(error.message)),
                    None => Ok(message.result),
                });
            }
            return;
        }
        let Some(method) = message.method else {
            return;
        };
        if method == "Target.detachedFromTarget" {
            // Chrome does not answer what a closed tab was still asked.
            if let Some(session) = message.params["sessionId"].as_str() {
                state.end_session(session);
            }
        } else if let Some(listeners) = state
            .listeners
            // An embedded browser's one page sends its events with no session.
            .get_mut(message.session_id.as_deref().unwrap_or_default())
        {
            let event = Event {
                method,
                params: message.params,
            };
            listeners.retain(|listener| listener.send(event.clone()).is_ok());
        }
    }

    /// Ends the connection: everything waiting fails with `why`, as does
    /// everything asked from now on. The first reason given is kept.
    fn shut(&self, why: &str) {
        let mut state = self.state();
        if state.closed.is_some() {
            return;
        }
        state.closed = Some(why.to_owned());
        for (_, pending) in state.pending.drain() {
            let _ = pending.reply.send(Err(Error::Browser(why.to_owned())));
        }
        state.listeners.clear();
        state.tabs.clear();
    }
}

impl State {
    /// Fails what is waiting on a tab that has gone, and forgets the tab.
    fn end_session(&mut self, session: &str) {
        let waiting = self
            .pending
            .extract_if(|_, pending| pending.session.as_deref() == Some(session));
        for (_, pending) in waiting {
            let _ = pending.reply.send(Err(Error::Browser(TAB_CLOSED.into())));
        }
        self.listeners.remove(session);
        self.tabs.retain(|_, attached| &**attached != session);
    }
}

async fn read_loop(conn: Arc<Connection>, from_chrome: ChildStdout) {
    let mut from_chrome = BufReader::new(from_chrome);
    let mut message = Vec::new();
    // Every message ends with a NUL; one that does not is the pipe ending.
    while from_chrome.read_until(0, &mut message).await.is_ok() && message.pop() == Some(0) {
        conn.dispatch(&message);
        message.clear();
        // A screenshot is megabytes; do not keep that much for good.
        message.shrink_to(64 * 1024);
    }
    conn.shut(EXITED);
}

async fn write_loop(mut to_chrome: ChildStdin, mut queued: mpsc::UnboundedReceiver<Vec<u8>>) {
    while let Some(bytes) = queued.recv().await {
        // Chrome has gone; the reader and the process task say so.
        if to_chrome.write_all(&bytes).await.is_err() {
            break;
        }
    }
}

/// Owns the Chrome process: notices when it exits, and once `quit` fires or
/// is dropped makes sure that it does. If this task is itself dropped, with
/// the runtime, the process is killed.
async fn supervise(mut child: Child, conn: Arc<Connection>, quit: oneshot::Receiver<()>) {
    tokio::select! {
        _ = child.wait() => {}
        _ = quit => {
            // Chrome quits by itself when its pipe closes, having written the
            // profile out. Killing it is for a Chrome that is stuck.
            if timeout(EXIT_TIMEOUT, child.wait()).await.is_err() {
                let _ = child.kill().await;
            }
        }
    }
    conn.shut(EXITED);
}

/// The text of an error, without the "browser:" it would be given again.
fn reason(error: Error) -> String {
    match error {
        Error::Browser(message) => message,
        other => other.to_string(),
    }
}

/// A string Chrome must have put in `reply`.
fn text<'a>(reply: &'a Value, field: &str) -> Result<&'a str> {
    reply[field]
        .as_str()
        .ok_or_else(|| Error::Browser(format!("Chrome's reply has no {field}")))
}

// ---------------------------------------------------------------------------
// Starting Chrome
// ---------------------------------------------------------------------------

const NOT_ON_THIS_SYSTEM: &str = "Starting Chrome is not supported yet on Windows.";

/// Starts Chrome with its debugging pipe, and returns the two ends of it.
#[cfg(unix)]
fn spawn(executable: &Path, args: &[OsString]) -> Result<(Child, ChildStdin, ChildStdout)> {
    use std::process::Stdio;

    fn check(returned: libc::c_int) -> std::io::Result<libc::c_int> {
        if returned == -1 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(returned)
        }
    }

    let mut command = tokio::process::Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    // Chrome wants the pipe on descriptors 3 and 4, but a child can only be
    // handed pipes as its standard input and output. So it is given those,
    // and just before it becomes Chrome they are copied to 3 and 4 and
    // standard input and output are pointed at nothing.
    //
    // SAFETY: the closure runs in the forked child before exec, and makes
    // only async-signal-safe calls (dup2, open, close) without allocating.
    unsafe {
        command.pre_exec(|| {
            // The copies are made from 0 and 1, so never from 3 or 4, and
            // `dup2` leaves close-on-exec off on the copy alone: whatever
            // else the app has open still closes when Chrome starts. Should
            // 3 or 4 be something of the app's, only the child loses it.
            check(libc::dup2(0, 3))?;
            check(libc::dup2(1, 4))?;
            let nothing = check(libc::open(c"/dev/null".as_ptr(), libc::O_RDWR))?;
            check(libc::dup2(nothing, 0))?;
            check(libc::dup2(nothing, 1))?;
            libc::close(nothing);
            Ok(())
        });
    }
    let mut child = command
        .spawn()
        .map_err(|e| Error::Browser(format!("cannot start {}: {e}", executable.display())))?;
    match (child.stdin.take(), child.stdout.take()) {
        (Some(to_chrome), Some(from_chrome)) => Ok((child, to_chrome, from_chrome)),
        _ => Err(Error::Browser("Chrome was started without its pipe".into())),
    }
}

// Windows passes the pipe as inherited handles named on the command line,
// which is yet to be written.
#[cfg(not(unix))]
fn spawn(_: &Path, _: &[OsString]) -> Result<(Child, ChildStdin, ChildStdout)> {
    Err(Error::Browser(NOT_ON_THIS_SYSTEM.into()))
}

/// What Chrome, Chromium and Edge are called on the `PATH`, in order of
/// preference.
const BROWSER_NAMES: &[&str] = if cfg!(windows) {
    &["chrome.exe", "chromium.exe", "msedge.exe"]
} else {
    &[
        "google-chrome-stable",
        "google-chrome",
        "chrome",
        "chrome-browser",
        "chromium",
        "chromium-browser",
        "microsoft-edge-stable",
        "microsoft-edge",
        "msedge",
    ]
};

/// Where they are installed when they are not on the `PATH`.
fn usual_places() -> Vec<PathBuf> {
    let folders = |names: &[&str]| -> Vec<PathBuf> {
        let named = names.iter().filter_map(std::env::var_os);
        named.map(PathBuf::from).collect()
    };
    let (roots, programs): (Vec<PathBuf>, &[&str]) = if cfg!(windows) {
        (
            folders(&["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"]),
            &[
                r"Google\Chrome\Application\chrome.exe",
                r"Chromium\Application\chrome.exe",
                r"Microsoft\Edge\Application\msedge.exe",
            ],
        )
    } else if cfg!(target_os = "macos") {
        let mut roots = vec![PathBuf::from("/Applications")];
        roots.extend(
            folders(&["HOME"])
                .iter()
                .map(|home| home.join("Applications")),
        );
        (
            roots,
            &[
                "Google Chrome.app/Contents/MacOS/Google Chrome",
                "Chromium.app/Contents/MacOS/Chromium",
                "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ],
        )
    } else {
        (
            vec![PathBuf::from("/")],
            &[
                "opt/google/chrome/chrome",
                "opt/chromium.org/chromium/chrome",
                "snap/bin/chromium",
                "opt/microsoft/msedge/msedge",
            ],
        )
    };
    programs
        .iter()
        .flat_map(|program| roots.iter().map(move |root| root.join(program)))
        .collect()
}

/// Finds an installed Chrome, Chromium or Edge.
fn find_browser() -> Result<PathBuf> {
    // `CHROME` is the customary way to say which browser to use.
    let chosen = std::env::var_os("CHROME").map(PathBuf::from);
    let path: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    let on_path = BROWSER_NAMES
        .iter()
        .flat_map(|name| path.iter().map(move |folder| folder.join(name)));
    let places = usual_places();
    chosen
        .into_iter()
        .chain(on_path)
        .chain(places.iter().cloned())
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            let places: Vec<_> = places.iter().map(|p| p.display().to_string()).collect();
            Error::Browser(format!(
                "No Chrome, Chromium or Edge was found. Looked on the PATH for {}, and for {}. \
                 Install Chrome, or set the CHROME environment variable to the browser's program.",
                BROWSER_NAMES.join(", "),
                places.join(", ")
            ))
        })
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/// What Chrome needs to know about a key besides its name.
#[derive(Debug, PartialEq)]
struct Key {
    /// The physical key on a US keyboard, as in `KeyboardEvent.code`.
    code: String,
    /// The Windows virtual key code, which pages read as `keyCode`.
    number: u32,
    /// What pressing the key types, if anything.
    text: Option<String>,
}

/// Keys that type nothing: name, code and number.
const NAMED_KEYS: &[(&str, &str, u32)] = &[
    ("Backspace", "Backspace", 8),
    ("Tab", "Tab", 9),
    ("Enter", "Enter", 13),
    ("Shift", "ShiftLeft", 16),
    ("Control", "ControlLeft", 17),
    ("Alt", "AltLeft", 18),
    ("CapsLock", "CapsLock", 20),
    ("Escape", "Escape", 27),
    ("PageUp", "PageUp", 33),
    ("PageDown", "PageDown", 34),
    ("End", "End", 35),
    ("Home", "Home", 36),
    ("ArrowLeft", "ArrowLeft", 37),
    ("ArrowUp", "ArrowUp", 38),
    ("ArrowRight", "ArrowRight", 39),
    ("ArrowDown", "ArrowDown", 40),
    ("Insert", "Insert", 45),
    ("Delete", "Delete", 46),
    ("Meta", "MetaLeft", 91),
];

/// Keys with a symbol: the symbol, the one typed with Shift, code and number.
const SYMBOL_KEYS: &[(char, char, &str, u32)] = &[
    (';', ':', "Semicolon", 186),
    ('=', '+', "Equal", 187),
    (',', '<', "Comma", 188),
    ('-', '_', "Minus", 189),
    ('.', '>', "Period", 190),
    ('/', '?', "Slash", 191),
    ('`', '~', "Backquote", 192),
    ('[', '{', "BracketLeft", 219),
    ('\\', '|', "Backslash", 220),
    (']', '}', "BracketRight", 221),
    ('\'', '"', "Quote", 222),
];

/// The symbols typed with Shift and a digit, from 0 to 9.
const SHIFTED_DIGITS: &str = ")!@#$%^&*(";

/// Looks up a key by its DOM `KeyboardEvent.key` name: `"Enter"`, `"F5"`,
/// or a single character.
fn key_named(name: &str) -> Option<Key> {
    let key = |code: &str, number: u32, text: Option<&str>| Key {
        code: code.to_owned(),
        number,
        text: text.map(str::to_owned),
    };
    if let Some(&(_, code, number)) = NAMED_KEYS.iter().find(|(key, ..)| *key == name) {
        // Enter is the one named key that also types something.
        return Some(key(code, number, (name == "Enter").then_some("\r")));
    }
    let mut characters = name.chars();
    let (Some(character), None) = (characters.next(), characters.next()) else {
        let number = (1..=12).find(|number| name == format!("F{number}"))?;
        return Some(key(name, 111 + number, None));
    };
    let typed = Some(name);
    let digit = |digit: u32| key(&format!("Digit{digit}"), 48 + digit, typed);
    Some(if character.is_ascii_alphabetic() {
        let upper = character.to_ascii_uppercase();
        key(&format!("Key{upper}"), u32::from(upper), typed)
    } else if let Some(number) = character.to_digit(10) {
        digit(number)
    } else if let Some(number) = SHIFTED_DIGITS.find(character) {
        digit(u32::try_from(number).ok()?)
    } else if character == ' ' {
        key("Space", 32, typed)
    } else if let Some(&(.., code, number)) = SYMBOL_KEYS
        .iter()
        .find(|(plain, shifted, ..)| [*plain, *shifted].contains(&character))
    {
        key(code, number, typed)
    } else {
        // Not on a US keyboard. Chrome still types it.
        key("", 0, typed)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: &str, number: u32, text: Option<&str>) -> Option<Key> {
        Some(Key {
            code: code.into(),
            number,
            text: text.map(Into::into),
        })
    }

    #[test]
    fn keys_are_known_by_their_dom_names() {
        assert_eq!(key_named("Enter"), key("Enter", 13, Some("\r")));
        assert_eq!(key_named("Tab"), key("Tab", 9, None));
        assert_eq!(key_named("Backspace"), key("Backspace", 8, None));
        assert_eq!(key_named("ArrowDown"), key("ArrowDown", 40, None));
        assert_eq!(key_named("Escape"), key("Escape", 27, None));
        assert_eq!(key_named("F1"), key("F1", 112, None));
        assert_eq!(key_named("F12"), key("F12", 123, None));
        assert_eq!(key_named("F13"), None);
        assert_eq!(key_named("Fn"), None);
        assert_eq!(key_named("NoSuchKey"), None);
        assert_eq!(key_named(""), None);
    }

    #[test]
    fn a_single_character_is_the_key_that_types_it() {
        assert_eq!(key_named("a"), key("KeyA", 65, Some("a")));
        assert_eq!(key_named("Z"), key("KeyZ", 90, Some("Z")));
        assert_eq!(key_named("7"), key("Digit7", 55, Some("7")));
        assert_eq!(key_named("&"), key("Digit7", 55, Some("&")));
        assert_eq!(key_named(")"), key("Digit0", 48, Some(")")));
        assert_eq!(key_named(" "), key("Space", 32, Some(" ")));
        assert_eq!(key_named("?"), key("Slash", 191, Some("?")));
        assert_eq!(key_named("\\"), key("Backslash", 220, Some("\\")));
        assert_eq!(key_named("é"), key("", 0, Some("é")));
    }

    #[test]
    fn browsers_are_looked_for_in_whole_paths() {
        let places = usual_places();
        assert!(!places.is_empty());
        assert!(places.iter().all(|place| place.is_absolute()));
    }

    /// Stands in for an embedded browser: answers what it is asked, and
    /// keeps every message it was sent.
    fn pretend_browser(link: &mut EmbeddedLink) -> Arc<Mutex<Vec<Value>>> {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (kept, from_browser) = (seen.clone(), link.from_browser.clone());
        let mut to_browser = std::mem::replace(&mut link.to_browser, mpsc::unbounded_channel().1);
        tokio::spawn(async move {
            while let Some(bytes) = to_browser.recv().await {
                assert_ne!(bytes.last(), Some(&0), "a whole message, not a framed one");
                let message: Value = serde_json::from_slice(&bytes).unwrap();
                kept.lock().unwrap().push(message.clone());
                let reply = |result: Value| {
                    let answer = json!({ "id": message["id"], "result": result });
                    from_browser.message(answer.to_string().as_bytes());
                };
                match message["method"].as_str().unwrap_or_default() {
                    "Runtime.evaluate" => reply(json!({ "result": { "value": 42 } })),
                    "Page.navigate" => {
                        reply(json!({ "frameId": "F", "loaderId": "L" }));
                        // The page's events come with no session.
                        for event in [
                            json!({ "method": "Page.frameNavigated",
                                    "params": { "frame": { "id": "F", "loaderId": "L" } } }),
                            json!({ "method": "Page.lifecycleEvent",
                                    "params": { "name": "load", "frameId": "F", "loaderId": "L" } }),
                        ] {
                            from_browser.message(event.to_string().as_bytes());
                        }
                    }
                    _ => reply(json!({})),
                }
            }
        });
        seen
    }

    #[tokio::test]
    async fn an_embedded_page_is_driven_over_messages_someone_else_carries() {
        let mut link = CdpPage::embedded();
        let seen = pretend_browser(&mut link);
        let page = link.page.clone();

        page.prepare().await.unwrap();
        assert_eq!(page.eval("6 * 7").await.unwrap(), json!(42));
        // A load is over when the page's own events say so.
        page.navigate("https://example.edu/grade").await.unwrap();

        let seen = seen.lock().unwrap().clone();
        let methods: Vec<&str> = seen.iter().filter_map(|m| m["method"].as_str()).collect();
        assert_eq!(
            methods,
            [
                "Page.enable",
                "Page.setLifecycleEventsEnabled",
                "Runtime.evaluate",
                "Page.navigate"
            ]
        );
        assert!(
            seen.iter()
                .all(|message| message.get("sessionId").is_none()),
            "the one page of an embedded browser has no session to name"
        );
    }

    #[tokio::test]
    async fn an_embedded_browser_that_goes_away_fails_what_waits_for_it() {
        let link = CdpPage::embedded();
        let page = link.page.clone();
        let waiting = tokio::spawn(async move { page.eval("1").await });
        // The question is on its way before the browser goes.
        let mut to_browser = link.to_browser;
        to_browser.recv().await.expect("the question");
        link.from_browser
            .closed("The built-in browser was stopped.");
        let error = waiting.await.unwrap().unwrap_err();
        assert!(
            matches!(&error, Error::Browser(why) if why.contains("was stopped")),
            "{error}"
        );
        let after = link.page.eval("2").await.unwrap_err();
        assert!(matches!(after, Error::Browser(_)), "{after}");
    }
}
