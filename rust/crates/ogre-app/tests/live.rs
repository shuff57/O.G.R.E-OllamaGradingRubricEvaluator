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
//!   OGRE_LIVE_LENIENCY       the app's leniency setting. 50 (default) grades
//!                            as the Electron app did at its most lenient,
//!                            75 uses the rubric as written, 100 is strict
//!   OGRE_LIVE_LOGIN_MINUTES  how long to wait for a login (default 15)
//!   OGRE_LIVE_ONLY_READ=1    stop once the students are read; nothing is
//!                            sent to the AI service
//!   OGRE_LIVE_QUESTIONS=1    after reading, go to the previous question and
//!                            back with the app's own buttons, reading each;
//!                            nothing is graded or written
//!   OGRE_LIVE_INSIDE=1       Chrome runs without a window and the page is
//!                            shown inside OGRE, as with the Settings switch
//!                            on. There is then no Chrome window to log in
//!                            in: if the site asks, the run stops and says so
//!
//! # A supervised first write
//!
//! `OGRE_LIVE_FILL=1` turns the run into a write that a person approves at
//! each step. It grades only the students who have no grade yet, then stops:
//!
//! 1. It writes the proposals, with names and feedback, to `preview.html` in
//!    a private folder and prints where that is. Nothing is on the page yet.
//! 2. It waits for a file named `approve` to appear in that folder (or
//!    `cancel`). Only then does it fill the grades into the page's form,
//!    reading each batch back. Nothing is saved.
//! 3. It waits again, with Chrome open, for the teacher to look at the page.
//!    A file named `save` has the app save and wait for the site to confirm;
//!    `done` means the teacher saved or discarded in Chrome themselves.
//! 4. It reads the open page once more and reports how many of the written
//!    scores its form shows, then deletes the folder. Whether the site stored
//!    them is for a fresh look from another browser to say.
//!
//!   OGRE_LIVE_WAIT_MINUTES   how long each wait lasts (default 30)

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use eframe::egui::accesskit::Role;
use egui_kittest::Harness;
use egui_kittest::kittest::{NodeT, Queryable};
use ogre_app::{
    Command, Event, ExamplesRequest, KeyStore, MemoryKeys, OgreApp, ProviderSettings, Service,
    Settings, Worker, engine_leniency,
};
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;
use serde_json::Value;

type Window = Harness<'static, OgreApp>;

/// On the Grade screen once students are read, and nowhere before.
const STUDENTS_READ: &str = "Give 0 to students with no response";

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

fn button_starting(window: &Window, start: &str) -> Option<String> {
    window
        .query_by(|node| {
            node.role() == Role::Button
                && node.label().is_some_and(|label| label.starts_with(start))
        })
        .and_then(|node| node.accesskit_node().label())
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Waits for one of `names` to appear as a file in `dir`. `None` when the
/// time runs out or Chrome is closed first.
fn wait_for_file(
    window: &mut Window,
    dir: &Path,
    names: &[&'static str],
    limit: Duration,
) -> Option<&'static str> {
    let deadline = Instant::now() + limit;
    while Instant::now() < deadline {
        window.run_steps(2);
        if let Some(name) = names.iter().find(|name| dir.join(name).exists()) {
            return Some(name);
        }
        if shows(window, "Chrome is no longer running") {
            println!("Chrome was closed");
            return None;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    None
}

/// The supervised first write described at the top of this file. The
/// students have been read; nothing is graded yet.
fn supervised_fill(window: &mut Window, data_dir: &Path, start: u64, model: &str, leniency: u8) {
    let wait = Duration::from_secs(
        60 * std::env::var("OGRE_LIVE_WAIT_MINUTES")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(30),
    );
    let Some(grade) = button_starting(window, "Grade ").filter(|label| label != "Grade 0 students")
    else {
        println!("NOTHING TO DO: no student on this page has an answer and no grade");
        return;
    };
    println!(
        "pressing {grade:?} (leniency {leniency}, {model}); students with a grade are left alone"
    );
    window.get_by_label(&grade).click();
    window.run_steps(2);
    wait_until(window, "the AI to grade", Duration::from_secs(1500), |w| {
        !shows(w, "Grading…")
    });

    let sessions = data_dir.join("sessions");
    let records = records_since(&sessions, start);
    let read = records
        .iter()
        .rfind(|r| r["event"] == "read")
        .expect("the read was recorded");
    let graded = records
        .iter()
        .rfind(|r| r["event"] == "graded")
        .expect("the grading run was recorded");
    let name_of = |index: u64| {
        read["students"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|s| s["index"] == index)
            .map(|s| {
                (
                    s["name"].as_str().unwrap_or("?").to_owned(),
                    s["score"].as_f64(),
                )
            })
            .unwrap_or_default()
    };

    // The folder the teacher and this run talk through. It holds student
    // names and feedback, so nobody else may read it, and it is deleted at
    // the end.
    let dir = std::env::temp_dir().join(format!("ogre-first-write-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    let mut rows = String::new();
    let mut proposed = Vec::new();
    println!("  student  on page  proposed  feedback");
    for result in graded["results"].as_array().into_iter().flatten() {
        let index = result["index"].as_u64().unwrap_or(0);
        let (name, on_page) = name_of(index);
        let on_page = on_page.map_or("blank".to_owned(), |score| score.to_string());
        match result["score"].as_f64() {
            Some(score) => {
                let feedback = result["feedback"].as_str().unwrap_or_default();
                println!(
                    "  S{:02}     {on_page:>7}  {score:>8}  {} characters",
                    index + 1,
                    feedback.len()
                );
                rows += &format!(
                    "<tr><td>{}</td><td>{on_page}</td><td><b>{score}</b></td><td>{}</td></tr>\n",
                    escape(&name),
                    ogre_harness::feedback::safe_html(feedback)
                );
                proposed.push((index, score));
            }
            None => {
                println!("  S{:02}     {on_page:>7}  not graded", index + 1);
                rows += &format!(
                    "<tr><td>{}</td><td>{on_page}</td><td>not graded</td><td>{}</td></tr>\n",
                    escape(&name),
                    escape(result["not_graded"].as_str().unwrap_or_default())
                );
            }
        }
    }
    let rubric = graded["rubric"].as_str().unwrap_or("(none recorded)");
    let preview = dir.join("preview.html");
    std::fs::write(
        &preview,
        format!(
            "<!doctype html><meta charset=\"utf-8\"><title>OGRE: grades waiting for approval</title>\
             <style>body{{font:15px/1.45 sans-serif;max-width:1100px;margin:2em auto;padding:0 1em}}\
             table{{border-collapse:collapse}}td,th{{border:1px solid #bbb;padding:6px 10px;vertical-align:top;text-align:left}}\
             pre{{white-space:pre-wrap;background:#f4f1ea;padding:10px}}blockquote{{color:#555}}</style>\
             <h1>Grades waiting for your approval</h1>\
             <p>{}</p><p>Nothing has been written to the page. {} graded with {} at leniency {leniency}.</p>\
             <table><tr><th>Student</th><th>On the page now</th><th>Proposed</th><th>Feedback</th></tr>\n{rows}</table>\
             <h2>Rubric used</h2><pre>{}</pre>",
            escape(read["title"].as_str().unwrap_or_default()),
            proposed.len(),
            escape(model),
            escape(rubric),
        ),
    )
    .unwrap();
    for warning in graded["warnings"].as_array().into_iter().flatten() {
        // Warnings can name a student, so they go in the folder, not here.
        let mut text = std::fs::read_to_string(dir.join("warnings.txt")).unwrap_or_default();
        text += warning.as_str().unwrap_or_default();
        text.push('\n');
        std::fs::write(dir.join("warnings.txt"), text).unwrap();
    }
    println!("PREVIEW: {}", preview.display());
    println!("FOLDER: {}", dir.display());
    let Some(fill) = button_starting(window, "Fill in ") else {
        println!("NOTHING TO WRITE: no usable grade was proposed");
        let _ = std::fs::remove_dir_all(&dir);
        return;
    };
    println!("WAITING FOR APPROVAL: nothing is on the page yet ({fill:?} is the next step)");
    if wait_for_file(window, &dir, &["approve", "cancel"], wait) != Some("approve") {
        println!("NOT APPROVED: nothing was filled in");
        let _ = std::fs::remove_dir_all(&dir);
        return;
    }

    window.get_by_label(&fill).click();
    window.run_steps(2);
    wait_until(
        window,
        "the grades to be filled in",
        Duration::from_secs(300),
        |w| !shows(w, "Writing grades"),
    );
    let checked = shows(window, "filled in on the page and checked");
    let written: Vec<Value> = records_since(&sessions, start)
        .into_iter()
        .filter(|r| r["event"] == "written")
        .collect();
    let filled: usize = written
        .iter()
        .map(|r| r["students"].as_array().map_or(0, Vec::len))
        .sum();
    let mismatches: usize = written
        .iter()
        .map(|r| r["mismatches"].as_array().map_or(0, Vec::len))
        .sum();
    println!(
        "FILLED: {filled} of {} grades are in the page's form and {}; {mismatches} did not read back as written. Nothing is saved.",
        proposed.len(),
        if checked {
            "were read back and checked"
        } else {
            "the app did not report them all checked"
        }
    );
    println!("WAITING FOR YOUR CHECK: look at the page in the OGRE Chrome window");

    match wait_for_file(window, &dir, &["save", "done"], wait) {
        Some("save") => match button_starting(window, "Save on ") {
            Some(save) => {
                window.get_by_label(&save).click();
                window.run_steps(2);
                wait_until(
                    window,
                    "the site to confirm the save",
                    Duration::from_secs(120),
                    |w| !shows(w, "Saving on the site"),
                );
                println!(
                    "SAVE: {}",
                    if shows(window, "confirmed the save") {
                        "the site confirmed it"
                    } else {
                        "the site did NOT confirm it"
                    }
                );
            }
            None => println!("SAVE: the app offers no save here; save in the Chrome window"),
        },
        Some(_) => println!("DONE: the teacher finished in the Chrome window"),
        None => println!("NO ANSWER: left as it is; closing Chrome discards what was not saved"),
    }

    // What the open page shows now, for the students this run wrote to. This
    // is the page's form, not proof of what the site stored: check that from
    // another browser, or by opening the page afresh.
    if !shows(window, "Chrome is no longer running") {
        click_read(window);
        let after = records_since(&sessions, start);
        let now = page_state(after.iter().rfind(|r| r["event"] == "read").unwrap());
        let kept = proposed
            .iter()
            .filter(|(index, score)| {
                now.iter()
                    .any(|(i, on_page, _)| i == index && *on_page == Some(*score))
            })
            .count();
        println!(
            "AFTERWARDS: the open page shows {kept} of the {} proposed scores (its form, not proof of storage)",
            proposed.len()
        );
    }
    let _ = std::fs::remove_dir_all(&dir);
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
        .unwrap_or(50);
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

    let inside = std::env::var_os("OGRE_LIVE_INSIDE").is_some();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: inside,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    let view = worker.view().clone();
    let settings = Settings {
        provider,
        leniency,
        page_inside: inside,
        ..Settings::default()
    };
    let mut window: Window = Harness::builder()
        .with_size([1280.0, 860.0])
        .build_eframe(|cc| OgreApp::new(&cc.egui_ctx, worker, settings, Box::new(keys)));
    window.run_steps(2);

    window.get_by_label("Start Chrome").click();
    if inside {
        // The app turns to the Browser screen, where the page is drawn.
        wait_until(
            &mut window,
            "Chrome to start without a window",
            Duration::from_secs(60),
            |w| shows(w, "Stop Chrome"),
        );
        wait_until(
            &mut window,
            "the page to be shown inside OGRE",
            Duration::from_secs(30),
            |_| view.state().showing,
        );
        println!("INSIDE: Chrome has no window and its tab is shown in OGRE");
        window.get_by_label("Grade").click();
        window.run_steps(2);
    }
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
        if shows(&window, STUDENTS_READ) {
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
            } else if shows(&window, "is asking you to sign in") {
                "the site is asking for a sign-in"
            } else if shows(&window, "No student work found") {
                "the grading page shows no students"
            } else {
                "another problem (see the app's message)"
            }
        );
        if inside && shows(&window, "is asking you to sign in") {
            // No Chrome window to log in in, and a page drawn in a test's
            // window is not one a person can type into.
            panic!(
                "the site asks for a sign-in. Sign in in the OGRE app itself (Browser \
                 screen, with the page shown inside OGRE), close the app, and run this again"
            );
        }
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
    if inside {
        // What the Browser screen would show. The picture itself holds
        // student work, so only its size is looked at.
        let state = view.state();
        let on_the_site = state.address.starts_with("https://www.myopenmath.com/");
        println!(
            "INSIDE: showing {}, on the site's page {on_the_site}, newest picture {:?}",
            state.showing,
            state.picture.as_ref().map(|picture| picture.size)
        );
        assert!(state.showing, "the grading tab is the one shown");
    }
    if std::env::var_os("OGRE_LIVE_QUESTIONS").is_some() {
        let place = |w: &Window| {
            w.query_by(|node| node.label().is_some_and(|l| l.starts_with("Question ")))
                .and_then(|node| node.accesskit_node().label())
        };
        let students = |w: &Window| {
            w.query_by(|node| {
                node.label()
                    .is_some_and(|l| l.contains(" with no points yet"))
            })
            .and_then(|node| node.accesskit_node().label())
            .map(|label| label.split(" · ").nth(1).unwrap_or_default().to_owned())
        };
        let Some(start) = place(&window) else {
            println!("NO QUESTION LIST: the app shows no question bar for this page");
            return;
        };
        println!("AT: {start} | {}", students(&window).unwrap_or_default());
        for button in ["Previous question", "Next question"] {
            let before = place(&window);
            window.get_by_label(button).click();
            window.run_steps(2);
            wait_until(
                &mut window,
                "the other question to be read",
                Duration::from_secs(90),
                |w| !shows(w, "Opening the question") && place(w) != before,
            );
            println!(
                "{button}: {} | {}",
                place(&window).unwrap_or_default(),
                students(&window).unwrap_or_default()
            );
        }
        assert_eq!(place(&window), Some(start), "back where it started");
        return;
    }
    if std::env::var_os("OGRE_LIVE_ONLY_READ").is_some() {
        return;
    }
    if std::env::var_os("OGRE_LIVE_FILL").is_some() {
        supervised_fill(&mut window, &data_dir, start, &model, leniency);
        return;
    }

    window.get_by_label("Who to grade").click();
    window.run_steps(2);
    window.get_by_label("Everyone with an answer").click();
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
        shows(&window, STUDENTS_READ),
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

/// Has the real service write scoring examples for a rubric, through the
/// app's own worker. No browser and no student's work: the request holds a
/// rubric and its question, and the reply is the AI's own writing.
///
///     cargo test -p ogre-app --test live scoring_examples -- --ignored --nocapture
///
/// `OGRE_LIVE_LENIENCY` is the app's setting, as above.
#[test]
#[ignore = "asks the Electron app's AI service to write scoring examples"]
fn the_real_service_writes_scoring_examples() {
    let leniency: u8 = std::env::var("OGRE_LIVE_LENIENCY")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(50);
    let (provider, key) = electron_app_provider();
    println!("asking {} at leniency {leniency}", provider.model);
    let rubric: ogre_core::Rubric = serde_json::from_value(serde_json::json!({
        "essayPrompt": "A basketball player makes 70% of free throws. In 20 attempts, find the probability of at least 16 makes.",
        "maxScore": 14,
        "modelText": "X ~ B(20, 0.7). P(X >= 16) = 0.2375.",
        "rubricItems": [],
        "checklistItems": [
            {"category": "Check the Conditions(4 pts)", "items": ["Say there is a fixed number of trials, and how many.", "Say each trial has two outcomes, success or failure.", "Say the chance of success is the same on each trial and the trials are independent."]},
            {"category": "Name the Parameters(2 pts)", "items": ["Say what one trial is and what counts as a success.", "Give the values of n and p, and write X ~ B(n, p)."]},
            {"category": "State and Compute(4 pts)", "items": ["Write the probability asked for with the correct inequality, for example P(X >= k).", "Give the value, using a calculator."]},
            {"category": "Interpret(4 pts)", "items": ["Say what the probability means for this situation, in a sentence.", "Find the mean np and say whether the outcome is unusual."]}
        ]
    }))
    .unwrap();

    let data_dir = std::env::temp_dir().join(format!("ogre-live-examples-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    worker.send(Command::WriteExamples(Box::new(ExamplesRequest {
        rubric,
        rubric_text: None,
        provider,
        api_key: Some(key),
        leniency: engine_leniency(leniency),
    })));

    let started = Instant::now();
    let examples = loop {
        let event = worker.poll().next();
        match event {
            Some(Event::Examples(result)) => break result,
            Some(other) => panic!("unexpected news from the worker: {other:?}"),
            None => {
                assert!(
                    started.elapsed() < Duration::from_secs(600),
                    "no reply in ten minutes"
                );
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);

    let examples = examples.expect("the examples were written");
    println!("took {:.0?}\n{examples}", started.elapsed());
    for level in ["Excellent: ", "Adequate: ", "Below Average: ", "Minimal: "] {
        assert!(examples.contains(level), "no \"{level}\" example");
    }
}

/// Has the real service read a rubric from a picture of a page, through the
/// app's own worker and a Chrome it starts out of sight. The page is a made-up
/// rubric table: no student's work is on it.
///
///     cargo test -p ogre-app --test live rubric_from_a_picture -- --ignored --nocapture
#[test]
#[ignore = "starts Chrome and sends a picture of a made-up rubric to the Electron app's AI service"]
fn the_real_service_reads_a_rubric_from_a_picture_of_the_page() {
    let (provider, key) = electron_app_provider();
    println!("asking {}", provider.model);
    let fixture = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/rubric/essay-rubric.html"
    );
    let data_dir = std::env::temp_dir().join(format!("ogre-live-picture-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    let next = |worker: &Worker, what: &str| -> Event {
        let started = Instant::now();
        loop {
            if let Some(event) = worker.poll().next() {
                return event;
            }
            assert!(
                started.elapsed() < Duration::from_secs(600),
                "no reply in ten minutes while {what}"
            );
            std::thread::sleep(Duration::from_millis(200));
        }
    };

    worker.send(Command::StartChrome { inside: false });
    assert!(matches!(
        next(&worker, "starting Chrome"),
        Event::ChromeStarted
    ));
    let fixture = std::fs::canonicalize(fixture).expect("the fixture page is there");
    worker.send(Command::Open(format!("file://{}", fixture.display())));
    assert!(matches!(
        next(&worker, "opening the page"),
        Event::Opened(_)
    ));
    let started = Instant::now();
    worker.send(Command::RubricFromPicture {
        provider,
        api_key: Some(key),
    });
    let read = next(&worker, "reading the rubric");
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);

    let Event::RubricRead(read) = read else {
        panic!("unexpected news from the worker: {read:?}");
    };
    let rubric = read.expect("a rubric was read from the picture");
    println!(
        "took {:.0?}; {} parts, named {:?}\n{}",
        started.elapsed(),
        rubric.parts,
        rubric.name,
        rubric.requirements
    );
    assert_eq!(rubric.parts, 3);
    for expected in [
        "## Concept [40%]",
        "## Reasoning [40%]",
        "## Communication [20%]",
    ] {
        assert!(
            rubric.requirements.contains(expected),
            "no \"{expected}\" in what was read"
        );
    }
}

/// Has the real service draft a rubric for a question, through the app's own
/// worker. No browser and no student's work.
///
///     cargo test -p ogre-app --test live drafts_a_rubric -- --ignored --nocapture
#[test]
#[ignore = "asks the Electron app's AI service to draft a rubric"]
fn the_real_service_drafts_a_rubric_for_a_question() {
    let (provider, key) = electron_app_provider();
    println!("asking {}", provider.model);
    let data_dir = std::env::temp_dir().join(format!("ogre-live-draft-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    let started = Instant::now();
    worker.send(Command::DraftRubric {
        question: "A basketball player makes 70% of free throws. In 20 attempts, find the probability of at least 16 makes, and say whether that outcome would be unusual.".into(),
        max_score: 14.0,
        provider,
        api_key: Some(key),
    });
    let draft = loop {
        match worker.poll().next() {
            Some(Event::RubricDrafted(result)) => break result,
            Some(other) => panic!("unexpected news from the worker: {other:?}"),
            None => {
                assert!(
                    started.elapsed() < Duration::from_secs(600),
                    "no reply in ten minutes"
                );
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);

    let draft = draft.expect("a rubric was drafted");
    println!(
        "took {:.0?}; {} parts, named {:?}\n{}",
        started.elapsed(),
        draft.parts,
        draft.name,
        draft.requirements
    );
    assert!(draft.parts >= 2);
    assert_eq!(
        ogre_core::category_weight_problem(&draft.requirements),
        None,
        "the drafted weights add up"
    );
}

/// Has the real service interview a teacher and write a skill, through the
/// worker. Nothing about a student is sent: the teacher's side is made up.
///
///     cargo test -p ogre-app --test live skill_interview -- --ignored --nocapture
#[test]
#[ignore = "asks the Electron app's AI service to interview a teacher and write a skill"]
fn the_real_service_runs_the_skill_interview_and_writes_a_skill() {
    use ogre_agent::{InterviewTurn, drafted_skill};

    let (provider, key) = electron_app_provider();
    println!("asking {}", provider.model);
    let data_dir = std::env::temp_dir().join(format!("ogre-live-skill-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    let started = Instant::now();
    let ask = |turns: &[InterviewTurn]| {
        worker.send(Command::SkillInterview {
            turns: turns.to_vec(),
            provider: provider.clone(),
            api_key: Some(key.clone()),
        });
        loop {
            match worker.poll().next() {
                Some(Event::SkillInterview(reply)) => break reply.expect("the AI answered"),
                Some(other) => panic!("unexpected news from the worker: {other:?}"),
                None => {
                    assert!(
                        started.elapsed() < Duration::from_secs(600),
                        "no reply in ten minutes"
                    );
                    std::thread::sleep(Duration::from_millis(200));
                }
            }
        }
    };

    // An opening that answers nothing: the AI should ask, not write.
    let mut turns = vec![InterviewTurn::teacher("I want a skill for late work.")];
    let first = ask(&turns);
    println!("after {:.0?}, the AI asks:\n{first}\n", started.elapsed());
    assert!(
        drafted_skill(&first).is_none(),
        "the AI interviews before it writes"
    );
    assert!(first.contains('?'), "the AI asks a question");

    // Everything it wants to know, at once.
    turns.push(InterviewTurn::ai(first));
    turns.push(InterviewTurn::teacher(
        "Here is all of it at once. Subject: AP Statistics. Audience: high school. \
         Strictness: moderate. Focus: whether the work is shown. Rules: take one point off \
         for each day late, down to half credit, and never below half. No example of ideal \
         work. Please write the skill now.",
    ));
    let second = ask(&turns);
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
    println!(
        "after {:.0?}, the AI writes:\n{second}\n",
        started.elapsed()
    );

    let skill = drafted_skill(&second).expect("the AI wrote the skill out as a block");
    println!(
        "name {:?}, described as {:?}",
        skill.name, skill.description
    );
    assert!(!skill.name.is_empty());
    assert!(
        skill.body.to_lowercase().contains("late"),
        "the skill is about what was asked for"
    );
    // The file it would be saved as reads back the same.
    assert_eq!(
        ogre_agent::SkillDraft::from_markdown(&skill.to_markdown()),
        skill
    );
}

/// Has the real service reword a made-up rubric for the editor, through the
/// worker. No student's work is part of it.
///
///     cargo test -p ogre-app --test live rewords_a_rubric -- --ignored --nocapture
#[test]
#[ignore = "asks the Electron app's AI service to reword a rubric"]
fn the_real_service_rewords_a_rubric_for_the_editor() {
    let (provider, key) = electron_app_provider();
    println!("asking {}", provider.model);
    let rubric: ogre_core::Rubric = serde_json::from_value(serde_json::json!({
        "essayPrompt": "A basketball player makes 70% of free throws. In 20 attempts, find the probability of at least 16 makes.",
        "maxScore": 14,
        "modelText": "X ~ B(20, 0.7). P(X >= 16) = 0.2375.",
        "rubricItems": [],
        "checklistItems": [
            {"category": "Name the Parameters(2 pts)", "items": ["Say what one trial is and what counts as a success.", "Give the values of n and p, and write X ~ B(n, p)."]},
            {"category": "State and Compute(4 pts)", "items": ["Write the probability asked for with the correct inequality, for example P(X >= k).", "Give the value, using a calculator."]}
        ]
    }))
    .unwrap();
    let as_read = ogre_core::editable_rubric_text(&rubric);

    let data_dir = std::env::temp_dir().join(format!("ogre-live-reword-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    worker.send(Command::RewordRubric(Box::new(ExamplesRequest {
        rubric,
        rubric_text: None,
        provider,
        api_key: Some(key),
        leniency: engine_leniency(50),
    })));
    let started = Instant::now();
    let reworded = loop {
        match worker.poll().next() {
            Some(Event::Reworded(result)) => break result,
            Some(other) => panic!("unexpected news from the worker: {other:?}"),
            None => {
                assert!(
                    started.elapsed() < Duration::from_secs(600),
                    "no reply in ten minutes"
                );
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);

    let reworded = reworded.expect("the rubric was reworded");
    println!(
        "took {:.0?}\nAS READ:\n{as_read}\n\nREWORDED:\n{reworded}",
        started.elapsed()
    );
    // The same headings and as many requirements, in other words, with
    // nothing grading adds for itself.
    let headings = |text: &str| -> Vec<String> {
        text.lines()
            .filter(|l| l.starts_with("## "))
            .map(str::to_owned)
            .collect()
    };
    assert_eq!(headings(&reworded), headings(&as_read));
    assert!(!reworded.contains("(0pts)") && !reworded.contains("Model Response"));
    assert!(
        !reworded.contains('%'),
        "weights that were only filled in are not written"
    );
    let requirements = |text: &str| {
        text.split("--- Model Response ---")
            .next()
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with("## "))
            .count()
    };
    assert_eq!(requirements(&reworded), requirements(&as_read));
    assert_ne!(
        reworded,
        as_read.split("\n\n--- Model Response ---").next().unwrap()
    );
}

/// Has the real service run the consistency check on made-up grades, through
/// the worker. The six students and their answers are invented here.
///
///     cargo test -p ogre-app --test live consistency_check_again -- --ignored --nocapture
#[test]
#[ignore = "sends six made-up answers and grades to the Electron app's AI service"]
fn the_real_service_runs_the_consistency_check_again_on_given_grades() {
    use ogre_core::{StudentResult, StudentWork};

    let (provider, key) = electron_app_provider();
    println!("asking {}", provider.model);
    let rubric: ogre_core::Rubric = serde_json::from_value(serde_json::json!({
        "essayPrompt": "Explain how sample size affects the margin of error.",
        "maxScore": 10,
        "rubricItems": [],
        "checklistItems": [
            {"category": "Concept", "items": ["Says the margin of error gets smaller as the sample gets larger.", "Mentions the standard error or the square root of n."]}
        ]
    }))
    .unwrap();
    // The second and the fifth say the same thing and are four points apart.
    // Names, not numbers: the check's prompt numbers students from 0, and a
    // name like "Student 4" at place 3 gets the two mixed up in the reply.
    let answers = [
        (
            "Avery, Sam",
            "A bigger sample makes the standard error smaller, since it is divided by root n, so the margin of error shrinks.",
            10.0,
        ),
        (
            "Brook, Kai",
            "More people asked means a smaller margin of error.",
            8.0,
        ),
        (
            "Cruz, Jo",
            "The margin of error shrinks because the standard error has the square root of n underneath.",
            10.0,
        ),
        ("Diaz, Remy", "Sample size does not matter much.", 2.0),
        (
            "Ellis, Pat",
            "More people asked means a smaller margin of error.",
            4.0,
        ),
        (
            "Evans, Lee",
            "Larger n gives a smaller standard error and so a smaller margin of error.",
            10.0,
        ),
    ];
    let students: Vec<StudentWork> = answers
        .iter()
        .enumerate()
        .map(|(index, (name, response, _))| StudentWork {
            index,
            name: (*name).into(),
            response: (*response).into(),
            prompt: None,
        })
        .collect();
    let grades: Vec<StudentResult> = answers
        .iter()
        .enumerate()
        .map(|(student_index, (_, _, score))| StudentResult {
            student_index,
            score: *score,
            feedback: "<p>Graded.</p>".into(),
        })
        .collect();

    let data_dir = std::env::temp_dir().join(format!("ogre-live-sweep-{}", std::process::id()));
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        || {},
    );
    worker.send(Command::Sweep(
        Box::new(ogre_app::GradeRequest {
            rubric,
            rubric_text: None,
            students,
            provider,
            api_key: Some(key),
            leniency: engine_leniency(75),
            score_from_verdicts: false,
            examples: None,
            skill_choices: Default::default(),
            cancel: ogre_grader::CancelFlag::new(),
        }),
        grades,
    ));
    let started = Instant::now();
    let swept = loop {
        match worker.poll().next() {
            Some(Event::Swept(result)) => break result,
            Some(other) => panic!("unexpected news from the worker: {other:?}"),
            None => {
                assert!(
                    started.elapsed() < Duration::from_secs(900),
                    "no reply in fifteen minutes"
                );
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    };
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);

    let suggestions = swept.expect("the consistency check ran");
    println!("took {:.0?}", started.elapsed());
    for (index, suggestion) in &suggestions {
        println!(
            "{}: {} instead of {} ({})",
            answers[*index].0,
            suggestion.score,
            answers[*index].2,
            suggestion.reason.as_deref().unwrap_or("no reason given")
        );
    }
    assert!(
        suggestions
            .iter()
            .any(|(index, _)| *index == 1 || *index == 4),
        "one of the two students who said the same thing is looked at again"
    );
}
