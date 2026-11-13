//! Reads a practice grading page with OGRE's real MyOpenMath reader, through
//! the built-in browser, and says what it found. A check that pages can be
//! read and written this way before anyone grades with it.
//!
//!     cargo run --example bridge_check
//!
//! Opens a window for a few seconds. Ends with status 0 if the page read as
//! expected. The page is a fixture with made-up students.

use std::sync::Arc;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::{Duration, Instant};

use eframe::egui;
use ogre_app::{BuiltIn, BuiltInPage, Requests};
use ogre_embedded::Chromium;
use ogre_harness::PageDriver;
use ogre_harness::sites::SiteAdapter;
use ogre_harness::sites::imathas::IMathAs;

/// Not finished yet.
const RUNNING: i32 = -1;

struct Check {
    built_in: BuiltIn,
    requests: Requests,
    outcome: Arc<AtomicI32>,
    started: Instant,
}

impl eframe::App for Check {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.built_in.pump(&self.requests);
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

/// What the worker would do: go to the page, then read it with the adapter.
async fn read(page: BuiltInPage, address: String) -> Result<(), String> {
    let say = |error: ogre_harness::Error| error.to_string();
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
    Ok(())
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
            let (page, inbox) = BuiltInPage::new(Arc::new(move || ctx.request_repaint()));
            let outcome = Arc::new(AtomicI32::new(RUNNING));
            let result = outcome.clone();
            std::thread::spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_time()
                    .build()
                    .expect("the async runtime starts");
                let code = match runtime.block_on(read(page, address)) {
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
                requests: std::sync::Mutex::new(inbox),
                outcome,
                started: Instant::now(),
            }))
        }),
    )
}
