//! A browser built into OGRE's window, for a build of OGRE that brings one.
//!
//! The usual build drives a Chrome of its own. A build that links a browser
//! engine hands the window a [`BuiltInBrowser`], and the teacher can then
//! choose to work in that instead. Nothing here knows which engine it is.
//!
//! The worker drives the built-in page with the driver it has for Chrome,
//! over the engine's own debugging channel (the DevTools protocol). The
//! browser lives on the window's thread, so the window carries the messages:
//! between frames, [`BuiltIn::pump`] hands the browser what the worker has
//! asked, and hands the worker what the browser has answered. That gives the
//! built-in page everything a Chrome tab has: scripts, real clicks and keys,
//! pictures of the page, the page's own questions, and frames.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use eframe::egui;
use ogre_harness::cdp::{CdpPage, DialogKind, FromBrowser, PageDialog};
use serde_json::{Value, json};
use tokio::sync::mpsc;

/// Something the built-in browser's page did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PageNews {
    /// A page started loading at this address.
    Loading(String),
    /// A page finished loading.
    Loaded(String),
    /// One message from the browser's debugging channel, as the JSON the
    /// browser wrote: the reply to something sent with
    /// [`BuiltInBrowser::send_devtools`], or an event.
    DevTools(Vec<u8>),
    /// The page asks something and stands still until it is answered with
    /// [`BuiltInBrowser::answer`].
    Asks(PageDialog),
    /// What the page asked was answered, or the page went away meanwhile.
    AsksNoMore,
}

/// For how long after OGRE sends the page somewhere a "Leave site?" is
/// answered with yes. Whoever sent it has decided to leave.
const LEAVING_TIME: Duration = Duration::from_secs(10);

/// A browser that draws a web page inside OGRE's window. Used from the
/// window's thread only.
pub trait BuiltInBrowser {
    /// Draws the page, `size` large, and lets the teacher use it.
    fn show(&mut self, ui: &mut egui::Ui, size: egui::Vec2);

    /// What the page did since this was last asked. Asked every frame,
    /// whether or not the page is drawn.
    fn news(&mut self) -> Vec<PageNews>;

    fn load(&mut self, url: &str) -> Result<(), String>;

    /// Sends one message of the DevTools protocol, as JSON, to the page's
    /// debugging channel. Its reply arrives as [`PageNews::DevTools`].
    fn send_devtools(&mut self, message: &[u8]) -> Result<(), String>;

    /// Answers what the page is asking. Nothing happens if it asks nothing.
    fn answer(&mut self, accept: bool);

    fn back(&mut self);
    fn forward(&mut self);
    fn reload(&mut self);

    /// Called after every frame, with what the frame produced. An engine
    /// that has to be told where its page sits is told here.
    fn after_frame(&mut self, ctx: &egui::Context, output: &egui::FullOutput);
}

/// The window's end of the built-in page's debugging channel: what the
/// worker wants sent to the browser, and where the browser's messages go.
pub struct PageChannel {
    to_browser: Mutex<mpsc::UnboundedReceiver<Vec<u8>>>,
    from_browser: FromBrowser,
}

/// The worker's end: the page to drive, and its messages for the browser,
/// which [`carry`] passes to the window.
pub struct PageLink {
    pub page: CdpPage,
    pub outgoing: PageOut,
}

/// The messages for the browser on their way to the window.
pub struct PageOut {
    from_page: mpsc::UnboundedReceiver<Vec<u8>>,
    to_window: mpsc::UnboundedSender<Vec<u8>>,
}

/// A built-in page for the worker to drive, and the window's end of it.
pub fn page_link() -> (PageLink, PageChannel) {
    let link = CdpPage::embedded();
    let (to_window, to_browser) = mpsc::unbounded_channel();
    (
        PageLink {
            page: link.page,
            outgoing: PageOut {
                from_page: link.to_browser,
                to_window,
            },
        },
        PageChannel {
            to_browser: Mutex::new(to_browser),
            from_browser: link.from_browser,
        },
    )
}

/// Passes each message for the browser on to the window and wakes it, for
/// as long as the page is driven. The browser only moves when the window
/// draws, so without the wake a message would wait for the next mouse move.
pub async fn carry(mut out: PageOut, wake: Arc<dyn Fn() + Send + Sync>) {
    while let Some(message) = out.from_page.recv().await {
        if out.to_window.send(message).is_err() {
            break;
        }
        wake();
    }
}

/// The built-in browser as the window holds it.
pub struct BuiltIn {
    browser: Box<dyn BuiltInBrowser>,
    /// Where the page is, for the address box.
    pub address: String,
    /// What the page is asking, until it is answered.
    pub asking: Option<PageDialog>,
    /// When the worker last sent the page to another address.
    sent_away: Option<Instant>,
}

impl BuiltIn {
    pub fn new(browser: Box<dyn BuiltInBrowser>) -> Self {
        Self {
            browser,
            address: String::new(),
            asking: None,
            sent_away: None,
        }
    }

    /// Answers what the page is asking, as the teacher chose.
    pub fn answer(&mut self, accept: bool) {
        self.asking = None;
        self.browser.answer(accept);
    }

    pub fn browser(&mut self) -> &mut dyn BuiltInBrowser {
        self.browser.as_mut()
    }

    /// Hands the browser what the worker has asked of the page since the
    /// last frame, and the worker what the browser has said. True if
    /// something was sent, so that the window comes back for the answer.
    pub fn pump(&mut self, channel: &PageChannel) -> bool {
        for news in self.browser.news() {
            match news {
                PageNews::Loading(address) | PageNews::Loaded(address) => self.address = address,
                PageNews::DevTools(message) => channel.from_browser.message(&message),
                PageNews::Asks(dialog) => {
                    let leaving = self.sent_away.is_some_and(|at| at.elapsed() < LEAVING_TIME);
                    if dialog.kind == DialogKind::Leave && leaving {
                        self.browser.answer(true);
                    } else {
                        self.asking = Some(dialog);
                    }
                }
                PageNews::AsksNoMore => self.asking = None,
            }
        }
        let mut to_browser = channel
            .to_browser
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut sent = false;
        while let Ok(message) = to_browser.try_recv() {
            sent = true;
            let asked = serde_json::from_slice::<Value>(&message).unwrap_or_default();
            if asked["method"] == "Page.navigate" {
                self.sent_away = Some(Instant::now());
            }
            if let Err(problem) = self.browser.send_devtools(&message) {
                // Whoever asked hears at once, not when their time runs out.
                if let Some(id) = asked.get("id").cloned() {
                    let refused = json!({ "id": id, "error": { "message": problem } });
                    channel.from_browser.message(refused.to_string().as_bytes());
                }
            }
        }
        sent
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::time::Duration;

    use ogre_harness::{Error, PageDriver};

    use super::*;

    /// What the pretend browser was told, and what it will say.
    #[derive(Default)]
    struct Told {
        sent: Vec<Value>,
        news: VecDeque<PageNews>,
        refuse: Option<String>,
        answers: Vec<bool>,
    }

    /// A browser that draws nothing and keeps what it is told.
    struct Pretend(Arc<Mutex<Told>>);

    impl BuiltInBrowser for Pretend {
        fn show(&mut self, _ui: &mut egui::Ui, _size: egui::Vec2) {}

        fn news(&mut self) -> Vec<PageNews> {
            self.0.lock().unwrap().news.drain(..).collect()
        }

        fn load(&mut self, _url: &str) -> Result<(), String> {
            Ok(())
        }

        fn send_devtools(&mut self, message: &[u8]) -> Result<(), String> {
            let mut told = self.0.lock().unwrap();
            if let Some(problem) = &told.refuse {
                return Err(problem.clone());
            }
            told.sent.push(serde_json::from_slice(message).unwrap());
            Ok(())
        }

        fn answer(&mut self, accept: bool) {
            self.0.lock().unwrap().answers.push(accept);
        }

        fn back(&mut self) {}
        fn forward(&mut self) {}
        fn reload(&mut self) {}
        fn after_frame(&mut self, _ctx: &egui::Context, _output: &egui::FullOutput) {}
    }

    struct Bench {
        told: Arc<Mutex<Told>>,
        built_in: BuiltIn,
        channel: PageChannel,
        page: CdpPage,
        woken: Arc<Mutex<usize>>,
    }

    /// A window with a pretend browser, and a worker's page linked to it.
    fn bench() -> Bench {
        let told = Arc::new(Mutex::new(Told::default()));
        let (link, channel) = page_link();
        let woken = Arc::new(Mutex::new(0));
        let count = woken.clone();
        tokio::spawn(carry(
            link.outgoing,
            Arc::new(move || *count.lock().unwrap() += 1),
        ));
        Bench {
            built_in: BuiltIn::new(Box::new(Pretend(told.clone()))),
            told,
            channel,
            page: link.page,
            woken,
        }
    }

    /// Runs the window's side until the worker's message has arrived there.
    async fn pump_until_sent(bench: &mut Bench) {
        for _ in 0..200 {
            if bench.built_in.pump(&bench.channel) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("nothing arrived for the browser");
    }

    #[tokio::test]
    async fn what_the_worker_asks_reaches_the_browser_and_its_answer_comes_back() {
        let mut bench = bench();
        let page = bench.page.clone();
        let asking = tokio::spawn(async move { page.eval("6 * 7").await });

        pump_until_sent(&mut bench).await;
        assert!(*bench.woken.lock().unwrap() >= 1, "the window was woken");
        let asked = bench.told.lock().unwrap().sent[0].clone();
        assert_eq!(asked["method"], "Runtime.evaluate");
        assert_eq!(asked["params"]["expression"], "6 * 7");

        // The browser answers on its debugging channel, by the next frame.
        let answer = json!({ "id": asked["id"], "result": { "result": { "value": 42 } } });
        bench
            .told
            .lock()
            .unwrap()
            .news
            .push_back(PageNews::DevTools(answer.to_string().into_bytes()));
        bench.built_in.pump(&bench.channel);
        assert_eq!(asking.await.unwrap().unwrap(), json!(42));
    }

    #[tokio::test]
    async fn a_browser_that_takes_no_message_fails_the_question_at_once() {
        let mut bench = bench();
        bench.told.lock().unwrap().refuse = Some("The built-in browser could not start.".into());
        let page = bench.page.clone();
        let asking = tokio::spawn(async move { page.eval("1").await });

        pump_until_sent(&mut bench).await;
        let error = tokio::time::timeout(Duration::from_secs(2), asking)
            .await
            .expect("an answer at once, not at the end of the time allowed")
            .unwrap()
            .unwrap_err();
        assert!(
            matches!(&error, Error::Browser(why) if why.contains("could not start")),
            "{error}"
        );
    }

    fn asks(kind: DialogKind, message: &str) -> PageNews {
        PageNews::Asks(PageDialog {
            kind,
            message: message.into(),
        })
    }

    #[tokio::test]
    async fn what_the_page_asks_waits_for_the_teacher() {
        let mut bench = bench();
        let question = asks(DialogKind::Confirm, "Delete this comment?");
        bench.told.lock().unwrap().news.push_back(question);
        bench.built_in.pump(&bench.channel);
        let asking = bench.built_in.asking.clone().expect("a question to show");
        assert_eq!(asking.message, "Delete this comment?");
        assert!(bench.told.lock().unwrap().answers.is_empty());

        bench.built_in.answer(false);
        assert_eq!(bench.built_in.asking, None);
        assert_eq!(bench.told.lock().unwrap().answers, [false]);

        // A question the page takes back is no longer shown.
        let news = [asks(DialogKind::Alert, "Saved."), PageNews::AsksNoMore];
        bench.told.lock().unwrap().news.extend(news);
        bench.built_in.pump(&bench.channel);
        assert_eq!(bench.built_in.asking, None);
    }

    #[tokio::test]
    async fn leaving_a_page_is_agreed_to_when_ogre_sent_it_away() {
        // The teacher's own click on a link: they are asked.
        let mut bench = bench();
        let leave = || asks(DialogKind::Leave, "");
        bench.told.lock().unwrap().news.push_back(leave());
        bench.built_in.pump(&bench.channel);
        assert!(bench.built_in.asking.is_some());
        bench.built_in.answer(false);

        // OGRE going to another question: whoever asked for that has
        // decided, and the page must not hold the move up.
        let page = bench.page.clone();
        let going = tokio::spawn(async move { page.navigate("https://school.example/q2").await });
        pump_until_sent(&mut bench).await;
        bench.told.lock().unwrap().news.push_back(leave());
        bench.built_in.pump(&bench.channel);
        assert_eq!(bench.built_in.asking, None);
        assert_eq!(bench.told.lock().unwrap().answers, [false, true]);
        going.abort();
    }

    #[tokio::test]
    async fn the_address_follows_the_page() {
        let mut bench = bench();
        let news = [
            PageNews::Loading("https://school.example/quiz".into()),
            PageNews::Loaded("https://school.example/quiz/grade".into()),
        ];
        bench.told.lock().unwrap().news.extend(news);
        assert!(!bench.built_in.pump(&bench.channel), "nothing was sent");
        assert_eq!(bench.built_in.address, "https://school.example/quiz/grade");
    }
}
