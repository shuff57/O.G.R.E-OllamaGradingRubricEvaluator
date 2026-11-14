//! Runs the real worker thread end to end: a headless Chrome on a saved
//! grading page, and a stand-in for the AI service.
//!
//! Needs Chrome or Edge installed, so this is skipped by default:
//!     cargo test -p ogre-app --test browser -- --ignored

mod common;

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::{ask, fake_ollama, fixture, saved_page_sites};
use ogre_app::{
    AgentAnswer, AgentRequest, Command, Event, ExamplesFor, ExamplesPlace, GradeRequest,
    KeepRequest, LineKind, ProviderSettings, Service, Worker,
};
use ogre_core::{StudentWork, WritePolicy, plan_write};
use ogre_examples::{FolderStore, GradedExample, rubric_id};
use ogre_grader::CancelFlag;
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;
use serde_json::{Value, json};

fn audit_events(data_dir: &Path) -> Vec<Value> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(data_dir.join("sessions"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    files.sort();
    files
        .iter()
        .flat_map(|file| {
            std::fs::read_to_string(file)
                .unwrap()
                .lines()
                .map(|line| serde_json::from_str(line).unwrap())
                .collect::<Vec<Value>>()
        })
        .collect()
}

/// MyOpenMath shows its sign-in page for a few seconds after a page is
/// opened and then brings up the page itself. A teacher who presses Read at
/// once must get the students, not "No student work found".
#[test]
#[ignore = "needs Chrome installed"]
fn a_read_straight_after_opening_waits_for_the_page_to_arrive() {
    let data_dir = std::env::temp_dir().join(format!("ogre-test-settle-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        saved_page_sites(),
        data_dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    let (event, _) = ask(&worker, &woken, Command::StartChrome { inside: false });
    assert!(matches!(event, Event::ChromeStarted), "{event:?}");

    let (event, _) = ask(
        &worker,
        &woken,
        Command::Open(fixture("late/imathas-gradeallq2.html")),
    );
    assert!(matches!(event, Event::Opened(_)), "{event:?}");
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert_eq!(read.page.submissions.len(), 5);
    assert!(read.page.url.ends_with("/fixtures/imathas-gradeallq2.html"));
    assert!(read.questions.is_empty(), "a saved page links to no list");

    // Going to another question moves the tab that was read, without
    // opening a new one, and reads it.
    let (event, _) = ask(
        &worker,
        &woken,
        Command::GoTo("https://example.com/".into()),
    );
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("does not know the grading page")),
        "{event:?}"
    );
    let (event, _) = ask(
        &worker,
        &woken,
        Command::GoTo(fixture("late/imathas-gradeallq2.html")),
    );
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert_eq!(read.page.submissions.len(), 5);
    // The page that was gone to is the one later writes will go to.
    let (event, _) = ask(&worker, &woken, Command::Write(vec![]));
    assert!(matches!(event, Event::Written(_)), "{event:?}");

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

#[test]
#[ignore = "needs Chrome installed"]
fn reads_grades_fills_verifies_and_saves_a_page() {
    let data_dir = std::env::temp_dir().join(format!("ogre-test-worker-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        saved_page_sites(),
        data_dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );

    // Nothing works before Chrome is running, and nothing is read before a page is open.
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("Chrome is not running")),
        "{event:?}"
    );
    let (event, _) = ask(&worker, &woken, Command::StartChrome { inside: false });
    assert!(matches!(event, Event::ChromeStarted), "{event:?}");
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("No grading page OGRE knows is open")),
        "{event:?}"
    );
    let (event, _) = ask(&worker, &woken, Command::Write(vec![]));
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("Read the students first")),
        "{event:?}"
    );

    let address = fixture("imathas-gradeallq2.html");
    let (event, _) = ask(&worker, &woken, Command::Open(address.clone()));
    assert!(
        matches!(&event, Event::Opened(url) if *url == address),
        "{event:?}"
    );

    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert_eq!(read.site, "MyOpenMath");
    assert!(!read.saves_on_write);
    assert!(!read.manual_save);
    assert_eq!(read.page.submissions.len(), 5);
    let rubric = read.rubric.expect("the rubric is read with the page");
    assert_eq!(rubric.max_score_value(), 10.0);

    // Kai (0 points) and Remy (blank) are the ungraded students with a written answer.
    let students: Vec<StudentWork> = read
        .page
        .submissions
        .iter()
        .filter(|s| !s.response.is_empty() && !s.has_nonzero_score())
        .map(StudentWork::from)
        .collect();
    let names: Vec<_> = students.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, ["Brook, Kai", "Diaz, Remy"]);

    // The two students saw different versions of the question, so each is
    // sent in a request of its own and is student 0 of that request.
    let (ai_address, ai_requests) = fake_ollama(|request| {
        let (score, feedback) = if request.to_string().contains("regression line") {
            (8, "<p>Remy, clear and correct.</p>")
        } else {
            (6, "<p>Kai, name the <strong>standard error</strong>.</p>")
        };
        json!([{ "studentIndex": 0, "score": score, "feedback": feedback }]).to_string()
    });
    let request = GradeRequest {
        rubric,
        rubric_text: None,
        students,
        provider: ProviderSettings {
            service: Service::Ollama,
            base_url: ai_address,
            model: "stand-in".into(),
        },
        api_key: None,
        leniency: 50,
        score_from_verdicts: false,
        examples: None,
        skill_choices: Default::default(),
        cancel: CancelFlag::new(),
        earlier: None,
    };
    let (event, progress) = ask(&worker, &woken, Command::Grade(Box::new(request)));
    let Event::Graded(graded) = event else {
        panic!("expected grades, got {event:?}");
    };
    assert_eq!(graded.warnings, Vec::<String>::new());
    assert!(!graded.cancelled);
    assert!(
        matches!(
            progress.last(),
            Some(Event::GradeProgress { done: 2, total: 2 })
        ),
        "{progress:?}"
    );
    let scores: Vec<_> = graded
        .rows
        .iter()
        .map(|row| (row.index, row.outcome.as_ref().map(|g| g.score).ok()))
        .collect();
    assert_eq!(scores, [(1, Some(6.0)), (3, Some(8.0))]);

    // The AI was sent the question and both answers.
    let sent = ai_requests.lock().unwrap().clone();
    assert_eq!(sent.len(), 2);
    let prompt = sent[0].to_string();
    assert!(prompt.contains("If you ask more people the answer is closer to the real one."));
    assert!(
        prompt.contains("Mentions standard error"),
        "the checklist is in the prompt"
    );

    // Fill the page with what was proposed.
    let writes: Vec<_> = graded
        .rows
        .iter()
        .map(|row| {
            let grade = row.outcome.as_ref().unwrap();
            plan_write(
                &read.page.submissions[row.index],
                grade.score,
                &grade.feedback_html,
                WritePolicy::default(),
            )
            .unwrap()
        })
        .collect();
    // The grades that reach the page are kept as examples. One for a
    // student nothing was written for is not.
    let example = |score: f64, feedback: &str| GradedExample {
        score,
        max_score: 10.0,
        feedback: feedback.into(),
        changed: false,
        at: 1,
    };
    let question = rubric_id("Explain the standard error.", "", 10.0).unwrap();
    let keep = KeepRequest {
        examples_for: ExamplesFor {
            place: ExamplesPlace::ThisComputer,
            rubric: question.clone(),
        },
        examples: vec![
            (0, example(10.0, "Never written.")),
            (1, example(6.0, "Name the standard error.")),
            (3, example(8.0, "Clear and correct.")),
        ],
    };
    let kept_on_disk = || {
        let scores: Vec<f64> = FolderStore::new(data_dir.join("examples"))
            .for_rubric(&question)
            .unwrap()
            .iter()
            .map(|example| example.score)
            .collect();
        scores
    };
    let (event, progress) = ask(
        &worker,
        &woken,
        Command::WriteAndKeep(writes.clone(), Box::new(keep.clone())),
    );
    let Event::Written(written) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert_eq!(written.written, [1, 3]);
    assert_eq!(written.kept, Some(Ok(2)));
    assert_eq!(kept_on_disk(), [6.0, 8.0]);
    assert!(written.failed.is_empty(), "{:?}", written.failed);
    assert!(written.mismatches.is_empty(), "{:?}", written.mismatches);
    assert!(matches!(
        progress.last(),
        Some(Event::WriteProgress { done: 2, total: 2 })
    ));
    let page = written.page.expect("the page is read again after writing");
    assert_eq!(page.submissions[1].score(), Some(6.0));
    assert_eq!(
        page.submissions[1].feedback.as_ref().unwrap().text,
        "Kai, name the standard error."
    );
    assert_eq!(page.submissions[3].score(), Some(8.0));
    assert_eq!(
        page.submissions[0].score(),
        Some(10.0),
        "graded students are untouched"
    );

    // Writing the same thing again is refused: the scores are no longer what was read.
    let (event, _) = ask(
        &worker,
        &woken,
        Command::WriteAndKeep(writes, Box::new(keep)),
    );
    let Event::Written(again) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert!(again.written.is_empty());
    assert_eq!(again.failed.len(), 2);
    assert_eq!(again.kept, None, "what was not written is not kept");
    assert_eq!(kept_on_disk(), [6.0, 8.0]);
    assert!(
        again.failed[0].1.contains("changed on the page"),
        "{:?}",
        again.failed
    );

    let (event, _) = ask(&worker, &woken, Command::Save);
    let Event::Saved(saved) = event else {
        panic!("expected a save, got {event:?}");
    };
    assert_eq!(saved.unwrap().submissions[3].score(), Some(8.0));

    // Every step is on record.
    let events = audit_events(&data_dir);
    let kinds: Vec<_> = events
        .iter()
        .map(|e| e["event"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["read", "graded", "written", "written", "saved"]);
    assert_eq!(events[1]["results"][0]["score"], 6.0);
    assert_eq!(events[2]["students"][0]["name"], "Brook, Kai");
    assert_eq!(events[2]["students"][0]["was"], "0");
    assert_eq!(events[2]["students"][0]["score"], "6");
    assert!(
        !events
            .iter()
            .any(|e| e.to_string().contains("closer to the real one")),
        "no student answers on record"
    );

    // Dropping the handle shuts Chrome down before returning.
    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// Grades the saved page with a real local model. Nothing is written back.
///
/// Needs Chrome and a running Ollama with the model named in `OGRE_TEST_MODEL`
/// (default `nemotron-bolt:latest`):
///     cargo test -p ogre-app --test browser real_model -- --ignored --nocapture
#[test]
#[ignore = "needs Chrome and a local Ollama model"]
fn a_real_model_grades_the_saved_page() {
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "nemotron-bolt:latest".into());
    let data_dir = std::env::temp_dir().join(format!("ogre-test-live-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        saved_page_sites(),
        data_dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    let provider = ProviderSettings {
        service: Service::Ollama,
        base_url: String::new(),
        model: model.clone(),
    };

    let (event, _) = ask(
        &worker,
        &woken,
        Command::ListModels {
            provider: provider.clone(),
            api_key: None,
        },
    );
    let Event::Models(Ok(models)) = event else {
        panic!("Ollama should list its models, got {event:?}");
    };
    assert!(
        models.contains(&model),
        "{model} is not installed; have {models:?}"
    );

    ask(&worker, &woken, Command::StartChrome { inside: false });
    ask(
        &worker,
        &woken,
        Command::Open(fixture("imathas-gradeallq2.html")),
    );
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    let students: Vec<StudentWork> = read
        .page
        .submissions
        .iter()
        .filter(|s| !s.response.is_empty())
        .map(StudentWork::from)
        .collect();
    let sent = students.len();

    let started = Instant::now();
    worker.send(Command::Grade(Box::new(GradeRequest {
        rubric: read.rubric.unwrap(),
        rubric_text: None,
        students,
        provider,
        api_key: None,
        leniency: 50,
        score_from_verdicts: false,
        examples: None,
        skill_choices: Default::default(),
        cancel: CancelFlag::new(),
        earlier: None,
    })));
    // A local model can take minutes; wait longer than `ask` does.
    let graded = loop {
        woken
            .recv_timeout(Duration::from_secs(900))
            .expect("the model answers within 15 minutes");
        if let Some(Event::Graded(graded)) = worker.poll().find(|event| !event.is_progress()) {
            break graded;
        }
    };

    println!(
        "{model} graded {sent} students in {:.0?}",
        started.elapsed()
    );
    for warning in &graded.warnings {
        println!("  warning: {warning}");
    }
    assert_eq!(graded.rows.len(), sent);
    for row in &graded.rows {
        let name = &read.page.submissions[row.index].name;
        match &row.outcome {
            Ok(grade) => {
                println!("  {name}: {} | {}", grade.score, grade.feedback_html);
                let max = read.page.submissions[row.index].max_score().unwrap();
                assert!(
                    (0.0..=max).contains(&grade.score),
                    "{name}: {} of {max}",
                    grade.score
                );
                assert!(
                    !grade.feedback_html.trim().is_empty(),
                    "{name} has no feedback"
                );
            }
            Err(reason) => println!("  {name}: not graded ({reason})"),
        }
    }

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// A site OGRE was never built for: map it, keep the mapping, then read and
/// fill grades through it.
#[test]
#[ignore = "needs Chrome installed"]
fn maps_an_unknown_site_then_reads_and_fills_it() {
    let data_dir = std::env::temp_dir().join(format!("ogre-test-map-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let spawn = |wake: mpsc::Sender<()>| {
        Worker::spawn(
            LaunchOptions {
                profile_dir: data_dir.join("chrome-profile"),
                headless: true,
                executable: None,
            },
            Sites::built_in(),
            data_dir.clone(),
            move || {
                let _ = wake.send(());
            },
        )
    };
    let worker = spawn(wake.clone());

    ask(&worker, &woken, Command::StartChrome { inside: false });
    let (event, _) = ask(&worker, &woken, Command::ListProfiles);
    assert!(
        matches!(&event, Event::Profiles(list) if list.is_empty()),
        "{event:?}"
    );
    ask(
        &worker,
        &woken,
        Command::Open(fixture("generic/simple-batch.html")),
    );

    // Unknown site: nothing can be read until it is mapped.
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("map a new site")),
        "{event:?}"
    );

    let (event, _) = ask(&worker, &woken, Command::MapPage { ai: None });
    let Event::Mapped(found) = event else {
        panic!("expected a mapping, got {event:?}");
    };
    assert_eq!(found.students, 3);
    assert_eq!(found.samples.len(), 3);
    assert!(!found.samples[0].name.is_empty());
    assert_eq!(found.samples[0].max, Some(10.0));
    assert!(found.how.contains("without AI"));
    assert!(
        found
            .warnings
            .iter()
            .any(|w| w.contains("will not click Save")),
        "{:?}",
        found.warnings
    );

    let mut profile = found.profile;
    profile.name = "Practice LMS".into();
    let (event, _) = ask(&worker, &woken, Command::SaveProfile(Box::new(profile)));
    let Event::Profiles(list) = event else {
        panic!("expected the mappings, got {event:?}");
    };
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "Practice LMS");

    // The saved mapping can be had back whole and tried on the open page,
    // as the form that changes one does.
    let (event, _) = ask(&worker, &woken, Command::EditProfile(list[0].id.clone()));
    let Event::ProfileToEdit(saved) = event else {
        panic!("expected the saved mapping, got {event:?}");
    };
    let (event, _) = ask(&worker, &woken, Command::CheckProfile(saved.clone()));
    let Event::ProfileChecked(check) = event else {
        panic!("expected what the mapping found, got {event:?}");
    };
    assert!(check.passed, "{:?}", check.problems);
    assert!(check.students > 0 && !check.samples.is_empty());
    // With the score box pointed somewhere it is not, the check says so and
    // changes nothing that is saved.
    let mut wrong = saved.clone();
    wrong.page.score_input = "input.nowhere-at-all".into();
    let (event, _) = ask(&worker, &woken, Command::CheckProfile(wrong));
    let Event::ProfileChecked(check) = event else {
        panic!("expected what the mapping found, got {event:?}");
    };
    assert!(!check.passed);
    assert!(!check.problems.is_empty());

    // The mapping survives a restart of the app.
    drop(worker);
    let worker = spawn(wake);
    ask(&worker, &woken, Command::StartChrome { inside: false });
    let (event, _) = ask(&worker, &woken, Command::ListProfiles);
    assert!(
        matches!(&event, Event::Profiles(list) if list.len() == 1),
        "{event:?}"
    );
    ask(
        &worker,
        &woken,
        Command::Open(fixture("generic/simple-batch.html")),
    );

    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert_eq!(read.site, "Practice LMS");
    assert!(
        read.manual_save,
        "OGRE cannot confirm a save on a freshly mapped site"
    );
    assert_eq!(read.page.submissions.len(), 3);
    let first = &read.page.submissions[0];
    assert!(!first.response.is_empty());
    assert!(!first.has_nonzero_score());

    let write = plan_write(first, 7.0, "<p>Good start.</p>", WritePolicy::default()).unwrap();
    let (event, _) = ask(&worker, &woken, Command::Write(vec![write]));
    let Event::Written(written) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert_eq!(written.written, [0]);
    assert!(written.failed.is_empty(), "{:?}", written.failed);
    assert!(written.mismatches.is_empty(), "{:?}", written.mismatches);
    let page = written.page.unwrap();
    assert_eq!(page.submissions[0].score(), Some(7.0));
    assert_eq!(
        page.submissions[0].feedback.as_ref().unwrap().text,
        "Good start."
    );
    assert!(
        !page.submissions[1].has_nonzero_score(),
        "the next student is untouched"
    );

    // OGRE will not press Save where it could not tell whether it worked.
    let (event, _) = ask(&worker, &woken, Command::Save);
    assert!(matches!(event, Event::Failed(_)), "{event:?}");

    let (event, _) = ask(&worker, &woken, Command::DeleteProfile(list[0].id.clone()));
    assert!(
        matches!(&event, Event::Profiles(list) if list.is_empty()),
        "{event:?}"
    );
    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("map a new site")),
        "{event:?}"
    );

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// A worker with an empty data folder of its own, with Chrome started.
fn fresh_worker(test: &str) -> (Worker, mpsc::Receiver<()>, PathBuf) {
    let data_dir = std::env::temp_dir().join(format!("ogre-test-{test}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        Sites::built_in(),
        data_dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    ask(&worker, &woken, Command::StartChrome { inside: false });
    (worker, woken, data_dir)
}

/// A grading tool that a school's site shows inside a frame: the frame is
/// what gets mapped, read and filled, under the address the teacher has open.
#[test]
#[ignore = "needs Chrome installed"]
fn maps_a_tool_shown_in_a_frame_then_reads_and_fills_it() {
    let (worker, woken, data_dir) = fresh_worker("framed-tool");
    ask(
        &worker,
        &woken,
        Command::Open(fixture("generic/tool-in-a-frame.html")),
    );

    let (event, _) = ask(&worker, &woken, Command::MapPage { ai: None });
    let Event::Mapped(found) = event else {
        panic!("expected a mapping, got {event:?}");
    };
    assert_eq!(
        found.profile.page.frame.as_deref(),
        Some("iframe#tool_content")
    );
    assert_eq!(found.students, 3);
    assert!(
        found.warnings.iter().any(|w| w.contains("inside a frame")),
        "{:?}",
        found.warnings
    );
    let (event, _) = ask(
        &worker,
        &woken,
        Command::SaveProfile(Box::new(found.profile)),
    );
    assert!(
        matches!(&event, Event::Profiles(list) if list.len() == 1),
        "{event:?}"
    );

    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert_eq!(read.page.submissions.len(), 3);
    let second = &read.page.submissions[1];
    assert!(!second.response.is_empty());
    let write = plan_write(second, 7.0, "<p>Good start.</p>", WritePolicy::default()).unwrap();
    let (event, _) = ask(&worker, &woken, Command::Write(vec![write]));
    let Event::Written(written) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert_eq!(written.written, [1]);
    assert!(written.failed.is_empty(), "{:?}", written.failed);
    assert!(written.mismatches.is_empty(), "{:?}", written.mismatches);
    let page = written.page.unwrap();
    assert_eq!(page.submissions[1].score(), Some(7.0));
    assert!(!page.submissions[0].has_nonzero_score());

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// A page that is mostly one frame, where the frame is only a viewer of the
/// student's work and the marks are on the page itself. The frame is tried
/// first and comes to nothing, and the page is then mapped as it always was,
/// by the AI where its structure does not give it away.
#[test]
#[ignore = "needs Chrome installed"]
fn a_page_whose_large_frame_is_only_a_viewer_is_mapped_itself() {
    let (worker, woken, data_dir) = fresh_worker("viewer-frame");
    ask(
        &worker,
        &woken,
        Command::Open(fixture("generic/viewer-above-the-marks.html")),
    );

    // One student and no way to another: the structure rules give up, on
    // the frame and on the page alike.
    let (event, _) = ask(&worker, &woken, Command::MapPage { ai: None });
    assert!(
        matches!(&event, Event::Failed(m) if m.contains("structure alone")),
        "{event:?}"
    );

    // A stand-in AI that knows the page, and says the same of whatever it
    // is shown. What it says fits nothing in the frame.
    let reply = json!({
        "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
        "selectors": { "studentSection": "main.entry", "studentName": ".who", "scoreInput": "#marks", "feedbackBox": "#comments", "feedbackHidden": null, "questionRegion": "iframe#viewer", "fullCreditLink": null },
        "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
        "save": { "buttonText": "Save" },
        "confidence": "high"
    })
    .to_string();
    let (ai_address, ai_requests) = fake_ollama(move |_| reply.clone());
    let ai = Some((
        ProviderSettings {
            service: Service::Ollama,
            base_url: ai_address,
            model: "stand-in".into(),
        },
        None,
    ));
    let (event, _) = ask(&worker, &woken, Command::MapPage { ai });
    let Event::Mapped(found) = event else {
        panic!("expected a mapping, got {event:?}");
    };
    assert_eq!(
        found.profile.page.frame, None,
        "the page itself is what was mapped"
    );
    assert_eq!(found.profile.page.score_input, "#marks");
    assert_eq!(found.students, 1);
    assert_eq!(found.samples[0].name, "Avery, Sam");
    assert!(found.how.contains("by the AI"), "{}", found.how);
    assert!(
        ai_requests.lock().unwrap().len() > 1,
        "the frame was tried first, and the AI asked about it too"
    );

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// A site that shows one student at a time: mapped from its structure, told
/// by the teacher what shows that a save went through, then read from the
/// first student to the last and written with each grade saved as it goes.
#[test]
#[ignore = "needs Chrome installed"]
fn a_site_that_shows_one_student_at_a_time_is_mapped_read_and_written() {
    use ogre_harness::sites::generic::SaveSuccess;

    let (worker, woken, data_dir) = fresh_worker("one-at-a-time");
    ask(
        &worker,
        &woken,
        Command::Open(fixture("generic/one-at-a-time-buttons.html")),
    );

    let (event, _) = ask(&worker, &woken, Command::MapPage { ai: None });
    let Event::Mapped(found) = event else {
        panic!("expected a mapping, got {event:?}");
    };
    assert!(found.profile.page.steps_through_students());
    let said = |part: &str| found.warnings.iter().any(|w| w.contains(part));
    assert!(said("one student at a time"), "{:?}", found.warnings);
    // Structure cannot show how the site confirms a save, and says what
    // follows from that here.
    assert!(said("none can be written"), "{:?}", found.warnings);
    assert!(!said("will not click Save"), "{:?}", found.warnings);

    // The teacher adds it in the form on the Sites screen.
    let mut profile = found.profile.clone();
    profile.page.save.as_mut().expect("a save button").success = Some(SaveSuccess {
        selector: "#saved-note".into(),
        pattern: None,
    });
    let (event, _) = ask(
        &worker,
        &woken,
        Command::CheckProfile(Box::new(profile.clone())),
    );
    let Event::ProfileChecked(check) = event else {
        panic!("expected what the mapping found, got {event:?}");
    };
    assert!(check.passed, "{:?}", check.problems);
    let (event, _) = ask(&worker, &woken, Command::SaveProfile(Box::new(profile)));
    assert!(
        matches!(&event, Event::Profiles(list) if list.len() == 1),
        "{event:?}"
    );

    let (event, _) = ask(&worker, &woken, Command::ReadStudents);
    let Event::Read(read) = event else {
        panic!("expected students, got {event:?}");
    };
    assert!(read.saves_on_write, "each grade is saved as it is written");
    let names: Vec<&str> = read
        .page
        .submissions
        .iter()
        .map(|s| s.name.as_str())
        .collect();
    assert_eq!(
        names,
        ["Avery, Sam", "Brook, Kai", "Casey, Lin", "Drew, Pat"]
    );

    let writes = [(3, 12.0), (0, 15.0)]
        .map(|(at, score)| {
            plan_write(
                &read.page.submissions[at],
                score,
                "<p>Checked.</p>",
                WritePolicy::default(),
            )
            .unwrap()
        })
        .to_vec();
    let (event, _) = ask(&worker, &woken, Command::Write(writes));
    let Event::Written(written) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert_eq!(written.written, [3, 0]);
    assert!(written.failed.is_empty(), "{:?}", written.failed);
    assert!(written.mismatches.is_empty(), "{:?}", written.mismatches);
    // The fresh read after the write went through every student again.
    let page = written.page.unwrap();
    let scores: Vec<_> = page.submissions.iter().map(|s| s.score()).collect();
    assert_eq!(scores, [Some(15.0), None, None, Some(12.0)]);

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}

/// Agent mode on the saved page, with a scripted AI: it asks before it types
/// a score, does it when allowed, and leaves the page alone when refused.
#[test]
#[ignore = "needs Chrome installed"]
fn the_agent_asks_before_it_changes_a_score() {
    let data_dir = std::env::temp_dir().join(format!("ogre-test-agent-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);
    let (wake, woken) = mpsc::channel();
    let worker = Worker::spawn(
        LaunchOptions {
            profile_dir: data_dir.join("chrome-profile"),
            headless: true,
            executable: None,
        },
        saved_page_sites(),
        data_dir.clone(),
        move || {
            let _ = wake.send(());
        },
    );
    ask(&worker, &woken, Command::StartChrome { inside: false });
    ask(
        &worker,
        &woken,
        Command::Open(fixture("imathas-gradeallq2.html")),
    );

    // The scripted AI: type a score into Kai's box, then say it is done.
    let turn = Arc::new(Mutex::new(0));
    let (ai_address, ai_requests) = fake_ollama(move |_| {
        let mut turn = turn.lock().unwrap();
        *turn += 1;
        if *turn % 2 == 1 {
            json!({
                "action": "type",
                "params": { "selector": "#scorebox1", "text": "7", "clear": true },
                "reasoning": "Kai's answer deserves a 7.",
            })
        } else {
            json!({ "action": "done", "params": { "success": true, "message": "Entered the score." } })
        }
        .to_string()
    });
    let request = |auto| {
        Command::RunAgent(Box::new(AgentRequest {
            task: "Give Brook, Kai a 7.".into(),
            auto,
            screenshots: false,
            provider: ProviderSettings {
                service: Service::Ollama,
                base_url: ai_address.clone(),
                model: "stand-in".into(),
            },
            api_key: None,
            skill_choices: Default::default(),
            cancel: ogre_agent::CancelFlag::new(),
        }))
    };
    // Runs the agent, answering its one question with `answer`.
    let run = |command: Command, answer: AgentAnswer| {
        worker.send(command);
        let deadline = Instant::now() + Duration::from_secs(120);
        let mut questions = Vec::new();
        let mut lines = Vec::new();
        loop {
            for event in worker.poll() {
                match event {
                    Event::AgentAsks(question) => {
                        questions.push(question);
                        worker.answer(answer.clone());
                    }
                    Event::AgentLine(line) => lines.push(line),
                    Event::AgentDone(summary) => return (summary, questions, lines),
                    other => panic!("unexpected {other:?}"),
                }
            }
            let left = deadline.saturating_duration_since(Instant::now());
            woken
                .recv_timeout(left)
                .expect("the agent finishes in time");
        }
    };
    let kai_score = || {
        let (event, _) = ask(&worker, &woken, Command::ReadStudents);
        let Event::Read(read) = event else {
            panic!("expected students, got {event:?}");
        };
        read.page.submissions[1].scores[0].raw.clone()
    };
    assert_eq!(kai_score(), "0");

    // Even when it may act on its own, a score needs the teacher's OK. Refused: nothing changes.
    let (summary, questions, lines) = run(request(true), AgentAnswer::Deny("Not yet.".into()));
    assert_eq!(questions.len(), 1, "{questions:?}");
    assert!(
        questions[0].description.contains('7'),
        "{}",
        questions[0].description
    );
    assert!(
        !questions[0].reasons.is_empty(),
        "the score rule is why it asked"
    );
    assert_eq!(questions[0].reasoning, "Kai's answer deserves a 7.");
    assert!(
        lines.iter().any(|line| line.kind == LineKind::Step),
        "{lines:?}"
    );
    assert!(summary.finished, "{summary:?}");
    assert_eq!(kai_score(), "0", "a refused action must not run");
    // The refusal and its note reached the AI.
    let sent = ai_requests.lock().unwrap().last().unwrap().to_string();
    assert!(sent.contains("Not yet."), "{sent}");

    // Allowed: the score is typed into the right box, and nothing is saved.
    let (summary, questions, _) = run(request(true), AgentAnswer::Allow);
    assert_eq!(questions.len(), 1);
    assert_eq!(summary.message, "Entered the score.");
    assert_eq!(kai_score(), "7");

    // Stopping at the question ends the run.
    let (summary, _, _) = run(request(false), AgentAnswer::Stop);
    assert!(!summary.finished, "{summary:?}");

    drop(worker);
    let _ = std::fs::remove_dir_all(&data_dir);
}
