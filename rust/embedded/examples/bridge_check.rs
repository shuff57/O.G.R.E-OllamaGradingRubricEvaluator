//! Reads a practice grading page with OGRE's real MyOpenMath reader, through
//! the built-in browser, and says what it found. A check that pages can be
//! read and written this way before anyone grades with it, and that the
//! built-in page takes real clicks and keys, gives a picture of itself and
//! passes on what it asks, which the agent and the window need.
//!
//!     cargo run --example bridge_check
//!
//! Opens a window for a few seconds. Ends with status 0 if the page read as
//! expected. The page is a fixture with made-up students.

use std::sync::Arc;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::{Duration, Instant};

use eframe::egui;
use ogre_app::{BuiltIn, PageChannel};
use ogre_embedded::Chromium;
use ogre_harness::cdp::CdpPage;
use ogre_harness::sites::SiteAdapter;
use ogre_harness::sites::imathas::IMathAs;
use ogre_harness::{InputDriver, PageDriver};

/// Not finished yet.
const RUNNING: i32 = -1;

struct Check {
    built_in: BuiltIn,
    channel: PageChannel,
    outcome: Arc<AtomicI32>,
    started: Instant,
}

impl eframe::App for Check {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.built_in.pump(&self.channel);
        // What the window does with a question: here, say yes to it.
        if let Some(asked) = self.built_in.asking.clone() {
            println!("the page asks: {:?} ({:?})", asked.message, asked.kind);
            self.built_in.answer(true);
        }
        // And with a request for a file: here, give it the one made for this.
        if let Some(wanted) = self.built_in.wants_files.clone() {
            println!("the page asks for a file (more than one: {})", wanted.many);
            self.built_in.give_files(&[file_to_give()]);
        }
        egui::CentralPanel::default().show(ui, |ui| {
            let size = ui.available_size();
            self.built_in.browser().show(ui, size);
        });
        let outcome = self.outcome.load(Ordering::SeqCst);
        if outcome != RUNNING {
            std::process::exit(outcome);
        }
        if self.started.elapsed() > Duration::from_secs(90) {
            eprintln!("FAILED: no result in 90 seconds");
            std::process::exit(2);
        }
        ui.ctx().request_repaint_after(Duration::from_millis(30));
    }

    fn output_hook(&mut self, ctx: &egui::Context, output: &mut egui::FullOutput) {
        self.built_in.browser().after_frame(ctx, output);
    }
}

/// The file the check gives a page that asks for one.
fn file_to_give() -> String {
    std::env::temp_dir()
        .join(format!("ogre-bridge-check-{}.txt", std::process::id()))
        .to_string_lossy()
        .into_owned()
}

/// What the worker would do: go to the page, then read it with the adapter.
async fn read(page: CdpPage, address: String) -> Result<(), String> {
    let say = |error: ogre_harness::Error| error.to_string();
    page.prepare().await.map_err(say)?;
    page.navigate(&address).await.map_err(say)?;
    println!("at {}", page.url().await.map_err(say)?);
    println!("1 + 1 = {}", page.eval("1 + 1").await.map_err(say)?);
    let thrown = page.eval("nothing.here").await;
    println!(
        "a script that throws: {}",
        thrown
            .as_ref()
            .map_or_else(ToString::to_string, |v| format!("no error?! {v}"))
    );
    if thrown.is_ok() {
        return Err("a script that throws was not reported".into());
    }
    let slow = page
        .eval("new Promise((done) => setTimeout(() => done('waited'), 300))")
        .await
        .map_err(say)?;
    println!("a promise is awaited: {slow}");

    let adapter = IMathAs;
    let read = adapter.read_page(&page).await.map_err(say)?;
    let names: Vec<&str> = read.submissions.iter().map(|s| s.name.as_str()).collect();
    println!("read {} students: {}", names.len(), names.join("; "));
    let rubric = adapter.read_rubric(&page).await.map_err(say)?;
    println!(
        "rubric: {} categories, out of {}",
        rubric.checklist_items.len() + rubric.rubric_items.len(),
        rubric.max_score_value()
    );
    if names.len() < 2 {
        return Err("fewer students than the fixture has".into());
    }

    // A grade goes into the page's form for the first student the rules
    // allow, and a fresh read of the page has to show it.
    let feedback = "<p>Checked through the built-in browser.</p>";
    let policy = ogre_core::WritePolicy::default();
    let write = read
        .submissions
        .iter()
        .find_map(|student| ogre_core::plan_write(student, 7.5, feedback, policy).ok())
        .ok_or("no student on the fixture can be written to")?;
    let receipt = adapter.write_grade(&page, &write).await.map_err(say)?;
    println!("wrote 7.5 for {}", write.name);
    let written = [(write, receipt)];
    let mismatches = ogre_harness::sites::verify_writes(&adapter, &page, &written)
        .await
        .map_err(say)?;
    if !mismatches.is_empty() {
        return Err(format!(
            "the page does not show what was written: {mismatches:?}"
        ));
    }
    println!("a fresh read of the page shows the grade and the feedback");

    // What the agent needs: a click and a key the page takes for a
    // person's, and a picture of the page.
    let spot = page
        .eval(
            "(() => { window.__clicks = []; \
             document.addEventListener('click', (e) => window.__clicks.push(e.isTrusted), true); \
             const box = document.querySelector('input[id^=scorebox]'); \
             box.scrollIntoView({ block: 'center' }); \
             const at = box.getBoundingClientRect(); \
             return [at.x + at.width / 2, at.y + at.height / 2, box.id]; })()",
        )
        .await
        .map_err(say)?;
    let (x, y) = (
        spot[0].as_f64().unwrap_or(0.0),
        spot[1].as_f64().unwrap_or(0.0),
    );
    page.click_at(x, y).await.map_err(say)?;
    let clicked = page
        .eval("[window.__clicks, document.activeElement.id]")
        .await
        .map_err(say)?;
    println!("a real click: {clicked}");
    if clicked[0] != serde_json::json!([true]) || clicked[1] != spot[2] {
        return Err(format!(
            "the click did not land as a person's would: {clicked}"
        ));
    }
    page.press_key("Tab").await.map_err(say)?;
    let moved = page.eval("document.activeElement.id").await.map_err(say)?;
    println!("the Tab key moved on to: {moved}");
    if moved == spot[2] {
        return Err("the Tab key did nothing".into());
    }
    let picture = page.screenshot_png().await.map_err(say)?;
    println!("a picture of the page: {} bytes", picture.len());
    if !picture.starts_with(b"\x89PNG") || picture.len() < 2000 {
        return Err("the picture of the page is not a picture".into());
    }

    // What the window needs: a question the page asks comes through, and
    // the answer goes back.
    page.eval("(setTimeout(() => { window.__answer = confirm('Leave the page?'); }, 50), null)")
        .await
        .map_err(say)?;
    let mut answer = serde_json::Value::Null;
    for _ in 0..50 {
        answer = page.eval("window.__answer ?? null").await.map_err(say)?;
        if !answer.is_null() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    println!("the page was answered: {answer}");
    if answer != serde_json::json!(true) {
        return Err(format!("the answer did not reach the page: {answer}"));
    }

    // A grading tool that a school's site shows in a frame is reached too.
    let framed = address.replace("imathas-gradeallq2.html", "generic/tool-in-a-frame.html");
    page.navigate(&framed).await.map_err(say)?;
    let inside = page
        .eval_in_frame(
            "document.getElementById('tool_content')",
            "[document.title, document.querySelectorAll('input[type=number]').length]",
        )
        .await
        .map_err(say)?;
    println!("inside the frame: {inside}");
    if inside[1] != serde_json::json!(3) {
        return Err(format!("the frame was not read: {inside}"));
    }

    // A frame that shows another site, which Chromium runs apart from the
    // page, and a frame inside such a frame. `127.0.0.1` and `localhost`
    // are different sites to it.
    let port = serve_frames();
    page.navigate(&format!("http://127.0.0.1:{port}/"))
        .await
        .map_err(say)?;
    let other = "document.getElementById('other')";
    let seen = "[location.hostname, document.title]";
    let across = page.eval_in_frame(other, seen).await.map_err(say)?;
    println!("inside a frame from another site: {across}");
    if across != serde_json::json!(["localhost", "Middle page"]) {
        return Err(format!(
            "the frame from another site was not read: {across}"
        ));
    }
    let deeper = page
        .eval_in_frames(&[other, other], seen)
        .await
        .map_err(say)?;
    println!("inside a frame of that frame, from the first site again: {deeper}");
    if deeper != serde_json::json!(["127.0.0.1", "Inner page"]) {
        return Err(format!("the frame inside the frame was not read: {deeper}"));
    }

    // A file box, clicked as a person would: the page's request comes
    // through, and the file it is given is the file it then holds.
    let file = file_to_give();
    std::fs::write(&file, "made up").map_err(|error| error.to_string())?;
    page.navigate(&format!("http://127.0.0.1:{port}/file"))
        .await
        .map_err(say)?;
    let spot = page
        .eval(
            "(() => { const at = document.getElementById('f').getBoundingClientRect(); \
             return [at.x + at.width / 2, at.y + at.height / 2]; })()",
        )
        .await
        .map_err(say)?;
    page.click_at(
        spot[0].as_f64().unwrap_or(0.0),
        spot[1].as_f64().unwrap_or(0.0),
    )
    .await
    .map_err(say)?;
    let held = "Array.from(document.getElementById('f').files, (file) => [file.name, file.size])";
    let mut holds = serde_json::Value::Null;
    for _ in 0..50 {
        holds = page.eval(held).await.map_err(say)?;
        if holds != serde_json::json!([]) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let _ = std::fs::remove_file(&file);
    println!("the file box holds: {holds}");
    let name = std::path::Path::new(&file)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    if holds != serde_json::json!([[name, 7]]) {
        return Err(format!("the page was not given the file: {holds}"));
    }
    Ok(())
}

/// Serves a page that frames a page of another site, which frames a page
/// of the first site again. Gives the port.
fn serve_frames() -> u16 {
    use std::io::{BufRead, BufReader, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a free port");
    let port = listener.local_addr().expect("an address").port();
    // One thread to a connection: the browser opens some ahead of time and
    // says nothing on them, and those must not hold up the others.
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            std::thread::spawn(move || {
                let mut request = String::new();
                if BufReader::new(&stream).read_line(&mut request).is_err() {
                    return;
                }
                let path = request.split_whitespace().nth(1).unwrap_or("/");
                let frame = |host: &str, to: &str| {
                    format!("<iframe id=other src=\"http://{host}:{port}{to}\"></iframe>")
                };
                let body = if path.starts_with("/file") {
                    "<!doctype html><title>File page</title><input type=file id=f>".to_owned()
                } else if path.starts_with("/inner") {
                    "<!doctype html><title>Inner page</title><p>Innermost.</p>".to_owned()
                } else if path.starts_with("/middle") {
                    format!(
                        "<!doctype html><title>Middle page</title>{}",
                        frame("127.0.0.1", "/inner")
                    )
                } else {
                    format!(
                        "<!doctype html><title>Outer page</title>{}",
                        frame("localhost", "/middle")
                    )
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                     Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            });
        }
    });
    port
}

fn main() -> eframe::Result {
    if let Some(code) = egui_webview::run_cef_subprocess() {
        std::process::exit(code);
    }
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../fixtures/imathas-gradeallq2.html")
        .canonicalize()
        .expect("the fixture page is in the repository");
    let address = format!("file://{}", fixture.display());

    eframe::run_native(
        "OGRE built-in browser check",
        eframe::NativeOptions::default(),
        Box::new(move |cc| {
            let ctx = cc.egui_ctx.clone();
            let (link, channel) = ogre_app::page_link();
            let outcome = Arc::new(AtomicI32::new(RUNNING));
            let result = outcome.clone();
            std::thread::spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_time()
                    .build()
                    .expect("the async runtime starts");
                let checked = runtime.block_on(async move {
                    // As the worker does: the window is woken for each
                    // message the page is sent.
                    let wake = Arc::new(move || ctx.request_repaint());
                    tokio::spawn(ogre_app::carry(link.outgoing, wake));
                    read(link.page, address).await
                });
                let code = match checked {
                    Ok(()) => {
                        println!("PASSED");
                        0
                    }
                    Err(problem) => {
                        eprintln!("FAILED: {problem}");
                        1
                    }
                };
                result.store(code, Ordering::SeqCst);
            });
            Ok(Box::new(Check {
                built_in: BuiltIn::new(Box::new(Chromium::new(&cc.egui_ctx))),
                channel,
                outcome,
                started: Instant::now(),
            }))
        }),
    )
}
