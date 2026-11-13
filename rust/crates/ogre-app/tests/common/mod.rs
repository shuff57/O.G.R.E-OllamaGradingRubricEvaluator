//! Shared by the tests that open the saved MyOpenMath page from disk.
#![allow(dead_code)] // each test binary uses a different part

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use ogre_app::{Command, Event, Worker};
use ogre_core::{GradeWrite, GradingPage, Rubric};
use ogre_harness::sites::imathas::IMathAs;
use ogre_harness::sites::{SiteAdapter, Sites, WriteReceipt};
use ogre_harness::{PageDriver, Result as PageResult};
use serde_json::{Value, json};

/// MyOpenMath's adapter, also answering for the saved copy of its page that
/// these tests open from disk.
struct SavedMyOpenMath;

#[async_trait]
impl SiteAdapter for SavedMyOpenMath {
    fn name(&self) -> &'static str {
        IMathAs.name()
    }
    fn matches(&self, url: &str) -> bool {
        url.ends_with("/imathas-gradeallq2.html")
    }
    async fn read_page(&self, page: &dyn PageDriver) -> PageResult<GradingPage> {
        IMathAs.read_page(page).await
    }
    async fn read_rubric(&self, page: &dyn PageDriver) -> PageResult<Rubric> {
        IMathAs.read_rubric(page).await
    }
    async fn write_grade(
        &self,
        page: &dyn PageDriver,
        write: &GradeWrite,
    ) -> PageResult<WriteReceipt> {
        IMathAs.write_grade(page, write).await
    }
    fn saves_on_write(&self) -> bool {
        IMathAs.saves_on_write()
    }
    async fn save(&self, page: &dyn PageDriver) -> PageResult<()> {
        IMathAs.save(page).await
    }
}

/// The built-in sites, plus the saved MyOpenMath page.
pub fn saved_page_sites() -> Sites {
    Sites::built_in().with(Arc::new(SavedMyOpenMath))
}

/// The `file://` address of a page under `rust/fixtures`.
pub fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
        .canonicalize()
        .expect("fixture exists");
    format!("file://{}", path.display())
}

/// Sends one command and waits for the event that ends it. Progress events
/// seen on the way are returned too.
pub fn ask(worker: &Worker, woken: &mpsc::Receiver<()>, command: Command) -> (Event, Vec<Event>) {
    worker.send(command);
    let deadline = Instant::now() + Duration::from_secs(60);
    let mut progress = Vec::new();
    loop {
        for event in worker.poll() {
            if event.is_progress() {
                progress.push(event);
            } else {
                return (event, progress);
            }
        }
        let left = deadline.saturating_duration_since(Instant::now());
        woken
            .recv_timeout(left)
            .expect("the worker answers in time");
    }
}

/// An HTTP server that answers chat requests the way Ollama would, with
/// `reply(request)` as the model's text. Returns its address and the request
/// bodies it received.
pub fn fake_ollama(
    reply: impl Fn(&Value) -> String + Send + 'static,
) -> (String, Arc<Mutex<Vec<Value>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let record = seen.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut length = 0;
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok_and(|n| n > 0) && line != "\r\n" {
                if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = value.trim().parse().unwrap_or(0);
                }
                line.clear();
            }
            let mut body = vec![0; length];
            if reader.read_exact(&mut body).is_err() {
                continue;
            }
            let request = serde_json::from_slice(&body).unwrap_or(Value::Null);
            let content = reply(&request);
            record.lock().unwrap().push(request);
            let answer = json!({
                "model": "stand-in",
                "message": { "role": "assistant", "content": content },
                "done": true,
            })
            .to_string();
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}",
                answer.len()
            );
        }
    });
    (address, seen)
}
