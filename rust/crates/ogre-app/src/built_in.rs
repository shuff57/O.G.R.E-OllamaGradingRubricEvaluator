//! A browser built into OGRE's window, for a build of OGRE that brings one.
//!
//! The usual build drives a Chrome of its own. A build that links a browser
//! engine hands the window a [`BuiltInBrowser`], and the teacher can then
//! choose to work in that instead. Nothing here knows which engine it is.
//!
//! The browser lives on the window's thread, and the site adapters run on
//! the worker's. [`BuiltInPage`] is the worker's handle: it asks, over a
//! channel, for a script to be run or an address to be loaded, and the
//! window carries each request out between frames ([`BuiltIn::pump`]) and
//! sends the answer back. A script's value comes back through the one way a
//! page has to speak to its host, `window.ipc.postMessage`, as JSON.
//!
//! A page could post messages of its own. Each answer is matched by a number
//! the page cannot guess, and anything else it posts is ignored.

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use eframe::egui;
use ogre_harness::{Error, PageDriver, Result};
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

/// The longest a script may take to answer. As long as Chrome is given.
const SCRIPT_TIME: Duration = Duration::from_secs(120);
/// The longest a page may take to load.
const LOAD_TIME: Duration = Duration::from_secs(60);

/// Something the built-in browser's page did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PageNews {
    /// A page started loading at this address.
    Loading(String),
    /// A page finished loading.
    Loaded(String),
    /// Text the page passed to `window.ipc.postMessage`.
    Message(String),
}

/// A browser that draws a web page inside OGRE's window. Used from the
/// window's thread only.
pub trait BuiltInBrowser {
    /// Draws the page, `size` large, and lets the teacher use it.
    fn show(&mut self, ui: &mut egui::Ui, size: egui::Vec2);

    /// What the page did since this was last asked. Asked every frame,
    /// whether or not the page is drawn.
    fn news(&mut self) -> Vec<PageNews>;

    fn load(&mut self, url: &str) -> std::result::Result<(), String>;

    /// Runs `script` in the page. Nothing comes back from here: a script
    /// that has something to say posts it, and it arrives as
    /// [`PageNews::Message`].
    fn run_script(&mut self, script: &str) -> std::result::Result<(), String>;

    fn back(&mut self);
    fn forward(&mut self);
    fn reload(&mut self);

    /// Called after every frame, with what the frame produced. An engine
    /// that has to be told where its page sits is told here.
    fn after_frame(&mut self, ctx: &egui::Context, output: &egui::FullOutput);
}

enum Ask {
    /// Evaluate this JavaScript expression and give its value.
    Eval(String),
    /// Go to this address and say when the page has loaded.
    Load(String),
}

/// One thing the worker wants of the page, and where the answer goes.
pub struct Request {
    ask: Ask,
    reply: oneshot::Sender<std::result::Result<Value, String>>,
}

/// The window's end of the requests the worker makes of the page.
pub type Requests = Mutex<mpsc::UnboundedReceiver<Request>>;

/// The built-in browser's page, as the worker drives it.
#[derive(Clone)]
pub struct BuiltInPage {
    requests: mpsc::UnboundedSender<Request>,
    wake: Arc<dyn Fn() + Send + Sync>,
}

impl BuiltInPage {
    /// A page handle and the window's end of what it asks.
    pub fn new(wake: Arc<dyn Fn() + Send + Sync>) -> (Self, mpsc::UnboundedReceiver<Request>) {
        let (requests, inbox) = mpsc::unbounded_channel();
        (Self { requests, wake }, inbox)
    }

    async fn ask(&self, ask: Ask, limit: Duration) -> Result<Value> {
        let (reply, answer) = oneshot::channel();
        self.requests
            .send(Request { ask, reply })
            .map_err(|_| Error::Browser("OGRE's window is gone".into()))?;
        (self.wake)();
        match tokio::time::timeout(limit, answer).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(problem))) => Err(Error::Script(problem)),
            Ok(Err(_)) => Err(Error::Browser(
                "the built-in browser is not there to answer".into(),
            )),
            Err(_) => Err(Error::Browser(format!(
                "the built-in browser did not answer within {} seconds",
                limit.as_secs()
            ))),
        }
    }
}

#[async_trait]
impl PageDriver for BuiltInPage {
    async fn url(&self) -> Result<String> {
        let address = self.eval("location.href").await?;
        Ok(address.as_str().unwrap_or_default().to_owned())
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        self.ask(Ask::Load(with_scheme(url)), LOAD_TIME).await?;
        Ok(())
    }

    async fn eval(&self, expression: &str) -> Result<Value> {
        self.ask(Ask::Eval(expression.to_owned()), SCRIPT_TIME)
            .await
    }
}

/// An address as a browser's address bar would take it: "myopenmath.com"
/// is "https://myopenmath.com".
pub(crate) fn with_scheme(address: &str) -> String {
    let address = address.trim();
    if address.contains("://") || address.starts_with("about:") || address.starts_with("data:") {
        address.to_owned()
    } else {
        format!("https://{address}")
    }
}

/// The script that evaluates `expression` in the page and posts its value,
/// or what it threw, marked with `ticket`.
///
/// The expression is put in as code, not handed to `eval`: a page may forbid
/// `eval` in its content security policy, and this has to work there too.
fn script_for(ticket: &str, expression: &str) -> String {
    format!(
        r#"(async () => {{
  const say = (answer) => window.ipc.postMessage(JSON.stringify(Object.assign({{ ogre: "{ticket}" }}, answer)));
  try {{
    const value = await (
{expression}
);
    say({{ ok: true, value: value === undefined ? null : value }});
  }} catch (error) {{
    try {{ say({{ ok: false, error: String((error && error.message) || error) }}); }} catch (_) {{}}
  }}
}})()"#
    )
}

/// What a posted message says, if it is an answer to a script of OGRE's.
fn answer_in(message: &str) -> Option<(String, std::result::Result<Value, String>)> {
    let Value::Object(mut answer) = serde_json::from_str(message).ok()? else {
        return None;
    };
    let ticket = answer.get("ogre")?.as_str()?.to_owned();
    let outcome = if answer.get("ok").and_then(Value::as_bool)? {
        Ok(answer.remove("value").unwrap_or(Value::Null))
    } else {
        Err(answer
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("the script failed")
            .to_owned())
    };
    Some((ticket, outcome))
}

type Reply = oneshot::Sender<std::result::Result<Value, String>>;

/// A page the worker asked for, on its way.
struct Load {
    reply: Reply,
    asked: Instant,
    /// The blank page itself was asked for.
    to_blank: bool,
    /// The page has started to load. Until it has, a page that finishes
    /// loading is the one that was there before.
    started: bool,
}

impl Load {
    /// True if `address` can be the page that was asked for. A browser
    /// starts on a blank page, and that one loading is not it.
    fn can_be(&self, address: &str) -> bool {
        self.to_blank || address != BLANK
    }
}

const BLANK: &str = "about:blank";

/// The built-in browser as the window holds it: the engine, and the
/// requests of the worker that are waiting on it.
pub struct BuiltIn {
    browser: Box<dyn BuiltInBrowser>,
    /// Scripts that have not answered yet, by ticket.
    scripts: HashMap<String, (Reply, Instant)>,
    /// A load the worker asked for that has not finished.
    loading: Option<Load>,
    /// Where the page is, as last heard.
    pub address: String,
    /// Makes tickets a page cannot guess.
    tickets: std::collections::hash_map::RandomState,
    issued: u64,
}

impl BuiltIn {
    pub fn new(browser: Box<dyn BuiltInBrowser>) -> Self {
        Self {
            browser,
            scripts: HashMap::new(),
            loading: None,
            address: String::new(),
            tickets: std::collections::hash_map::RandomState::new(),
            issued: 0,
        }
    }

    pub fn browser(&mut self) -> &mut dyn BuiltInBrowser {
        &mut *self.browser
    }

    fn ticket(&mut self) -> String {
        self.issued += 1;
        let part = |salt: u64| {
            let mut hasher = self.tickets.build_hasher();
            hasher.write_u64(self.issued);
            hasher.write_u64(salt);
            hasher.finish()
        };
        format!("{:016x}{:016x}", part(1), part(2))
    }

    /// Carries out what the worker has asked of the page since the last
    /// frame, and passes the page's answers back. True while something is
    /// still waiting, so that the window keeps coming back.
    pub fn pump(&mut self, requests: &Requests) -> bool {
        for news in self.browser.news() {
            match news {
                PageNews::Loading(address) => {
                    // The page that scripts were running in is gone, and
                    // their answers with it.
                    for (_, (reply, _)) in self.scripts.drain() {
                        let _ = reply.send(Err(
                            "the page went somewhere else before the script answered".into(),
                        ));
                    }
                    if let Some(load) = self.loading.as_mut().filter(|load| load.can_be(&address)) {
                        load.started = true;
                    }
                    self.address = address;
                }
                PageNews::Loaded(address) => {
                    let arrived = self
                        .loading
                        .as_ref()
                        .is_some_and(|load| load.started && load.can_be(&address));
                    if arrived && let Some(load) = self.loading.take() {
                        let _ = load.reply.send(Ok(Value::Null));
                    }
                    self.address = address;
                }
                PageNews::Message(message) => {
                    if let Some((ticket, outcome)) = answer_in(&message)
                        && let Some((reply, _)) = self.scripts.remove(&ticket)
                    {
                        let _ = reply.send(outcome);
                    }
                }
            }
        }

        let waiting: Vec<Request> = {
            let mut inbox = requests
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            std::iter::from_fn(|| inbox.try_recv().ok()).collect()
        };
        for Request { ask, reply } in waiting {
            match ask {
                Ask::Eval(expression) => {
                    let ticket = self.ticket();
                    match self.browser.run_script(&script_for(&ticket, &expression)) {
                        Ok(()) => {
                            self.scripts.insert(ticket, (reply, Instant::now()));
                        }
                        Err(problem) => {
                            let _ = reply.send(Err(problem));
                        }
                    }
                }
                Ask::Load(address) => match self.browser.load(&address) {
                    Ok(()) => {
                        let load = Load {
                            reply,
                            asked: Instant::now(),
                            to_blank: address == BLANK,
                            started: false,
                        };
                        // An earlier load that this one cuts short is over.
                        if let Some(earlier) = self.loading.replace(load) {
                            let _ = earlier.reply.send(Ok(Value::Null));
                        }
                    }
                    Err(problem) => {
                        let _ = reply.send(Err(problem));
                    }
                },
            }
        }

        // The worker gives up on its own; what it gave up on is dropped here.
        self.scripts
            .retain(|_, (_, asked)| asked.elapsed() < SCRIPT_TIME + Duration::from_secs(5));
        if self
            .loading
            .as_ref()
            .is_some_and(|load| load.asked.elapsed() > LOAD_TIME + Duration::from_secs(5))
        {
            self.loading = None;
        }
        !self.scripts.is_empty() || self.loading.is_some()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    /// A browser that does nothing but remember what it was told, and says
    /// what the test has it say.
    #[derive(Default)]
    struct Told {
        scripts: Vec<String>,
        loads: Vec<String>,
        news: Vec<PageNews>,
    }

    struct Pretend(Arc<Mutex<Told>>);

    impl BuiltInBrowser for Pretend {
        fn show(&mut self, _: &mut egui::Ui, _: egui::Vec2) {}
        fn news(&mut self) -> Vec<PageNews> {
            std::mem::take(&mut self.0.lock().unwrap().news)
        }
        fn load(&mut self, url: &str) -> std::result::Result<(), String> {
            self.0.lock().unwrap().loads.push(url.to_owned());
            Ok(())
        }
        fn run_script(&mut self, script: &str) -> std::result::Result<(), String> {
            self.0.lock().unwrap().scripts.push(script.to_owned());
            Ok(())
        }
        fn back(&mut self) {}
        fn forward(&mut self) {}
        fn reload(&mut self) {}
        fn after_frame(&mut self, _: &egui::Context, _: &egui::FullOutput) {}
    }

    struct Bench {
        page: BuiltInPage,
        requests: Requests,
        built_in: BuiltIn,
        told: Arc<Mutex<Told>>,
        woken: Arc<AtomicUsize>,
    }

    fn bench() -> Bench {
        let woken = Arc::new(AtomicUsize::new(0));
        let count = woken.clone();
        let (page, inbox) = BuiltInPage::new(Arc::new(move || {
            count.fetch_add(1, Ordering::SeqCst);
        }));
        let told = Arc::new(Mutex::new(Told::default()));
        Bench {
            page,
            requests: Mutex::new(inbox),
            built_in: BuiltIn::new(Box::new(Pretend(told.clone()))),
            told,
            woken,
        }
    }

    /// The ticket of the script the browser was last given.
    fn ticket_of(told: &Mutex<Told>) -> String {
        let script = told.lock().unwrap().scripts.last().cloned().unwrap();
        let from = script.find("ogre: \"").unwrap() + 7;
        script[from..from + 32].to_owned()
    }

    #[tokio::test]
    async fn a_script_is_run_in_the_page_and_its_value_comes_back() {
        let mut bench = bench();
        let page = bench.page.clone();
        let asking = tokio::spawn(async move { page.eval("1 + 1").await });
        tokio::task::yield_now().await;
        while bench.woken.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
        assert!(bench.built_in.pump(&bench.requests), "an answer is awaited");
        {
            let told = bench.told.lock().unwrap();
            assert_eq!(told.scripts.len(), 1);
            // As code, between parentheses, so a page that forbids `eval`
            // runs it all the same.
            assert!(
                told.scripts[0].contains("await (\n1 + 1\n)"),
                "{}",
                told.scripts[0]
            );
            assert!(!told.scripts[0].contains("eval("));
        }

        // The page posts things of its own; none of it is the answer.
        let ticket = ticket_of(&bench.told);
        bench.told.lock().unwrap().news = vec![
            PageNews::Message("hello".into()),
            PageNews::Message(
                r#"{"ogre":"00000000000000000000000000000000","ok":true,"value":666}"#.into(),
            ),
            PageNews::Message(format!(r#"{{"ogre":"{ticket}","ok":true,"value":2}}"#)),
        ];
        assert!(
            !bench.built_in.pump(&bench.requests),
            "nothing is awaited now"
        );
        assert_eq!(asking.await.unwrap().unwrap(), serde_json::json!(2));
    }

    #[tokio::test]
    async fn what_a_script_throws_is_an_error_and_tickets_do_not_repeat() {
        let mut bench = bench();
        let mut tickets = Vec::new();
        for _ in 0..2 {
            let page = bench.page.clone();
            let asking = tokio::spawn(async move { page.eval("nothing.here").await });
            while bench.told.lock().unwrap().scripts.len() == tickets.len() {
                tokio::task::yield_now().await;
                bench.built_in.pump(&bench.requests);
            }
            let ticket = ticket_of(&bench.told);
            bench.told.lock().unwrap().news = vec![PageNews::Message(format!(
                r#"{{"ogre":"{ticket}","ok":false,"error":"nothing is not defined"}}"#
            ))];
            bench.built_in.pump(&bench.requests);
            let error = asking.await.unwrap().unwrap_err();
            assert!(
                matches!(&error, Error::Script(why) if why == "nothing is not defined"),
                "{error}"
            );
            tickets.push(ticket);
        }
        assert_ne!(tickets[0], tickets[1]);
        assert_eq!(tickets[0].len(), 32);
    }

    #[tokio::test]
    async fn going_somewhere_waits_for_the_page_to_load() {
        let mut bench = bench();
        let page = bench.page.clone();
        let going = tokio::spawn(async move { page.navigate("myopenmath.com/course").await });
        while bench.told.lock().unwrap().loads.is_empty() {
            tokio::task::yield_now().await;
            bench.built_in.pump(&bench.requests);
        }
        assert_eq!(
            bench.told.lock().unwrap().loads,
            ["https://myopenmath.com/course"],
            "an address typed without https is given it"
        );
        assert!(!going.is_finished());

        // The blank page the browser starts on finishes loading first, and
        // is not the page that was asked for.
        bench.told.lock().unwrap().news = vec![
            PageNews::Loading("about:blank".into()),
            PageNews::Loaded("about:blank".into()),
        ];
        assert!(bench.built_in.pump(&bench.requests));
        tokio::task::yield_now().await;
        assert!(!going.is_finished());

        bench.told.lock().unwrap().news = vec![
            PageNews::Loading("https://myopenmath.com/course".into()),
            PageNews::Loaded("https://www.myopenmath.com/course/".into()),
        ];
        bench.built_in.pump(&bench.requests);
        going.await.unwrap().unwrap();
        assert_eq!(bench.built_in.address, "https://www.myopenmath.com/course/");
    }

    #[tokio::test]
    async fn a_script_whose_page_goes_elsewhere_fails_at_once() {
        let mut bench = bench();
        let page = bench.page.clone();
        let asking = tokio::spawn(async move { page.eval("new Promise(() => {})").await });
        while bench.told.lock().unwrap().scripts.is_empty() {
            tokio::task::yield_now().await;
            bench.built_in.pump(&bench.requests);
        }
        // A new page starts loading: the old one cannot answer any more.
        bench.told.lock().unwrap().news = vec![PageNews::Loading("https://example.edu/".into())];
        assert!(!bench.built_in.pump(&bench.requests));
        let error = asking.await.unwrap().unwrap_err();
        assert!(error.to_string().contains("went somewhere else"), "{error}");
    }

    #[test]
    fn only_an_answer_shaped_message_is_an_answer() {
        assert_eq!(answer_in("not json"), None);
        assert_eq!(answer_in("[1, 2]"), None);
        assert_eq!(answer_in(r#"{"ok":true,"value":1}"#), None, "no ticket");
        assert_eq!(answer_in(r#"{"ogre":"t","value":1}"#), None, "no verdict");
        assert_eq!(
            answer_in(r#"{"ogre":"t","ok":true}"#),
            Some(("t".into(), Ok(Value::Null)))
        );
        assert_eq!(with_scheme(" about:blank "), "about:blank");
        assert_eq!(
            with_scheme("file:///tmp/page.html"),
            "file:///tmp/page.html"
        );
    }
}
