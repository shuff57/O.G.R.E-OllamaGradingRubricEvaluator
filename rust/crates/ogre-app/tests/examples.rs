//! Kept examples through the real worker thread, with a stand-in for the AI
//! service: a folder on this computer, and a real examples server. No
//! browser is needed, so these run by default.

mod common;

use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use common::{ask, fake_ollama};
use ogre_app::{
    Command, Event, ExamplesFor, ExamplesPlace, GradeReport, GradeRequest, ProviderSettings,
    Service, Worker,
};
use ogre_core::{Rubric, StudentWork};
use ogre_examples::server::listen;
use ogre_examples::{FolderStore, GradedExample, rubric_id};
use ogre_grader::CancelFlag;
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;
use serde_json::{Value, json};

const QUESTION: &str = "Explain how sample size affects the margin of error.";
const KEY: &str = "the-key-of-a-test-0123456789";

/// What the grader's prompt calls the teacher's earlier grades.
const EARLIER: &str = "HISTORICAL CALIBRATION EXAMPLES";

/// A worker with a data folder of its own and a stand-in AI that gives
/// every student 7.
struct Bench {
    worker: Worker,
    woken: mpsc::Receiver<()>,
    data_dir: PathBuf,
    ai_address: String,
    ai_requests: Arc<Mutex<Vec<Value>>>,
}

impl Bench {
    fn new(test: &str) -> Self {
        let data_dir =
            std::env::temp_dir().join(format!("ogre-test-examples-{test}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data_dir);
        let (wake, woken) = mpsc::channel();
        // Chrome is never started: grading does not need it.
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
        let (ai_address, ai_requests) = fake_ollama(|_| {
            json!([{ "studentIndex": 0, "score": 7, "feedback": "<p>Fine.</p>" }]).to_string()
        });
        Self {
            worker,
            woken,
            data_dir,
            ai_address,
            ai_requests,
        }
    }

    /// Where examples kept on this computer are.
    fn folder(&self) -> FolderStore {
        FolderStore::new(self.data_dir.join("examples"))
    }

    /// Grades one student, with the teacher's earlier grades fetched from
    /// `earlier`. Gives the report and what the AI was sent.
    fn grade(&self, earlier: Option<ExamplesFor>) -> (GradeReport, String) {
        self.ai_requests.lock().unwrap().clear();
        let rubric: Rubric = serde_json::from_value(json!({
            "essayPrompt": QUESTION,
            "maxScore": 10,
            "checklistItems": [{ "category": "Concept", "items": ["Mentions standard error"] }],
            "rubricItems": [],
        }))
        .unwrap();
        let request = GradeRequest {
            rubric,
            rubric_text: None,
            students: vec![StudentWork {
                index: 0,
                name: "Brook, Kai".into(),
                response: "If you ask more people the answer is closer to the real one.".into(),
                prompt: None,
            }],
            provider: ProviderSettings {
                service: Service::Ollama,
                base_url: self.ai_address.clone(),
                model: "stand-in".into(),
            },
            api_key: None,
            // The rubric as written: no call to reword it.
            leniency: 50,
            score_from_verdicts: false,
            examples: None,
            skill_choices: Default::default(),
            earlier,
            cancel: CancelFlag::new(),
        };
        let (event, _) = ask(&self.worker, &self.woken, Command::Grade(Box::new(request)));
        let Event::Graded(report) = event else {
            panic!("expected grades, got {event:?}");
        };
        let sent: Vec<String> = self
            .ai_requests
            .lock()
            .unwrap()
            .iter()
            .map(Value::to_string)
            .collect();
        (report, sent.join("\n"))
    }

    fn count(&self, place: ExamplesPlace) -> Result<usize, String> {
        match ask(&self.worker, &self.woken, Command::CountExamples(place)).0 {
            Event::ExamplesCounted(counted) => counted,
            other => panic!("expected a count, got {other:?}"),
        }
    }

    fn delete(&self, place: ExamplesPlace) -> Result<usize, String> {
        match ask(&self.worker, &self.woken, Command::DeleteExamples(place)).0 {
            Event::ExamplesDeleted(deleted) => deleted,
            other => panic!("expected a count of what was deleted, got {other:?}"),
        }
    }
}

impl Drop for Bench {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.data_dir);
    }
}

fn this_question() -> String {
    rubric_id(QUESTION, "", 10.0).unwrap()
}

/// Three grades a teacher approved before: a high, a middle and a low one.
fn approved_before() -> Vec<GradedExample> {
    [
        (9.0, "Names the standard error and says which way it goes."),
        (5.0, "Has the direction but never names the standard error."),
        (2.0, "Only a conclusion."),
    ]
    .into_iter()
    .map(|(score, feedback)| GradedExample {
        score,
        max_score: 10.0,
        feedback: feedback.to_owned(),
        changed: false,
        at: 1_700_000_000,
    })
    .collect()
}

fn graded_one(report: &GradeReport) -> bool {
    report.rows.len() == 1 && report.rows[0].outcome.is_ok()
}

#[test]
fn the_grader_is_shown_grades_kept_on_this_computer() {
    let bench = Bench::new("this-computer");
    let here = || ExamplesFor {
        place: ExamplesPlace::ThisComputer,
        rubric: this_question(),
    };

    // Nothing is kept yet: grading goes on as it always did.
    let (report, sent) = bench.grade(Some(here()));
    assert!(graded_one(&report), "{report:?}");
    assert_eq!(report.earlier, 0);
    assert_eq!(report.warnings, Vec::<String>::new());
    assert!(!sent.contains(EARLIER), "{sent}");

    bench
        .folder()
        .add(&this_question(), &approved_before())
        .unwrap();
    let (report, sent) = bench.grade(Some(here()));
    assert!(graded_one(&report), "{report:?}");
    assert_eq!(report.earlier, 3);
    assert_eq!(report.warnings, Vec::<String>::new());
    let shown = &sent[sent
        .find(EARLIER)
        .expect("the earlier grades are in the prompt")..];
    assert!(
        shown.contains("9/10: Names the standard error and says which way it goes."),
        "{shown}"
    );
    assert!(shown.contains("2/10: Only a conclusion."), "{shown}");

    // A teacher who does not have them kept shows the grader none.
    let (report, sent) = bench.grade(None);
    assert_eq!(report.earlier, 0);
    assert!(!sent.contains(EARLIER));

    // Another question's grades are not this one's.
    let (report, sent) = bench.grade(Some(ExamplesFor {
        place: ExamplesPlace::ThisComputer,
        rubric: rubric_id("What is a p-value?", "", 10.0).unwrap(),
    }));
    assert_eq!(report.earlier, 0);
    assert!(!sent.contains(EARLIER));

    // They can be counted, and deleted for good.
    assert_eq!(bench.count(ExamplesPlace::ThisComputer), Ok(3));
    assert_eq!(bench.delete(ExamplesPlace::ThisComputer), Ok(3));
    assert_eq!(bench.count(ExamplesPlace::ThisComputer), Ok(0));
    let (report, sent) = bench.grade(Some(here()));
    assert_eq!(report.earlier, 0);
    assert!(!sent.contains(EARLIER));
}

#[test]
fn the_grader_is_shown_grades_kept_on_a_server() {
    let bench = Bench::new("server");
    let server_folder = bench.data_dir.join("on-the-server");
    let listening = listen("127.0.0.1:0".parse().unwrap(), &server_folder, KEY, 2).unwrap();
    let server = || ExamplesPlace::Server {
        address: format!("http://{}", listening.address),
        key: Some(KEY.to_owned()),
    };
    FolderStore::new(&server_folder)
        .add(&this_question(), &approved_before())
        .unwrap();

    let (report, sent) = bench.grade(Some(ExamplesFor {
        place: server(),
        rubric: this_question(),
    }));
    assert!(graded_one(&report), "{report:?}");
    assert_eq!(report.earlier, 3);
    assert_eq!(report.warnings, Vec::<String>::new());
    assert!(
        sent.contains("5/10: Has the direction but never names the standard error."),
        "{sent}"
    );
    assert_eq!(
        bench.folder().count(),
        Ok(0),
        "nothing was copied to this computer"
    );

    assert_eq!(bench.count(server()), Ok(3));
    assert_eq!(bench.delete(server()), Ok(3));
    assert_eq!(FolderStore::new(&server_folder).count(), Ok(0));
}

#[test]
fn grading_goes_on_when_the_examples_cannot_be_fetched() {
    let bench = Bench::new("unreachable");
    let server_folder = bench.data_dir.join("on-the-server");
    let listening = listen("127.0.0.1:0".parse().unwrap(), &server_folder, KEY, 2).unwrap();
    FolderStore::new(&server_folder)
        .add(&this_question(), &approved_before())
        .unwrap();
    let with_key = |key: Option<&str>| ExamplesPlace::Server {
        address: format!("http://{}", listening.address),
        key: key.map(str::to_owned),
    };

    let (report, sent) = bench.grade(Some(ExamplesFor {
        place: with_key(Some("not-the-key-0123456789abcd")),
        rubric: this_question(),
    }));
    assert!(
        graded_one(&report),
        "the student is graded all the same: {report:?}"
    );
    assert_eq!(report.earlier, 0);
    assert!(!sent.contains(EARLIER));
    assert_eq!(
        report.warnings,
        [
            "Your earlier grades for this question could not be fetched, so the grader was \
             not shown them: The examples server did not accept the key."
        ]
    );

    // The same for a key that was never entered, and for an address that
    // would send the key in the clear.
    assert_eq!(
        bench.count(with_key(None)),
        Err("Enter the server\u{2019}s key.".to_owned())
    );
    let in_the_clear = ExamplesPlace::Server {
        address: "http://school.example".into(),
        key: Some(KEY.to_owned()),
    };
    let refused = bench.count(in_the_clear).unwrap_err();
    assert!(refused.contains("https://"), "{refused}");
    assert_eq!(FolderStore::new(&server_folder).count(), Ok(3));
}
