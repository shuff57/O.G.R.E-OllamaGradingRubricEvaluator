//! A read-only run on a real grading page: the real window code, the real
//! worker and the app's own Chrome with the teacher's own login.
//!
//! It reads a page that is already graded, grades it again and compares what
//! OGRE proposes with what is on the page. It never fills in a score and never
//! saves, and it checks afterwards that the page still reads the same.
//!
//!     OGRE_LIVE_PAGE=<address of a "Grade all" page> \
//!         cargo test -p ogre-app --test live -- --ignored --nocapture
//!
//! Chrome opens with the app's own profile (in the app's data folder). If the
//! site asks for a login, log in in that window; the run waits and carries on
//! by itself. The login stays in that profile for the app to use afterwards.
//!
//! Grading uses the service, model and key the Electron app is set up with
//! (its `ogre-server.json`), so student names and answers are sent to that
//! service. The session is recorded in the app's data folder as any session
//! is. Students are numbered in the output; no name or answer is printed.
//!
//!   OGRE_LIVE_LENIENCY       0 most lenient (default, what the Electron app
//!                            was set to), 50 as written, 100 most strict
//!   OGRE_LIVE_LOGIN_MINUTES  how long to wait for a login (default 15)
//!   OGRE_LIVE_ONLY_READ=1    stop once the students are read; nothing is
//!                            sent to the AI service

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use eframe::egui::accesskit::Role;
use egui_kittest::Harness;
use egui_kittest::kittest::{NodeT, Queryable};
use ogre_app::{KeyStore, MemoryKeys, OgreApp, ProviderSettings, Service, Settings, Worker};
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;
use serde_json::Value;

type Window = Harness<'static, OgreApp>;

const INCLUDE_GRADED: &str = "Include students who are already graded";

/// Keeps the window drawing until `done` says so, as a person watching would.
fn wait_until(window: &mut Window, what: &str, limit: Duration, done: impl Fn(&Window) -> bool) {
    println!("waiting for {what}");
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

/// The service the Electron app grades with, and its key. The key is handed
/// to the window's key store and never printed.
fn electron_app_provider() -> (ProviderSettings, String) {
    let home = std::env::var("HOME").expect("HOME is set");
    let path = format!("{home}/.config/ogre-desktop/ogre-server.json");
    let text = std::fs::read_to_string(&path).expect("the Electron app's settings are readable");
    let settings: Value = serde_json::from_str(&text).expect("the settings are JSON");
    let provider = settings["providers"]
        .as_array()
        .and_then(|providers| providers.iter().find(|p| p["is_active"] == true))
        .expect("the Electron app has an active provider");
    let url = provider["api_url"].as_str().unwrap_or_default();
    assert!(
        url.contains("ollama.com"),
        "this run only knows Ollama Cloud"
    );
    let model = provider["model"].as_str().expect("a model is set");
    let key = provider["credentials"]["api_key"]
        .as_str()
        .filter(|key| !key.is_empty())
        .expect("an API key is set");
    (
        ProviderSettings {
            service: Service::OllamaCloud,
            base_url: url.to_owned(),
            model: model.to_owned(),
        },
        key.to_owned(),
    )
}

/// Every record written to `sessions` since `start`, oldest first.
fn records_since(sessions: &Path, start: u64) -> Vec<Value> {
    let mut files: Vec<(u64, PathBuf)> = std::fs::read_dir(sessions)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let stamp: u64 = path.file_stem()?.to_str()?.parse().ok()?;
            (stamp >= start).then_some((stamp, path))
        })
        .collect();
    files.sort();
    files
        .iter()
        .flat_map(|(_, path)| {
            std::fs::read_to_string(path)
                .unwrap_or_default()
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect::<Vec<Value>>()
        })
        .collect()
}

/// What the page holds for each student, without names: position, score and
/// whether there is feedback.
fn page_state(read: &Value) -> Vec<(u64, Option<f64>, bool)> {
    read["students"]
        .as_array()
        .map(|students| {
            students
                .iter()
                .map(|s| {
                    (
                        s["index"].as_u64().unwrap_or(0),
                        s["score"].as_f64(),
                        s["has_feedback"].as_bool().unwrap_or(false),
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn click_read(window: &mut Window) {
    window.get_by_label("Read students").click();
    window.run_steps(2);
    wait_until(
        window,
        "the page to be read",
        Duration::from_secs(90),
        |w| !shows(w, "Reading the page"),
    );
}

fn open(window: &mut Window, address: &str) {
    let field = window.get_by_role(Role::TextInput);
    field.click();
    window.run_steps(2);
    window.key_press_modifiers(eframe::egui::Modifiers::COMMAND, eframe::egui::Key::A);
    window.get_by_role(Role::TextInput).type_text(address);
    window.run_steps(2);
    window.get_by_label("Open").click();
    window.run_steps(2);
    wait_until(window, "the page to open", Duration::from_secs(90), |w| {
        !shows(w, "Opening the page")
    });
}

#[test]
#[ignore = "needs Chrome, the teacher's login to a real site and the Electron app's AI service"]
fn a_real_page_is_read_and_graded_without_writing() {
    let address = std::env::var("OGRE_LIVE_PAGE").expect("set OGRE_LIVE_PAGE to a grading page");
    let leniency: u8 = std::env::var("OGRE_LIVE_LENIENCY")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let login_minutes: u64 = std::env::var("OGRE_LIVE_LOGIN_MINUTES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(15);
    let data_dir = eframe::storage_dir("ogre").expect("the app has a data folder");
    let start = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let (provider, key) = electron_app_provider();
    let model = provider.model.clone();
    let keys = MemoryKeys::default();
    keys.store(Service::OllamaCloud, &key).unwrap();
    drop(key);

    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: false,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    let settings = Settings {
        provider,
        leniency,
        ..Settings::default()
    };
    let mut window: Window = Harness::builder()
        .with_size([1280.0, 860.0])
        .build_eframe(|cc| OgreApp::new(&cc.egui_ctx, worker, settings, Box::new(keys)));
    window.run_steps(2);

    window.get_by_label("Start Chrome").click();
    wait_until(
        &mut window,
        "Chrome to start",
        Duration::from_secs(60),
        |w| shows(w, "Read students"),
    );
    open(&mut window, &address);

    // Read until the page gives students. A site that wants a login first
    // shows its form instead, and the teacher logs in in the Chrome window.
    let deadline = Instant::now() + Duration::from_secs(login_minutes * 60);
    let mut asked = false;
    let mut reopened = Instant::now();
    loop {
        click_read(&mut window);
        if shows(&window, INCLUDE_GRADED) {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "no students could be read within {login_minutes} minutes"
        );
        // Say why, in the app's own words. These messages name the page,
        // never a student.
        let elsewhere = shows(&window, "No grading page OGRE knows is open");
        println!(
            "not read: {}",
            if elsewhere {
                "the Chrome window is not on a grading page"
            } else if shows(&window, "No student work found") {
                "the grading page shows no students"
            } else {
                "another problem (see the app's message)"
            }
        );
        if !asked {
            println!("IF THE SITE ASKS FOR A LOGIN: log in in the OGRE Chrome window");
            asked = true;
        }
        // After a login the site may land somewhere else. Go back to the
        // grading page, but never while a login form may be half filled in.
        if elsewhere && reopened.elapsed() > Duration::from_secs(20) {
            open(&mut window, &address);
            reopened = Instant::now();
        } else {
            std::thread::sleep(Duration::from_secs(4));
        }
    }
    println!("READ: the students were read");
    if std::env::var_os("OGRE_LIVE_ONLY_READ").is_some() {
        return;
    }

    window.get_by_label(INCLUDE_GRADED).click();
    window.run_steps(2);
    let grade = window.get_by(|node| {
        node.role() == Role::Button
            && node
                .label()
                .is_some_and(|label| label.starts_with("Grade ") && label.contains("student"))
    });
    println!(
        "pressing {:?} (leniency {leniency})",
        grade.accesskit_node().label().unwrap_or_default()
    );
    grade.click();
    window.run_steps(2);
    let started = Instant::now();
    wait_until(
        &mut window,
        "the AI to grade",
        Duration::from_secs(1500),
        |w| !shows(w, "Grading…") && !shows(w, "Grading… "),
    );
    println!("{model} finished in {:.0?}", started.elapsed());
    assert!(
        window
            .query_by(|node| {
                node.role() == Role::Button
                    && node
                        .label()
                        .is_some_and(|label| label.starts_with("Fill in "))
            })
            .is_some(),
        "grades are proposed and waiting; none is filled in"
    );

    // Read once more, to compare the page after the run with before it.
    click_read(&mut window);
    assert!(
        shows(&window, INCLUDE_GRADED),
        "the page still reads after grading"
    );
    drop(window);

    let records = records_since(&data_dir.join("sessions"), start);
    let reads: Vec<&Value> = records.iter().filter(|r| r["event"] == "read").collect();
    let graded = records
        .iter()
        .find(|r| r["event"] == "graded")
        .expect("the grading run was recorded");
    assert!(
        !records
            .iter()
            .any(|r| r["event"] == "written" || r["event"] == "saved"),
        "nothing was written or saved"
    );
    let before = page_state(reads.first().expect("the first read was recorded"));
    let after = page_state(reads.last().unwrap());
    assert!(reads.len() >= 2, "the page was read again after grading");
    assert_eq!(before, after, "the page holds what it held before the run");
    println!(
        "UNCHANGED: the page reads the same after the run ({} students)",
        after.len()
    );

    let mut gaps = Vec::new();
    let mut higher = 0.0;
    println!("  student  on page  OGRE   diff");
    for result in graded["results"].as_array().into_iter().flatten() {
        let index = result["index"].as_u64().unwrap_or(0);
        let on_page = before
            .iter()
            .find(|(i, _, _)| *i == index)
            .and_then(|(_, score, _)| *score);
        let label = format!("S{:02}", index + 1);
        match (
            on_page.filter(|score| *score > 0.0),
            result["score"].as_f64(),
        ) {
            (Some(page), Some(ogre)) => {
                gaps.push((ogre - page).abs());
                higher += ogre - page;
                println!("  {label:<7} {page:>7} {ogre:>5} {:>+6.1}", ogre - page);
            }
            (None, Some(ogre)) => {
                println!("  {label:<7}       – {ogre:>5}      –   (no points on the page)")
            }
            (_, None) => println!("  {label:<7}  not graded"),
        }
    }
    let n = gaps.len().max(1) as f64;
    println!(
        "COMPARED {} | mean gap {:.2} | OGRE higher by {:+.2} on average | identical {} | within 1.5: {}",
        gaps.len(),
        gaps.iter().sum::<f64>() / n,
        higher / n,
        gaps.iter().filter(|gap| **gap < 0.01).count(),
        gaps.iter().filter(|gap| **gap <= 1.5).count(),
    );
    if let Some(warnings) = graded["warnings"].as_array().filter(|w| !w.is_empty()) {
        println!("warnings: {}", warnings.len());
    }
}
