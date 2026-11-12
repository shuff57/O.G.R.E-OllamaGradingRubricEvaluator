//! The page shown inside OGRE's window, end to end: the real worker, a real
//! Chrome without a window, and the link the window draws from and sends
//! the teacher's mouse and keyboard through.
//!
//! Needs Chrome or Edge installed, so this is skipped by default:
//!     cargo test -p ogre-app --test page_inside -- --ignored

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use ogre_app::{Command, Event, ViewInput, ViewLink, Worker};
use ogre_harness::cdp::{DialogKind, Held, LaunchOptions, MouseAction, MouseButton, ViewSize};
use ogre_harness::sites::Sites;

const FIRST: &str = r#"<!doctype html><html><head><title>First</title></head>
<body style="margin:0;font:16px sans-serif;background:#ffffff">
  <form action="second.html" method="get">
    <input name="q" style="position:absolute;left:20px;top:20px;width:300px;height:30px">
  </form>
  <button style="position:absolute;left:20px;top:80px;width:200px;height:40px"
          onclick="if (confirm('Go on?')) document.body.style.background = '#2d6a4f'">Ask</button>
</body></html>"#;

fn folder(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ogre-test-inside-{test}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("first.html"), FIRST).unwrap();
    std::fs::write(
        dir.join("second.html"),
        "<!doctype html><title>Second</title><body>Second page</body>",
    )
    .unwrap();
    dir
}

/// Waits until `seen` finds what it is looking for in what the window is told.
fn wait_for<T>(
    view: &ViewLink,
    what: &str,
    seen: impl Fn(&mut ogre_app::ViewState) -> Option<T>,
) -> T {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if let Some(found) = seen(&mut view.state()) {
            return found;
        }
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(30));
    }
}

/// The colour in the middle of the newest picture, once one has arrived.
fn middle_of_next_picture(view: &ViewLink) -> [u8; 3] {
    wait_for(view, "a picture", |state| {
        let picture = state.picture.take()?;
        let [width, height] = picture.size;
        let at = ((height / 2) * width + width / 2) * 4;
        Some([picture.rgba[at], picture.rgba[at + 1], picture.rgba[at + 2]])
    })
}

fn click(view: &ViewLink, x: f64, y: f64) {
    let held = Held::default();
    let button = MouseButton::Left;
    for action in [
        MouseAction::Move { held: false },
        MouseAction::Press { button, clicks: 1 },
        MouseAction::Release { button, clicks: 1 },
    ] {
        view.send(ViewInput::Mouse { action, x, y, held });
    }
}

fn press(view: &ViewLink, name: &str) {
    for pressed in [true, false] {
        view.send(ViewInput::Key {
            name: name.into(),
            pressed,
            held: Held::default(),
        });
    }
}

#[test]
#[ignore = "needs Chrome installed"]
fn a_page_is_shown_used_and_answered_without_a_chrome_window() {
    let dir = folder("whole");
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: dir.join("chrome-profile"),
            // The worker makes it windowless because it is asked to show
            // the page inside; this alone would give it a window.
            headless: false,
            executable: None,
        },
        Sites::built_in(),
        dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    let ask = |command: Command| -> Event {
        worker.send(command);
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if let Some(event) = worker.poll().find(|event| !event.is_progress()) {
                return event;
            }
            let left = deadline.saturating_duration_since(Instant::now());
            // Pictures wake the window too, so a wake is not always an event.
            woken
                .recv_timeout(left)
                .expect("the worker answers in time");
        }
    };
    let view = worker.view().clone();

    assert!(matches!(
        ask(Command::StartChrome { inside: true }),
        Event::ChromeStarted
    ));
    view.send(ViewInput::Size(ViewSize {
        width: 900,
        height: 600,
        scale: 1.0,
    }));
    wait_for(&view, "a tab to be shown", |state| {
        state.showing.then_some(())
    });

    let first = format!("file://{}/first.html", dir.display());
    let Event::Opened(address) = ask(Command::Open(first.clone())) else {
        panic!("the page did not open");
    };
    assert_eq!(address, first);
    wait_for(&view, "the address to follow", |state| {
        (state.address == first).then_some(())
    });
    assert_eq!(middle_of_next_picture(&view)[0], 255, "a white page");

    // The page asks before it turns green, and waits for the answer.
    click(&view, 120.0, 100.0);
    let dialog = wait_for(&view, "the page's question", |state| state.dialog.clone());
    assert_eq!(
        (dialog.kind, dialog.message.as_str()),
        (DialogKind::Confirm, "Go on?")
    );
    // Typed while the page is asking, this goes nowhere.
    press(&view, "x");
    view.send(ViewInput::Answer(true));
    wait_for(&view, "the question to go", |state| {
        state.dialog.is_none().then_some(())
    });
    wait_for(&view, "the page to turn green", |state| {
        let picture = state.picture.take()?;
        let [width, height] = picture.size;
        let at = ((height / 2) * width + width / 2) * 4;
        (picture.rgba[at] < 100 && picture.rgba[at + 1] > 80).then_some(())
    });

    // Typing into the box and pressing Enter sends the form.
    click(&view, 150.0, 35.0);
    for key in ["h", "i"] {
        press(&view, key);
    }
    press(&view, "Enter");
    let second = wait_for(&view, "the form to be sent", |state| {
        state
            .address
            .contains("second.html")
            .then(|| state.address.clone())
    });
    assert!(second.ends_with("second.html?q=hi"), "{second}");

    view.send(ViewInput::Back);
    wait_for(&view, "going back", |state| {
        (state.address == first).then_some(())
    });

    assert!(matches!(ask(Command::StopChrome), Event::ChromeClosed));
    wait_for(&view, "the page to be put away", |state| {
        (!state.showing && state.picture.is_none()).then_some(())
    });
    drop(worker);
    let _ = std::fs::remove_dir_all(dir);
}

/// Draws a page of the teacher's choosing the way the Browser screen would
/// and saves the picture, to look at how a real site comes out.
///
///     OGRE_PAGE_INSIDE_URL=https://example.org OGRE_UI_SHOTS=/tmp/shots \
///     cargo test -p ogre-app --test page_inside a_real_page -- --ignored
#[test]
#[ignore = "needs Chrome installed and OGRE_PAGE_INSIDE_URL"]
fn a_real_page_is_drawn_for_someone_to_look_at() {
    let url = std::env::var("OGRE_PAGE_INSIDE_URL").expect("set OGRE_PAGE_INSIDE_URL");
    let shots = PathBuf::from(std::env::var("OGRE_UI_SHOTS").expect("set OGRE_UI_SHOTS"));
    let dir = folder("real");
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: dir.join("chrome-profile"),
            headless: false,
            executable: None,
        },
        Sites::built_in(),
        dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    let ask = |command: Command| -> Event {
        worker.send(command);
        loop {
            if let Some(event) = worker.poll().find(|event| !event.is_progress()) {
                return event;
            }
            woken
                .recv_timeout(Duration::from_secs(60))
                .expect("the worker answers in time");
        }
    };
    let view = worker.view().clone();
    ask(Command::StartChrome { inside: true });
    view.send(ViewInput::Size(ViewSize {
        width: 1068,
        height: 656,
        scale: 1.0,
    }));
    let opened = ask(Command::Open(url));
    assert!(matches!(opened, Event::Opened(_)), "{opened:?}");
    // The last picture after the page has had time to finish drawing.
    std::thread::sleep(Duration::from_secs(3));
    let picture = wait_for(&view, "a picture", |state| state.picture.take());
    std::fs::create_dir_all(&shots).unwrap();
    let [width, height] = picture.size;
    image::RgbaImage::from_raw(width as u32, height as u32, picture.rgba)
        .expect("the picture has the size it says")
        .save(shots.join("page-inside-real.png"))
        .unwrap();
    println!("{width} by {height}, at {}", view.state().address);
    ask(Command::StopChrome);
    drop(worker);
    let _ = std::fs::remove_dir_all(dir);
}
