//! The Chrome connection itself: its lifetime, what happens when Chrome
//! dies, and that no debugging port is opened.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness --test cdp -- --ignored

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use ogre_harness::cdp::{Chrome, LaunchOptions};
use ogre_harness::{Error, PageDriver};

fn profile(test: &str) -> PathBuf {
    std::env::temp_dir().join(format!("ogre-test-cdp-{test}-{}", std::process::id()))
}

async fn launch(profile_dir: &Path) -> Chrome {
    Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.to_owned(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts")
}

/// The process ids of browsers running on `profile_dir`.
fn browsers(profile_dir: &Path) -> Vec<u32> {
    let pattern = format!("user-data-dir={}", profile_dir.display());
    let output = Command::new("pgrep")
        .args(["-f", &pattern])
        .output()
        .unwrap();
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse().ok())
        .collect()
}

async fn wait_until_gone(profile_dir: &Path) -> bool {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if browsers(profile_dir).is_empty() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    false
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn chrome_is_reached_over_a_pipe_not_a_port() {
    let profile_dir = profile("pipe");
    let chrome = launch(&profile_dir).await;
    let pids = browsers(&profile_dir);
    assert!(!pids.is_empty());

    // Nothing another program on this computer could connect to.
    assert!(!profile_dir.join("DevToolsActivePort").exists());
    for pid in &pids {
        let command_line = std::fs::read(format!("/proc/{pid}/cmdline")).unwrap_or_default();
        let command_line = String::from_utf8_lossy(&command_line);
        assert!(
            !command_line.contains("remote-debugging-port"),
            "{command_line}"
        );
    }

    chrome.close().await.unwrap();
    assert!(wait_until_gone(&profile_dir).await, "closing ends Chrome");
    let _ = std::fs::remove_dir_all(profile_dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn chrome_does_not_outlive_a_handle_that_was_dropped() {
    let profile_dir = profile("drop");
    let chrome = launch(&profile_dir).await;
    chrome.open("about:blank").await.unwrap();
    assert!(!browsers(&profile_dir).is_empty());

    drop(chrome);

    assert!(
        wait_until_gone(&profile_dir).await,
        "Chrome was left running"
    );
    let _ = std::fs::remove_dir_all(profile_dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn calls_fail_promptly_once_chrome_is_gone() {
    let profile_dir = profile("killed");
    let chrome = launch(&profile_dir).await;
    let page = chrome.open("about:blank").await.unwrap();
    assert!(chrome.is_alive().await);

    // A call that is waiting when Chrome dies must not wait for ever.
    let waiting = {
        let page = page.clone();
        tokio::spawn(async move { page.eval("new Promise(() => {})").await })
    };
    tokio::time::sleep(Duration::from_millis(300)).await;
    for pid in browsers(&profile_dir) {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
    }

    let started = Instant::now();
    let pending = tokio::time::timeout(Duration::from_secs(10), waiting)
        .await
        .expect("the waiting call ends")
        .unwrap();
    assert!(matches!(pending, Err(Error::Browser(_))), "{pending:?}");
    let later = tokio::time::timeout(Duration::from_secs(10), page.eval("1 + 1"))
        .await
        .expect("a later call ends");
    assert!(matches!(later, Err(Error::Browser(_))), "{later:?}");
    assert!(chrome.open("about:blank").await.is_err());
    assert!(!chrome.is_alive().await);
    assert!(started.elapsed() < Duration::from_secs(10));

    let _ = chrome.close().await;
    let _ = std::fs::remove_dir_all(profile_dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn tabs_work_side_by_side_and_slow_promises_are_awaited() {
    let profile_dir = profile("tabs");
    let chrome = launch(&profile_dir).await;
    let one = chrome.open("about:blank").await.unwrap();
    let two = chrome.open("about:blank").await.unwrap();

    // Each tab answers for itself, even when the slower one was asked first.
    let slow = one.eval("new Promise((done) => setTimeout(() => done('one'), 1500))");
    let fast = two.eval("(document.title = 'second', 'two')");
    let started = Instant::now();
    let (slow, fast) = tokio::join!(slow, fast);
    assert_eq!(slow.unwrap(), "one");
    assert_eq!(fast.unwrap(), "two");
    assert!(started.elapsed() >= Duration::from_millis(1400));
    assert_eq!(one.eval("document.title").await.unwrap(), "");
    assert_eq!(two.eval("document.title").await.unwrap(), "second");

    // Many calls in flight on one tab come back matched to their questions.
    let answers = futures_free_join((0..20).map(|n| {
        let page = one.clone();
        async move { page.eval(&format!("{n} * 2")).await.unwrap() }
    }))
    .await;
    assert_eq!(
        answers,
        (0..20)
            .map(|n| serde_json::json!(n * 2))
            .collect::<Vec<_>>()
    );

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(profile_dir);
}

/// Runs the futures at the same time and returns their results in order.
async fn futures_free_join<F, T>(futures: impl Iterator<Item = F>) -> Vec<T>
where
    F: std::future::Future<Output = T> + Send + 'static,
    T: Send + 'static,
{
    let handles: Vec<_> = futures.map(tokio::spawn).collect();
    let mut results = Vec::new();
    for handle in handles {
        results.push(handle.await.unwrap());
    }
    results
}

/// A page with unsaved changes asks "Leave site?" once the teacher has
/// clicked in it, and Chrome holds the navigation until that is answered.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn navigating_away_from_a_page_that_asks_to_stay_still_arrives() {
    use ogre_harness::{InputDriver, PageDriver};

    let profile_dir = profile("leave");
    let chrome = launch(&profile_dir).await;
    let page = chrome
        .open("data:text/html,<title>one</title><body style='height:100vh'>changes")
        .await
        .unwrap();
    page.eval(
        "window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = 'x'; }), 1",
    )
    .await
    .unwrap();
    // The prompt only appears on a page the user has interacted with.
    page.click_at(40.0, 40.0).await.unwrap();

    let started = Instant::now();
    page.navigate("data:text/html,<title>two</title>arrived")
        .await
        .unwrap();
    assert_eq!(page.eval("document.title").await.unwrap(), "two");
    assert!(started.elapsed() < Duration::from_secs(10));

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(&profile_dir);
}

/// A web server for one test, answering every request with the page for its
/// path. Gives the port it listens on.
fn serve(page_for: fn(&str, u16) -> String) -> u16 {
    use std::io::{BufRead, BufReader, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a free port");
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut request = String::new();
            if BufReader::new(&stream).read_line(&mut request).is_err() {
                continue;
            }
            let path = request.split_whitespace().nth(1).unwrap_or("/");
            let body = page_for(path, port);
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                 Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
        }
    });
    port
}

/// A page with two frames: one from its own site and one from another.
/// `127.0.0.1` and `localhost` are different sites to Chrome.
fn framed_pages(path: &str, port: u16) -> String {
    if path.starts_with("/inner") {
        return "<!doctype html><title>Inner page</title><p id=who></p>\
                <script>document.getElementById('who').textContent = location.search</script>"
            .to_owned();
    }
    format!(
        "<!doctype html><title>Outer page</title>\
         <iframe id=same src=\"/inner?who=same\"></iframe>\
         <iframe id=other src=\"http://localhost:{port}/inner?who=other\"></iframe>"
    )
}

/// A page whose two frames, one from its own site and one from another,
/// each hold two frames of the same kinds.
fn frames_in_frames(path: &str, port: u16) -> String {
    if path.starts_with("/inner") {
        return framed_pages(path, port);
    }
    let frames = |inside: &str| {
        format!(
            "<iframe id=same></iframe><iframe id=other></iframe><script>\
             const elsewhere = location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';\
             document.getElementById('same').src = '{inside}?who=same';\
             document.getElementById('other').src = \
               'http://' + elsewhere + ':' + location.port + '{inside}?who=other';</script>"
        )
    };
    if path.starts_with("/middle") {
        return format!(
            "<!doctype html><title>Middle page</title>{}",
            frames("/inner")
        );
    }
    format!(
        "<!doctype html><title>Outer page</title>{}",
        frames("/middle")
    )
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_script_runs_inside_a_frame_that_is_inside_a_frame() {
    let port = serve(frames_in_frames);
    let dir = profile("frames-in-frames");
    let chrome = launch(&dir).await;
    let page = chrome
        .open(&format!("http://127.0.0.1:{port}/"))
        .await
        .unwrap();
    let frame = |id: &str| format!("document.getElementById('{id}')");
    let seen = "[location.hostname, document.title, document.getElementById('who').textContent]";
    let other_host = |host: &str| {
        if host == "localhost" {
            "127.0.0.1"
        } else {
            "localhost"
        }
    };

    // Every pairing of a frame Chrome runs with the page around it and one
    // it runs apart: the script lands in the innermost frame's own page.
    for outer in ["same", "other"] {
        let middle_host = if outer == "same" {
            "127.0.0.1"
        } else {
            "localhost"
        };
        for inner in ["same", "other"] {
            let inner_host = if inner == "same" {
                middle_host
            } else {
                other_host(middle_host)
            };
            let frames = [frame(outer), frame(inner)];
            let frames: Vec<&str> = frames.iter().map(String::as_str).collect();
            assert_eq!(
                page.eval_in_frames(&frames, seen).await.unwrap(),
                serde_json::json!([inner_host, "Inner page", format!("?who={inner}")]),
                "{outer} / {inner}"
            );
        }
    }
    // One frame down is the page between.
    assert_eq!(
        page.eval_in_frames(&[&frame("other")], "document.title")
            .await
            .unwrap(),
        serde_json::json!("Middle page")
    );
    // No frames at all is the page itself.
    assert_eq!(
        page.eval_in_frames(&[], "document.title").await.unwrap(),
        serde_json::json!("Outer page")
    );
    // A step that is no frame is said to be none, wherever it comes.
    for frames in [
        vec![frame("same"), "document.body".to_owned()],
        vec!["document.body".to_owned(), frame("same")],
        vec![frame("other"), frame("nothing")],
    ] {
        let frames: Vec<&str> = frames.iter().map(String::as_str).collect();
        let error = page.eval_in_frames(&frames, "1").await.unwrap_err();
        assert!(matches!(error, Error::Page(_)), "{frames:?}: {error}");
    }
    assert_eq!(
        page.eval("document.title").await.unwrap(),
        serde_json::json!("Outer page")
    );

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_script_runs_inside_a_frame_of_the_same_site_or_another() {
    let port = serve(framed_pages);
    let dir = profile("frames");
    let chrome = launch(&dir).await;
    let page = chrome
        .open(&format!("http://127.0.0.1:{port}/"))
        .await
        .unwrap();
    let same = "document.getElementById('same')";
    let other = "document.getElementById('other')";

    // The page itself cannot look into the frame from the other site.
    assert_eq!(
        page.eval(&format!(
            "[!!{same}.contentDocument, !!{other}.contentDocument]"
        ))
        .await
        .unwrap(),
        serde_json::json!([true, false])
    );

    // Inside each frame the script sees the frame's own page.
    let seen = "[location.href, document.title, document.getElementById('who').textContent]";
    assert_eq!(
        page.eval_in_frame(same, seen).await.unwrap(),
        serde_json::json!([
            format!("http://127.0.0.1:{port}/inner?who=same"),
            "Inner page",
            "?who=same"
        ])
    );
    assert_eq!(
        page.eval_in_frame(other, seen).await.unwrap(),
        serde_json::json!([
            format!("http://localhost:{port}/inner?who=other"),
            "Inner page",
            "?who=other"
        ])
    );

    // As in the page: a promise is waited for, and what is thrown comes back.
    let later = "new Promise((done) => setTimeout(() => done(document.title + '!'), 20))";
    for frame in [same, other] {
        assert_eq!(
            page.eval_in_frame(frame, later).await.unwrap(),
            serde_json::json!("Inner page!")
        );
        let thrown = page
            .eval_in_frame(frame, "(() => { throw new Error('no such box'); })()")
            .await
            .unwrap_err();
        assert!(
            matches!(&thrown, Error::Script(message) if message.contains("no such box")),
            "{thrown}"
        );
    }

    // Something that is not a frame, or not there, is said to be no frame.
    for not_a_frame in ["document.getElementById('nothing')", "document.body", "42"] {
        let error = page.eval_in_frame(not_a_frame, "1").await.unwrap_err();
        assert!(matches!(error, Error::Page(_)), "{not_a_frame}: {error}");
    }
    // The page still answers for itself afterwards.
    assert_eq!(
        page.eval("document.title").await.unwrap(),
        serde_json::json!("Outer page")
    );

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
