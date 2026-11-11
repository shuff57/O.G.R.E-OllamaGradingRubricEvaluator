//! The whole app in one run: the real window code, the real worker, a real
//! Chrome and a local model, from "Start Chrome" to a confirmed save on the
//! saved MyOpenMath page.
//!
//! Needs Chrome and a running Ollama with the model named in
//! `OGRE_TEST_MODEL` (default `nemotron-bolt:latest`):
//!     cargo test -p ogre-app --test demo -- --ignored --nocapture
//!
//! `OGRE_DEMO_HEADED=1` shows the Chrome window while it runs, and
//! `OGRE_UI_SHOTS=<folder>` saves a picture of the app at each step.

mod common;

use std::path::PathBuf;
use std::time::{Duration, Instant};

use eframe::egui::accesskit::Role;
use egui_kittest::Harness;
use egui_kittest::kittest::Queryable;
use ogre_app::{MemoryKeys, OgreApp, ProviderSettings, Service, Settings, Worker};
use ogre_harness::cdp::LaunchOptions;

type Window = Harness<'static, OgreApp>;

fn shots_dir() -> Option<PathBuf> {
    std::env::var_os("OGRE_UI_SHOTS").map(PathBuf::from)
}

fn shot(window: &mut Window, name: &str) {
    if let Some(dir) = shots_dir() {
        std::fs::create_dir_all(&dir).unwrap();
        window.run_steps(2);
        let image = window.render().expect("the window renders");
        image.save(dir.join(format!("{name}.png"))).unwrap();
    }
}

/// Keeps the window drawing until `done` says so, as a person watching would.
fn wait_until(window: &mut Window, what: &str, limit: Duration, done: impl Fn(&Window) -> bool) {
    let deadline = Instant::now() + limit;
    loop {
        window.run_steps(2);
        if done(window) {
            return;
        }
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn shows(window: &Window, text: &str) -> bool {
    window.query_by_label_contains(text).is_some()
}

/// A moment for someone watching the Chrome window to see what changed.
fn pause() {
    if std::env::var_os("OGRE_DEMO_HEADED").is_some() {
        std::thread::sleep(Duration::from_secs(3));
    }
}

#[test]
#[ignore = "needs Chrome and a local Ollama model"]
fn a_teacher_grades_a_page_from_start_to_save() {
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "nemotron-bolt:latest".into());
    let data_dir = std::env::temp_dir().join(format!("ogre-test-demo-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: std::env::var_os("OGRE_DEMO_HEADED").is_none(),
            executable: None,
        },
        common::saved_page_sites(),
        data_dir.clone(),
        || {},
    );
    let settings = Settings {
        provider: ProviderSettings {
            service: Service::Ollama,
            base_url: String::new(),
            model: model.clone(),
        },
        ..Settings::default()
    };
    let builder = Harness::builder().with_size([1280.0, 860.0]);
    let builder = if shots_dir().is_some() {
        builder.wgpu()
    } else {
        builder
    };
    let mut window: Window = builder.build_eframe(|cc| {
        OgreApp::new(
            &cc.egui_ctx,
            worker,
            settings,
            Box::new(MemoryKeys::default()),
        )
    });
    window.run_steps(2);
    shot(&mut window, "demo-1-start");

    window.get_by_label("Start Chrome").click();
    wait_until(
        &mut window,
        "Chrome to start",
        Duration::from_secs(60),
        |w| shows(w, "Read students"),
    );

    // Type the page's address and open it, as the teacher would.
    let address = common::fixture("imathas-gradeallq2.html");
    window.get_by_role(Role::TextInput).click();
    window.run_steps(2);
    window.get_by_role(Role::TextInput).type_text(&address);
    window.run_steps(2);
    window.get_by_label("Open").click();
    window.run_steps(2);
    wait_until(
        &mut window,
        "the page to open",
        Duration::from_secs(60),
        |w| !shows(w, "Opening the page"),
    );
    pause();

    window.get_by_label("Read students").click();
    wait_until(
        &mut window,
        "the students to be read",
        Duration::from_secs(60),
        |w| shows(w, "Grade 2 students"),
    );
    assert!(shows(&window, "5 students, 2 with no points yet"));
    shot(&mut window, "demo-2-read");

    // Grade with the real model. Nothing is on the page yet.
    let started = Instant::now();
    window.get_by_label("Grade 2 students").click();
    window.run_steps(2);
    shot(&mut window, "demo-3-grading");
    wait_until(
        &mut window,
        "the model to grade",
        Duration::from_secs(900),
        |w| shows(w, "Fill in ") && !shows(w, "Grading…"),
    );
    println!("{model} graded in {:.0?}", started.elapsed());
    assert!(
        shows(&window, "Fill in 2 grades"),
        "both students should have a proposal the rules allow"
    );
    window.get_by_label("Brook, Kai").click();
    window.run_steps(2);
    shot(&mut window, "demo-4-proposed");
    pause();

    // Fill the page. Each batch is read back and checked before going on.
    window.get_by_label("Fill in 2 grades").click();
    wait_until(
        &mut window,
        "the grades to be filled in",
        Duration::from_secs(60),
        |w| shows(w, "filled in on the page and checked"),
    );
    assert!(shows(&window, "2 grades filled in on the page and checked"));
    shot(&mut window, "demo-5-filled");
    pause();

    // Saving is its own step, and the site has to confirm it.
    window.get_by_label("Save on MyOpenMath").click();
    wait_until(
        &mut window,
        "the site to confirm the save",
        Duration::from_secs(60),
        |w| shows(w, "MyOpenMath confirmed the save."),
    );
    assert!(
        !shows(&window, "Save on MyOpenMath"),
        "nothing is left to save"
    );
    shot(&mut window, "demo-6-saved");
    pause();

    drop(window);
    let _ = std::fs::remove_dir_all(&data_dir);
}
