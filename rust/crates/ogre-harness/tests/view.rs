//! A tab shown somewhere other than Chrome's window: its picture arrives,
//! and mouse, keyboard and answers to the page's questions reach it.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness --test view -- --ignored

use std::path::PathBuf;
use std::time::Duration;

use ogre_harness::PageDriver;
use ogre_harness::cdp::{
    CdpPage, Chrome, DialogKind, Held, LaunchOptions, MouseAction, MouseButton, TabView, ViewEvent,
    ViewSize,
};
use tokio::time::timeout;

const PAGE: &str = r#"<!doctype html><html><head><title>First</title></head>
<body style="margin:0;font:16px sans-serif">
  <button id="toggle" style="position:absolute;left:20px;top:20px;width:160px;height:40px"
          onclick="document.body.dataset.on = document.body.dataset.on ? '' : 'yes'; document.body.style.background = document.body.dataset.on ? 'gold' : ''">Toggle</button>
  <input id="box" style="position:absolute;left:20px;top:80px;width:300px;height:30px">
  <button id="ask" style="position:absolute;left:20px;top:140px;width:160px;height:40px"
          onclick="document.body.dataset.answer = String(confirm('Really submit?'))">Ask</button>
  <a id="other" href="second.html" target="_blank" style="position:absolute;left:20px;top:200px">In a new tab</a>
  <div style="position:absolute;left:20px;top:2000px">Far down</div>
</body></html>"#;

fn folder(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ogre-test-view-{test}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("first.html"), PAGE).unwrap();
    std::fs::write(
        dir.join("second.html"),
        "<!doctype html><title>Second</title><body>Second page</body>",
    )
    .unwrap();
    dir
}

async fn shown(test: &str) -> (PathBuf, Chrome, CdpPage, TabView) {
    let dir = folder(test);
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: dir.join("profile"),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let page = chrome
        .open(&format!("file://{}/first.html", dir.display()))
        .await
        .unwrap();
    let size = ViewSize {
        width: 800,
        height: 600,
        scale: 1.0,
    };
    let view = page.view(size).await.unwrap();
    (dir, chrome, page, view)
}

/// The next event that `wanted` accepts, within a few seconds.
async fn wait_for<T>(view: &mut TabView, what: &str, wanted: impl Fn(ViewEvent) -> Option<T>) -> T {
    let found = timeout(Duration::from_secs(10), async {
        loop {
            let event = view.next().await.expect("the tab is still open");
            if let Some(found) = wanted(event) {
                return found;
            }
        }
    })
    .await;
    found.unwrap_or_else(|_| panic!("timed out waiting for {what}"))
}

async fn picture(view: &mut TabView) -> Vec<u8> {
    wait_for(view, "a picture", |event| match event {
        ViewEvent::Picture(jpeg) => Some(jpeg),
        _ => None,
    })
    .await
}

async fn moved(view: &mut TabView) -> String {
    wait_for(view, "the tab to move", |event| match event {
        ViewEvent::Moved(url) => Some(url),
        _ => None,
    })
    .await
}

async fn click(page: &CdpPage, x: f64, y: f64) {
    let held = Held::default();
    let button = MouseButton::Left;
    page.mouse(MouseAction::Move { held: false }, x, y, held)
        .await
        .unwrap();
    page.mouse(MouseAction::Press { button, clicks: 1 }, x, y, held)
        .await
        .unwrap();
    page.mouse(MouseAction::Release { button, clicks: 1 }, x, y, held)
        .await
        .unwrap();
}

async fn press(page: &CdpPage, key: &str, held: Held) {
    page.key(key, true, held).await.unwrap();
    page.key(key, false, held).await.unwrap();
}

async fn text_of(page: &CdpPage, expression: &str) -> String {
    let value = page.eval(expression).await.unwrap();
    value.as_str().unwrap_or_default().to_owned()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome"]
async fn the_tab_is_drawn_at_the_size_asked_and_again_when_it_changes() {
    let (dir, chrome, page, mut view) = shown("picture").await;
    let jpeg = picture(&mut view).await;
    assert_eq!(&jpeg[..3], [0xFF, 0xD8, 0xFF], "a JPEG");
    assert_eq!(page.eval("innerWidth").await.unwrap(), 800);

    click(&page, 100.0, 40.0).await;
    picture(&mut view).await;
    assert_eq!(text_of(&page, "document.body.dataset.on").await, "yes");

    let wider = ViewSize {
        width: 1000,
        height: 500,
        scale: 2.0,
    };
    view.resize(wider).await.unwrap();
    picture(&mut view).await;
    assert_eq!(page.eval("innerWidth").await.unwrap(), 1000);
    assert_eq!(page.eval("devicePixelRatio").await.unwrap(), 2);

    // The wheel scrolls the page under the pointer.
    page.mouse(
        MouseAction::Wheel { dx: 0.0, dy: 600.0 },
        400.0,
        300.0,
        Held::default(),
    )
    .await
    .unwrap();
    // Scrolling is animated, so it is waited for and not read at once.
    let scrolled = timeout(Duration::from_secs(10), async {
        loop {
            picture(&mut view).await;
            let at = page.eval("scrollY").await.unwrap().as_f64().unwrap();
            if at > 100.0 {
                return at;
            }
        }
    })
    .await;
    assert!(scrolled.is_ok(), "the page never scrolled");

    view.stop().await;
    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome"]
async fn typing_shortcuts_and_the_selection_reach_the_page() {
    let (dir, chrome, page, mut view) = shown("typing").await;
    picture(&mut view).await;
    click(&page, 100.0, 95.0).await;
    for key in ["H", "i", " ", "t", "h", "e", "r", "e"] {
        press(&page, key, Held::default()).await;
    }
    assert_eq!(text_of(&page, "box.value").await, "Hi there");
    press(&page, "Backspace", Held::default()).await;
    assert_eq!(text_of(&page, "box.value").await, "Hi ther");

    let ctrl = Held {
        ctrl: true,
        ..Held::default()
    };
    press(&page, "a", ctrl).await;
    assert_eq!(page.selected_text().await.unwrap(), "Hi ther");
    // Typing over the selection replaces it; the shortcut typed no "a".
    press(&page, "x", Held::default()).await;
    assert_eq!(text_of(&page, "box.value").await, "x");
    press(&page, "z", ctrl).await;
    assert_eq!(text_of(&page, "box.value").await, "Hi ther");

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome"]
async fn a_question_the_page_asks_is_passed_on_and_answered() {
    let (dir, chrome, page, mut view) = shown("dialog").await;
    picture(&mut view).await;
    for (accept, answer) in [(false, "false"), (true, "true")] {
        // The click does not come back until the question is answered.
        let clicking = tokio::spawn({
            let page = page.clone();
            async move { click(&page, 100.0, 160.0).await }
        });
        let dialog = wait_for(&mut view, "the question", |event| match event {
            ViewEvent::Asks(dialog) => Some(dialog),
            _ => None,
        })
        .await;
        assert_eq!(dialog.kind, DialogKind::Confirm);
        assert_eq!(dialog.message, "Really submit?");
        page.answer_dialog(accept).await.unwrap();
        wait_for(&mut view, "the answer", |event| {
            (event == ViewEvent::Answered).then_some(())
        })
        .await;
        clicking.await.unwrap();
        assert_eq!(text_of(&page, "document.body.dataset.answer").await, answer);
    }
    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome"]
async fn moving_about_is_reported_and_a_link_can_open_another_tab() {
    let (dir, chrome, page, mut view) = shown("moving").await;
    picture(&mut view).await;

    page.eval("location.href = 'second.html'").await.unwrap();
    assert!(moved(&mut view).await.ends_with("/second.html"));
    page.go_back().await.unwrap();
    assert!(moved(&mut view).await.ends_with("/first.html"));
    page.go_forward().await.unwrap();
    assert!(moved(&mut view).await.ends_with("/second.html"));
    page.go_back().await.unwrap();
    assert!(moved(&mut view).await.ends_with("/first.html"));
    // Nothing further back: this must not fail or hang.
    page.go_back().await.unwrap();

    // Chrome starts with a tab of its own, so there are two to begin with.
    let before = page.browser_tabs().await.unwrap();
    picture(&mut view).await;
    click(&page, 60.0, 208.0).await;
    let opened = timeout(Duration::from_secs(10), async {
        loop {
            let tabs = page.browser_tabs().await.unwrap();
            let new = tabs
                .into_iter()
                .find(|tab| !before.iter().any(|known| known.is_same_tab(tab)));
            if let Some(new) = new {
                return new;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("the link opened a tab");
    assert!(opened.url().await.unwrap().ends_with("/second.html"));

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
