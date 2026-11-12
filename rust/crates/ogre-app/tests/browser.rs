//! Runs the real worker thread end to end: a headless Chrome on a saved
//! grading page, and a stand-in for the AI service.
//!
//! Needs Chrome or Edge installed, so this is skipped by default:
//!     cargo test -p ogre-app --test browser -- --ignored

mod common;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::{fixture, saved_page_sites};
use ogre_app::{
    AgentAnswer, AgentRequest, Command, Event, GradeRequest, LineKind, ProviderSettings, Service,
    Worker,
};
use ogre_core::{StudentWork, WritePolicy, plan_write};
use ogre_grader::CancelFlag;
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;
use serde_json::{Value, json};

/// Sends one command and waits for the event that ends it. Progress events
/// seen on the way are returned too.
fn ask(worker: &Worker, woken: &mpsc::Receiver<()>, command: Command) -> (Event, Vec<Event>) {
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
fn fake_ollama(
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
    let (event, _) = ask(&worker, &woken, Command::StartChrome);
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
    let (event, _) = ask(&worker, &woken, Command::StartChrome);
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
        cancel: CancelFlag::new(),
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
    let (event, progress) = ask(&worker, &woken, Command::Write(writes.clone()));
    let Event::Written(written) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert_eq!(written.written, [1, 3]);
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
    let (event, _) = ask(&worker, &woken, Command::Write(writes));
    let Event::Written(again) = event else {
        panic!("expected a write report, got {event:?}");
    };
    assert!(again.written.is_empty());
    assert_eq!(again.failed.len(), 2);
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

    ask(&worker, &woken, Command::StartChrome);
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
        cancel: CancelFlag::new(),
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

    ask(&worker, &woken, Command::StartChrome);
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

    // The mapping survives a restart of the app.
    drop(worker);
    let worker = spawn(wake);
    ask(&worker, &woken, Command::StartChrome);
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
    ask(&worker, &woken, Command::StartChrome);
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
