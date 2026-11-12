//! Drives the window with a stand-in for the worker thread.
//!
//! Set `OGRE_UI_SHOTS` to a folder to also save a picture of each state:
//!     OGRE_UI_SHOTS=/tmp/ogre-shots cargo test -p ogre-app --test window

use std::path::PathBuf;

use eframe::egui;
use egui_kittest::Harness;
use egui_kittest::kittest::Queryable;
use ogre_app::{
    AgentAnswer, AgentLine, AgentQuestion, AgentSummary, Command, Event, Grade, GradeReport,
    GradedRow, LineKind, MapReport, MemoryKeys, OgreApp, PastProposal, PastSession, PastStudent,
    ProfileSummary, ProviderSettings, ReadReport, Service, SessionEnd, Settings, StandIn, Worker,
    WriteReport,
};
use ogre_core::{
    FeedbackField, FeedbackKind, GradingPage, Position, Rubric, ScoreField, Submission,
};
use ogre_harness::sites::Mismatch;
use ogre_harness::sites::generic::{PageMap, SiteProfile, StudentSample, UrlRule};

fn shots_dir() -> Option<PathBuf> {
    std::env::var_os("OGRE_UI_SHOTS").map(PathBuf::from)
}

fn local_model() -> Settings {
    Settings {
        provider: ProviderSettings {
            service: Service::Ollama,
            base_url: String::new(),
            model: "gemma4:31b".into(),
        },
        ..Settings::default()
    }
}

fn window(settings: Settings) -> (Harness<'static, OgreApp>, StandIn) {
    let (worker, stand_in) = Worker::detached();
    let builder = Harness::builder().with_size([1200.0, 760.0]);
    // Rendering needs a graphics adapter, so only ask for one when saving pictures.
    let builder = if shots_dir().is_some() {
        builder.wgpu()
    } else {
        builder
    };
    let harness = builder.build_eframe(|cc| {
        OgreApp::new(
            &cc.egui_ctx,
            worker,
            settings,
            Box::new(MemoryKeys::default()),
        )
    });
    (harness, stand_in)
}

/// Draws a few frames. The busy spinner repaints forever, so the tests never
/// wait for the window to go still.
fn frames(harness: &mut Harness<'_, OgreApp>) {
    harness.run_steps(4);
}

fn shot(harness: &mut Harness<'_, OgreApp>, name: &str) {
    if let Some(dir) = shots_dir() {
        std::fs::create_dir_all(&dir).unwrap();
        let image = harness.render().expect("the window renders");
        image.save(dir.join(format!("{name}.png"))).unwrap();
    }
}

fn submission(index: usize, name: &str, raw: &str, feedback: &str, response: &str) -> Submission {
    let id = 1001 + index;
    Submission {
        index,
        student_id: Some(id.to_string()),
        name: name.into(),
        scores: vec![ScoreField {
            field: format!("ud-{id}-0-2-0"),
            label: "Score".into(),
            raw: raw.into(),
            max: Some(10.0),
        }],
        feedback: Some(FeedbackField {
            field: format!("fb-0-2-{id}"),
            kind: FeedbackKind::RichText,
            text: feedback.into(),
        }),
        response: response.into(),
        prompt: Some("Explain how sample size affects the margin of error.".into()),
    }
}

fn page() -> GradingPage {
    GradingPage {
        url: "https://www.myopenmath.com/course/gradeallq2.php?cid=1&aid=2&qid=3".into(),
        title: "Grading a Question in Unit 4 FRQ".into(),
        position: Some(Position {
            current: 1,
            total: 1,
        }),
        submissions: vec![
            submission(
                0,
                "Avery, Sam",
                "10",
                "Nice work, Sam.",
                "Larger samples shrink the standard error, so the margin of error gets smaller.",
            ),
            submission(
                1,
                "Brook, Kai",
                "0",
                "",
                "If you ask more people the answer is closer to the real one.",
            ),
            submission(2, "Cruz, Jo", "", "", ""),
            submission(
                3,
                "Diaz, Remy",
                "0",
                "",
                "Bigger n means a smaller standard error.",
            ),
        ],
    }
}

fn rubric() -> Rubric {
    serde_json::from_value(serde_json::json!({
        "essayPrompt": "Explain how sample size affects the margin of error.",
        "maxScore": 10,
        "checklistItems": [
            { "category": "Concept", "items": ["Mentions standard error", "States the direction"] },
            { "category": "Communication", "items": ["Uses course vocabulary"] }
        ],
        "rubricItems": [],
    }))
    .unwrap()
}

fn read() -> Event {
    Event::Read(ReadReport {
        page: page(),
        rubric: Ok(rubric()),
        site: "MyOpenMath",
        saves_on_write: false,
        manual_save: false,
    })
}

fn graded() -> Event {
    let grade = |index, score, html: &str, flag: Option<&str>| GradedRow {
        index,
        outcome: Ok(Grade {
            score,
            feedback_html: html.into(),
            flag: flag.map(Into::into),
        }),
    };
    Event::Graded(GradeReport {
        rubric_text: None,
        rows: vec![
            grade(
                1,
                6.0,
                "<p>Kai, you have the right idea. Name the <strong>standard error</strong>.</p>",
                None,
            ),
            grade(
                3,
                8.5,
                "<p>Remy, clear and correct.</p>",
                Some("A consistency check suggests 8 instead: similar to Kai's answer"),
            ),
        ],
        warnings: Vec::new(),
        cancelled: false,
    })
}

/// The next command the window sent, which must already be waiting.
fn sent(stand_in: &mut StandIn) -> Command {
    stand_in
        .commands
        .try_recv()
        .expect("the window sent a command")
}

#[test]
fn starts_by_offering_to_start_chrome() {
    let (mut harness, mut stand_in) = window(Settings::default());
    frames(&mut harness);

    harness.get_by_label("No students read yet.");
    assert!(harness.query_by_label("Read students").is_none());
    shot(&mut harness, "1-start");

    harness.get_by_label("Start Chrome").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::StartChrome));
    harness.get_by_label("Starting Chrome…");
}

#[test]
fn lists_students_and_shows_one_when_its_row_is_clicked() {
    let (mut harness, stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Grading a Question in Unit 4 FRQ");
    harness.get_by_label("MyOpenMath · 4 students, 3 with no points yet · page 1 of 1");
    harness.get_by_label("Has points");
    harness.get_by_label("No response");
    assert_eq!(harness.query_all_by_label("Ungraded").count(), 2);
    assert!(harness.query_by_label("Question").is_none());

    harness.get_by_label("Brook, Kai").click();
    frames(&mut harness);

    harness.get_by_label("Question");
    harness.get_by_label("On the page: 0/10");
    shot(&mut harness, "2-students");
}

#[test]
fn grading_needs_a_model_and_says_when_work_leaves_the_computer() {
    let (mut harness, stand_in) = window(Settings::default());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Choose a model in Settings first.");

    let remote = Settings {
        provider: ProviderSettings {
            service: Service::Anthropic,
            base_url: String::new(),
            model: "claude-test".into(),
        },
        ..Settings::default()
    };
    let (mut harness, stand_in) = window(remote);
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Enter an API key in Settings first.");
}

#[test]
fn grades_fills_and_saves_one_explicit_step_at_a_time() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);

    // Only the two ungraded students with a response are sent.
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    let names: Vec<_> = request.students.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, ["Brook, Kai", "Diaz, Remy"]);
    assert_eq!(request.provider.model, "gemma4:31b");
    assert_eq!(request.rubric.checklist_items.len(), 2);
    assert_eq!(request.rubric_text, None, "the rubric was not edited");
    assert!(
        harness.query_by_label_contains("Fill in").is_none(),
        "nothing to write yet"
    );

    stand_in
        .events
        .send(Event::GradeProgress { done: 1, total: 2 })
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Grading… 1 of 2");
    // A clock appears once the wait is long enough to wonder about.
    assert!(harness.query_by_label_contains("0:0").is_none());
    harness.run_steps(40);
    harness.get_by_label_contains("0:1");

    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    assert_eq!(harness.query_all_by_label("Ready to write").count(), 2);
    assert!(
        harness.query_by_label_contains("Save on").is_none(),
        "nothing to save yet"
    );
    harness.get_by_label("Diaz, Remy").click();
    frames(&mut harness);
    harness.get_by_label("A consistency check suggests 8 instead: similar to Kai's answer");
    shot(&mut harness, "3-proposed");

    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    let Command::Write(writes) = sent(&mut stand_in) else {
        panic!("expected a write");
    };
    assert_eq!(writes.len(), 2);
    assert_eq!(
        (writes[0].name.as_str(), writes[0].score.value),
        ("Brook, Kai", 6.0)
    );
    assert_eq!(writes[0].score.field, "ud-1002-0-2-0");
    assert_eq!(writes[0].score.expected, "0");
    assert_eq!(
        writes[0].feedback.as_ref().unwrap().html,
        "<p>Kai, you have the right idea. Name the <strong>standard error</strong>.</p>"
    );
    assert_eq!(
        (writes[1].name.as_str(), writes[1].score.value),
        ("Diaz, Remy", 8.5)
    );

    let mut filled = page();
    filled.submissions[1].scores[0].raw = "6".into();
    filled.submissions[3].scores[0].raw = "8.5".into();
    stand_in
        .events
        .send(Event::Written(WriteReport {
            written: vec![1, 3],
            failed: vec![],
            mismatches: vec![],
            page: Some(filled.clone()),
        }))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label(
        "2 grades filled in on the page and checked. Nothing is saved until you save on MyOpenMath.",
    );
    // Both rows, and the details of the student that is open.
    assert_eq!(harness.query_all_by_label("Filled in").count(), 3);
    assert!(
        stand_in.commands.try_recv().is_err(),
        "saving is never automatic"
    );
    shot(&mut harness, "4-filled");

    harness.get_by_label("Save on MyOpenMath").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::Save));

    stand_in.events.send(Event::Saved(Some(filled))).unwrap();
    frames(&mut harness);
    harness.get_by_label("MyOpenMath confirmed the save.");
    assert!(harness.query_by_label_contains("Save on").is_none());
    // Sam, Kai and Remy now have points; Remy's details are open too.
    assert_eq!(harness.query_all_by_label("Has points").count(), 4);
    shot(&mut harness, "5-saved");
}

#[test]
fn the_rubric_can_be_edited_before_grading() {
    const EDITOR: &str = "Requirements and model response";
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    harness.get_by_label("3 requirements in 2 categories, no model response.");
    assert!(harness.query_by_label("Edited").is_none());

    // A requirement is typed on a line of its own, in plain words.
    harness.get_by_label(EDITOR).click();
    frames(&mut harness);
    harness.key_press(egui::Key::End);
    harness.key_press(egui::Key::Enter);
    harness.get_by_label(EDITOR).type_text("Shows every step");
    frames(&mut harness);
    harness.get_by_label("Edited");
    harness.get_by_label("4 requirements in 2 categories, no model response.");
    assert!(
        harness
            .query_by_label_contains("will not be used")
            .is_none()
    );
    shot(&mut harness, "12-rubric-edited");

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    let text = request.rubric_text.expect("the edited rubric is sent");
    assert!(text.contains("\nShows every step\n"), "{text}");
    assert!(!text.contains("pts)"), "{text}");
    assert!(text.starts_with("## Concept\n"), "{text}");
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    // Going back to the page's rubric sends none of the edits.
    harness.get_by_label("Use the page\u{2019}s rubric").click();
    frames(&mut harness);
    assert!(harness.query_by_label("Edited").is_none());
    harness.get_by_label("3 requirements in 2 categories, no model response.");
}

#[test]
fn a_write_the_page_did_not_keep_blocks_saving() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::Write(_)));

    stand_in
        .events
        .send(Event::Written(WriteReport {
            written: vec![1, 3],
            failed: vec![],
            mismatches: vec![Mismatch {
                name: "Brook, Kai".into(),
                problem: "score should be 6 but the page shows 2".into(),
            }],
            page: None,
        }))
        .unwrap();
    frames(&mut harness);

    harness
        .get_by_label_contains("Stopped: the page does not show what was written for Brook, Kai.");
    harness.get_by_label("Check this: score should be 6 but the page shows 2");
    harness.get_by_label("Save on MyOpenMath").click();
    frames(&mut harness);
    assert!(
        stand_in.commands.try_recv().is_err(),
        "a blocked session cannot be saved"
    );
    shot(&mut harness, "6-blocked");
}

#[test]
fn a_running_grade_can_be_stopped_and_failures_are_shown() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert!(!request.cancel.is_cancelled());

    harness.get_by_label("Stop").click();
    frames(&mut harness);
    assert!(request.cancel.is_cancelled());

    stand_in
        .events
        .send(Event::Graded(GradeReport {
            rubric_text: None,
            rows: vec![GradedRow {
                index: 1,
                outcome: Err("grading was cancelled first".into()),
            }],
            warnings: vec![],
            cancelled: true,
        }))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Grading was stopped before it finished.");
    harness.get_by_label("Not graded: grading was cancelled first");

    stand_in
        .events
        .send(Event::Failed("No grading page is open.".into()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("No grading page is open.");

    stand_in
        .events
        .send(Event::ChromeStopped("connection closed".into()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Chrome is no longer running (connection closed).");
    harness.get_by_label("Start Chrome");
}

#[test]
fn settings_choose_the_service_and_list_its_models() {
    let (mut harness, mut stand_in) = window(Settings::default());
    frames(&mut harness);
    harness.get_by_label("Settings").click();
    frames(&mut harness);
    harness.get_by_label("AI service");
    harness.get_by_label("List models").click();
    frames(&mut harness);
    let Command::ListModels { provider, api_key } = sent(&mut stand_in) else {
        panic!("expected a model list request");
    };
    assert_eq!(provider.service, Service::Ollama);
    assert_eq!(api_key, None);

    stand_in
        .events
        .send(Event::Models(Ok(vec![
            "gemma4:31b".into(),
            "qwen3:0.6b".into(),
        ])))
        .unwrap();
    frames(&mut harness);
    harness.get_by_value("Choose");
    shot(&mut harness, "7-settings");

    stand_in
        .events
        .send(Event::Models(Err(
            "could not reach http://localhost:11434".into()
        )))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("could not reach http://localhost:11434");
}

#[test]
fn the_dock_switches_screens_and_between_light_and_dark() {
    let (mut harness, stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Brook, Kai").click();
    frames(&mut harness);

    harness.get_by_label("Switch to dark mode").click();
    frames(&mut harness);
    harness.get_by_label("Switch to light mode");
    shot(&mut harness, "8-dark");

    harness.get_by_label("Settings").click();
    frames(&mut harness);
    harness.get_by_label("AI service");
    assert!(harness.query_by_label("Brook, Kai").is_none());
    shot(&mut harness, "9-settings-dark");

    // The session is still there when coming back.
    harness.get_by_label("Grade").click();
    frames(&mut harness);
    harness.get_by_label("Fill in 2 grades");
}

fn found_mapping() -> Event {
    let page: PageMap = serde_json::from_value(serde_json::json!({
        "student_section": "div.student",
        "student_name": "b",
        "score_input": "input.score",
        "response": "div.answer",
    }))
    .unwrap();
    let profile = SiteProfile::new(
        "grades-example-edu",
        "grades.example.edu",
        UrlRule::new("grades.example.edu", "/course/*/grade"),
        page,
    );
    let sample = |name: &str, score: &str, chars| StudentSample {
        name: name.into(),
        score: score.into(),
        max: Some(10.0),
        response_chars: chars,
        has_feedback_box: true,
    };
    Event::Mapped(Box::new(MapReport {
        profile,
        how: "Worked out from the page's structure, without AI.".into(),
        students: 24,
        samples: vec![sample("Avery, Sam", "", 212), sample("Brook, Kai", "7", 96)],
        warnings: vec!["OGRE will fill in grades on this site but will not click Save.".into()],
    }))
}

#[test]
fn maps_a_new_site_and_keeps_the_mapping_only_when_told_to() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);

    harness.get_by_label("Sites").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListProfiles));
    stand_in.events.send(Event::Profiles(vec![])).unwrap();
    frames(&mut harness);
    harness.get_by_label("You have not mapped any site yet.");
    harness.get_by_label("MyOpenMath");
    harness.get_by_label("Canvas");

    // Without AI first: nothing leaves the computer.
    harness.get_by_label("Map the open page").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::MapPage { ai: None }));

    stand_in.events.send(found_mapping()).unwrap();
    frames(&mut harness);
    harness.get_by_label("What OGRE found");
    harness.get_by_label("Not saved yet");
    harness.get_by_label("24 students on this page. Check that these match what you see:");
    harness.get_by_label("–/10");
    harness.get_by_label("7/10");
    harness.get_by_label("OGRE will fill in grades on this site but will not click Save.");
    assert!(
        stand_in.commands.try_recv().is_err(),
        "a mapping is never saved on its own"
    );
    shot(&mut harness, "10-sites-found");

    harness.get_by_label("Save this mapping").click();
    frames(&mut harness);
    let Command::SaveProfile(profile) = sent(&mut stand_in) else {
        panic!("expected the mapping to be saved");
    };
    assert_eq!(profile.name, "grades.example.edu");
    stand_in
        .events
        .send(Event::Profiles(vec![ProfileSummary {
            id: profile.id.clone(),
            name: profile.name.clone(),
            pages: "grades.example.edu/course/*/grade".into(),
        }]))
        .unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("What OGRE found").is_none());
    harness.get_by_label("grades.example.edu/course/*/grade");
    shot(&mut harness, "11-sites-saved");

    harness.get_by_label("Remove grades.example.edu").click();
    frames(&mut harness);
    assert!(
        matches!(sent(&mut stand_in), Command::DeleteProfile(id) if id == "grades-example-edu")
    );

    // With AI, the model is the one from Settings.
    stand_in.events.send(Event::Profiles(vec![])).unwrap();
    frames(&mut harness);
    harness.get_by_label("Map with AI").click();
    frames(&mut harness);
    let Command::MapPage {
        ai: Some((provider, key)),
    } = sent(&mut stand_in)
    else {
        panic!("expected an AI mapping request");
    };
    assert_eq!(provider.model, "gemma4:31b");
    assert_eq!(key, None);
}

#[test]
fn a_site_ogre_cannot_confirm_saving_on_is_saved_by_the_teacher() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in
        .events
        .send(Event::Read(ReadReport {
            page: page(),
            rubric: Ok(rubric()),
            site: "Practice LMS",
            saves_on_write: false,
            manual_save: true,
        }))
        .unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::Write(_)));
    stand_in
        .events
        .send(Event::Written(WriteReport {
            written: vec![1, 3],
            failed: vec![],
            mismatches: vec![],
            page: None,
        }))
        .unwrap();
    frames(&mut harness);

    harness.get_by_label_contains("OGRE cannot confirm a save on Practice LMS");
    assert!(harness.query_by_label("Save on Practice LMS").is_none());
}

#[test]
fn the_agent_asks_and_the_teacher_answers() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    harness.get_by_label("Agent").click();
    frames(&mut harness);

    // Nothing to start until there is a task.
    harness.get_by_label("Start").click();
    frames(&mut harness);
    assert!(stand_in.commands.try_recv().is_err());

    harness.get_by_label("Task").click();
    harness
        .get_by_label("Task")
        .type_text("Which students have no score yet?");
    frames(&mut harness);
    harness.get_by_label("Start").click();
    frames(&mut harness);
    let Command::RunAgent(request) = sent(&mut stand_in) else {
        panic!("expected the agent to start");
    };
    assert_eq!(request.task, "Which students have no score yet?");
    assert!(!request.auto, "asking first is the default");
    assert!(!request.screenshots, "no pictures unless the teacher asks");
    harness.get_by_label("The agent is working…");

    stand_in
        .events
        .send(Event::AgentLine(AgentLine {
            kind: LineKind::Step,
            text: "Read the text of the page".into(),
        }))
        .unwrap();
    stand_in
        .events
        .send(Event::AgentAsks(AgentQuestion {
            step: 2,
            description: "Click the button \"Quick Save\"".into(),
            reasoning: "The scores should be saved.".into(),
            reasons: vec!["This saves or submits something.".into()],
        }))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Needs your OK");
    harness.get_by_label("Click the button \"Quick Save\"");
    harness.get_by_label("This saves or submits something.");
    harness.get_by_label("1. Read the text of the page");
    shot(&mut harness, "12-agent-asks");
    assert!(
        stand_in.answers.try_recv().is_err(),
        "nothing is allowed until the teacher says so"
    );

    harness.get_by_label("Tell it why not").click();
    harness
        .get_by_label("Tell it why not")
        .type_text("Do not save.");
    frames(&mut harness);
    harness.get_by_label("Don't do this").click();
    frames(&mut harness);
    assert_eq!(
        stand_in.answers.try_recv().unwrap(),
        AgentAnswer::Deny("Do not save.".into())
    );
    assert!(harness.query_by_label("Needs your OK").is_none());

    // Stop works while it is running, and reaches the agent.
    harness.get_by_label("Stop").click();
    frames(&mut harness);
    assert!(request.cancel.is_cancelled());
    assert_eq!(stand_in.answers.try_recv().unwrap(), AgentAnswer::Stop);

    stand_in
        .events
        .send(Event::AgentDone(AgentSummary {
            finished: true,
            message: "Diaz, Remy has no score yet.".into(),
        }))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Finished");
    harness.get_by_label("Diaz, Remy has no score yet.");
    shot(&mut harness, "13-agent-done");
}

fn past_student(
    name: &str,
    on_page: Option<f64>,
    proposed: f64,
    written: Option<&str>,
) -> PastStudent {
    PastStudent {
        name: name.into(),
        on_page,
        proposal: Some(PastProposal::Score(proposed)),
        written: written.map(Into::into),
    }
}

fn past_sessions() -> Vec<PastSession> {
    vec![
        PastSession {
            at: 1_794_448_102,
            url: "https://www.myopenmath.com/course/gradeallq2.php?cid=1&aid=2&qid=3".into(),
            title: "Grading a Question in Unit 4 FRQ".into(),
            site: Some("MyOpenMath".into()),
            students: vec![
                PastStudent {
                    name: "Avery, Sam".into(),
                    on_page: Some(10.0),
                    ..PastStudent::default()
                },
                past_student("Brook, Kai", Some(0.0), 6.0, Some("6")),
                PastStudent {
                    name: "Cruz, Jo".into(),
                    on_page: None,
                    proposal: Some(PastProposal::NotGraded("the AI gave no score".into())),
                    written: None,
                },
                past_student("Diaz, Remy", Some(0.0), 8.5, Some("8.5")),
            ],
            rubric: Some("## Concept [100%]\nMentions standard error (0pts)".into()),
            problems: vec![],
            end: SessionEnd::FilledIn,
        },
        PastSession {
            at: 1_794_000_000,
            url: "https://canvas.example.edu/courses/1/gradebook/speed_grader?assignment_id=2"
                .into(),
            title: "Essay 2".into(),
            site: None,
            students: vec![past_student("Avery, Sam", None, 9.0, Some("9"))],
            rubric: None,
            problems: vec![],
            end: SessionEnd::Saved,
        },
    ]
}

#[test]
fn history_lists_past_sessions_and_shows_one_in_detail() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);

    harness.get_by_label("History").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListHistory));
    stand_in.events.send(Event::History(vec![])).unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("Nothing has been graded yet.");

    // Coming back to the screen reads the records again.
    harness.get_by_label("Grade").click();
    frames(&mut harness);
    harness.get_by_label("History").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListHistory));
    stand_in
        .events
        .send(Event::History(past_sessions()))
        .unwrap();
    frames(&mut harness);

    harness.get_by_label("Grading a Question in Unit 4 FRQ");
    harness.get_by_label("2 graded");
    // Filled in with no save on record is the thing to look at.
    harness.get_by_label("2 filled in, no save recorded");
    harness.get_by_label("1 not graded");
    harness.get_by_label("Essay 2");
    harness.get_by_label("1 saved");
    // A record without a site name falls back to the address's host.
    harness.get_by_label_contains("canvas.example.edu");
    assert!(harness.query_by_label("Brook, Kai").is_none());
    shot(&mut harness, "13-history");

    let show: Vec<_> = harness.query_all_by_label("Show details").collect();
    assert_eq!(show.len(), 2);
    show[0].click();
    frames(&mut harness);
    harness.get_by_label("Brook, Kai");
    harness.get_by_label("Diaz, Remy");
    // Proposed and written, side by side.
    assert_eq!(harness.query_all_by_label("8.5").count(), 2);
    harness.get_by_label("Not graded: the AI gave no score");
    assert!(
        harness.query_by_label("Avery, Sam").is_none(),
        "a student nothing happened to is not listed"
    );
    shot(&mut harness, "14-history-details");

    // The page can be opened again from here.
    harness.get_by_label("Open this page").click();
    frames(&mut harness);
    let Command::Open(address) = sent(&mut stand_in) else {
        panic!("expected the page to be opened");
    };
    assert!(address.contains("gradeallq2.php"));
    harness.get_by_label("Read students");
}
