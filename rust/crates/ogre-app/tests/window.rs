//! Drives the window with a stand-in for the worker thread.
//!
//! Set `OGRE_UI_SHOTS` to a folder to also save a picture of each state:
//!     OGRE_UI_SHOTS=/tmp/ogre-shots cargo test -p ogre-app --test window

use std::path::PathBuf;

use eframe::egui;
use egui_kittest::Harness;
use egui_kittest::kittest::Queryable;
use ogre_agent::{InterviewTurn, SkillDraft};
use ogre_app::{
    AgentAnswer, AgentLine, AgentQuestion, AgentSummary, Command, Event, Grade, GradeReport,
    GradedRow, LineKind, MapReport, MemoryKeys, OgreApp, OutsideRubric, PastProposal, PastSession,
    PastStudent, ProfileSummary, ProviderSettings, ReadReport, SavedRubric, Service, SessionEnd,
    Settings, SkillSummary, StandIn, Suggestion, ViewInput, Worker, WriteReport,
};
use ogre_core::{
    FeedbackField, FeedbackKind, GradingPage, Position, QuestionLink, Rubric, ScoreField,
    Submission,
};
use ogre_harness::cdp::{DialogKind, Held, MouseAction, MouseButton, PageDialog};
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
    Event::Read(Box::new(ReadReport {
        page: page(),
        rubric: Ok(rubric()),
        site: "MyOpenMath",
        saves_on_write: false,
        manual_save: false,
        questions: Vec::new(),
        saved_rubrics: Vec::new(),
        skills: Vec::new(),
    }))
}

fn graded() -> Event {
    let grade = |index, score, html: &str, suggestion: Option<Suggestion>| GradedRow {
        index,
        outcome: Ok(Grade {
            score,
            feedback_html: html.into(),
            flag: None,
            suggestion,
        }),
    };
    Event::Graded(GradeReport {
        rubric_text: None,
        examples: None,
        skills: Vec::new(),
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
                Some(Suggestion {
                    score: 8.0,
                    feedback_html: Some("<p>Remy, correct, but say why.</p>".into()),
                    reason: Some("Kai gave the same reasoning and got less.".into()),
                }),
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
    assert!(matches!(
        sent(&mut stand_in),
        Command::StartChrome { inside: false }
    ));
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
    // The usual leniency is the Electron app's most lenient, which is 0 on
    // the grading engine's scale.
    assert_eq!(request.leniency, 0);
    harness.get_by_label_contains("The usual setting: the AI rewords the rubric");
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
    harness.get_by_label("Ready to write");
    // The consistency check proposes something else for Remy. It is marked
    // and waits for a decision; nothing is changed by itself.
    harness.get_by_label("Has a suggestion");
    harness.get_by_label_contains("suggests a different grade for 1 student");
    assert!(
        harness.query_by_label_contains("Save on").is_none(),
        "nothing to save yet"
    );
    harness.get_by_label("Diaz, Remy").click();
    frames(&mut harness);
    harness.get_by_label(
        "8 instead of 8.5, with feedback rewritten to match. Kai gave the same reasoning and got less.",
    );
    shot(&mut harness, "3-proposed");
    harness.get_by_label("Keep the proposal").click();
    frames(&mut harness);
    assert!(harness.query_by_label("Has a suggestion").is_none());
    assert!(harness.query_by_label("Use the suggestion").is_none());
    // Both rows of the table, and once more in Remy's open panel.
    assert_eq!(harness.query_all_by_label("Ready to write").count(), 3);

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
    let (mut harness, mut stand_in) = rubric_open(read());
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
            examples: None,
            skills: Vec::new(),
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
        .send(Event::Read(Box::new(ReadReport {
            page: page(),
            rubric: Ok(rubric()),
            site: "Practice LMS",
            saves_on_write: false,
            manual_save: true,
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        })))
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

/// What the worker reports the agent knows: a built-in site guide and one
/// skill file of the teacher's that its own text leaves switched off.
fn skills() -> Event {
    Event::Skills {
        folder: "/home/teacher/.local/share/ogre/skills".into(),
        skills: vec![
            SkillSummary {
                id: "bundled-myopenmath".into(),
                name: "MyOpenMath".into(),
                description: "How to find your way around MyOpenMath as an instructor.".into(),
                sites: vec!["myopenmath.com".into()],
                built_in: true,
                on_in_file: false,
                draft: None,
            },
            SkillSummary {
                id: "late-work".into(),
                name: "Late work".into(),
                description: "How this class treats work handed in late.".into(),
                sites: Vec::new(),
                built_in: false,
                on_in_file: false,
                draft: Some(SkillDraft {
                    name: "Late work".into(),
                    description: "How this class treats work handed in late.".into(),
                    sites: Vec::new(),
                    body: "Take a point off for each day late.".into(),
                }),
            },
        ],
    }
}

#[test]
fn the_agent_screen_lists_what_the_agent_knows_and_skills_can_be_switched_on() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    harness.get_by_label("Agent").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListSkills));
    stand_in.events.send(skills()).unwrap();
    frames(&mut harness);

    harness.get_by_label("MyOpenMath");
    harness.get_by_label("Guide to myopenmath.com");
    harness.get_by_label("Built in");
    harness.get_by_label("/home/teacher/.local/share/ogre/skills");
    shot(&mut harness, "23-agent-skills");

    // A task started now goes out with the teacher's choice, not the file's.
    harness.get_by_label("Late work").click();
    frames(&mut harness);
    harness.get_by_label("Task").click();
    frames(&mut harness);
    harness
        .get_by_label("Task")
        .type_text("List the late work.");
    frames(&mut harness);
    harness.get_by_label("Start").click();
    frames(&mut harness);
    let Command::RunAgent(request) = sent(&mut stand_in) else {
        panic!("expected the agent to start");
    };
    assert_eq!(request.skill_choices.get("late-work"), Some(&true));
    assert_eq!(request.skill_choices.get("bundled-myopenmath"), None);
    stand_in
        .events
        .send(Event::AgentDone(AgentSummary {
            finished: true,
            message: "Two students handed work in late.".into(),
        }))
        .unwrap();
    frames(&mut harness);

    harness.get_by_label("Open the skills folder").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::OpenSkillsFolder));
}

#[test]
fn the_agent_asks_and_the_teacher_answers() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    harness.get_by_label("Agent").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListSkills));
    stand_in.events.send(skills()).unwrap();
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
            examples: Some("Excellent: The margin of error shrinks as n grows.".into()),
            skills: vec!["Late work".into()],
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
            examples: None,
            skills: Vec::new(),
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
    harness.get_by_label("The grader was also given your skill: Late work.");
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

#[test]
fn scores_come_from_the_ai_unless_the_teacher_chooses_the_feedback() {
    const SWITCH: &str = "Work out each score from the feedback";
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert!(
        !request.score_from_verdicts,
        "the AI's score is the default"
    );
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Settings").click();
    frames(&mut harness);
    harness.get_by_label_contains("Each score is the AI\u{2019}s own judgment");
    harness.get_by_label(SWITCH).click();
    frames(&mut harness);
    harness.get_by_label_contains("The same feedback always gives the same score.");
    shot(&mut harness, "15-settings-scores");

    harness.get_by_label("Grade").click();
    frames(&mut harness);
    choose(&mut harness, "Who to grade", "Everyone with an answer");
    harness.get_by_label("Grade 3 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert!(request.score_from_verdicts);
}

#[test]
fn a_suggestion_the_teacher_takes_is_what_gets_written() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Diaz, Remy").click();
    frames(&mut harness);
    // What it would put in the feedback box is there to read first.
    harness.get_by_label("Suggested feedback");
    harness.get_by_label("Remy, correct, but say why.");
    harness.get_by_label("Use the suggestion").click();
    frames(&mut harness);
    assert!(harness.query_by_label("Has a suggestion").is_none());
    assert!(harness.query_by_label("Suggested feedback").is_none());

    // Taking it can be gone back on, and then taken again.
    harness
        .get_by_label("Go back to the first proposal")
        .click();
    frames(&mut harness);
    harness.get_by_label("Suggested feedback");
    assert!(
        harness
            .query_by_label("Go back to the first proposal")
            .is_none()
    );
    harness.get_by_label("Use the suggestion").click();
    frames(&mut harness);
    assert!(harness.query_by_label("Has a suggestion").is_none());
    assert!(
        harness
            .query_by_label_contains("suggests a different grade")
            .is_none()
    );

    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    let Command::Write(writes) = sent(&mut stand_in) else {
        panic!("expected a write");
    };
    assert_eq!(
        (writes[1].name.as_str(), writes[1].score.value),
        ("Diaz, Remy", 8.0)
    );
    assert_eq!(
        writes[1].feedback.as_ref().unwrap().html,
        "<p>Remy, correct, but say why.</p>"
    );
    // Kai had no suggestion and is written as proposed.
    assert_eq!(writes[0].score.value, 6.0);
}

#[test]
fn a_suggestion_left_undecided_does_not_change_what_is_written() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    let Command::Write(writes) = sent(&mut stand_in) else {
        panic!("expected a write");
    };
    assert_eq!(writes[1].score.value, 8.5);
    assert_eq!(
        writes[1].feedback.as_ref().unwrap().html,
        "<p>Remy, clear and correct.</p>"
    );
}

fn question(number: usize, title: &str, current: bool) -> QuestionLink {
    QuestionLink {
        number: number.to_string(),
        title: title.into(),
        url: format!("https://www.myopenmath.com/course/gradeallq2.php?cid=1&aid=2&qid={number}"),
        current,
    }
}

/// The page as read, as question `current` of three.
fn read_question(current: usize) -> Event {
    let Event::Read(mut report) = read() else {
        unreachable!()
    };
    report.questions = (1..=3)
        .map(|n| question(n, &format!("Part {n}"), n == current))
        .collect();
    Event::Read(report)
}

#[test]
fn moves_between_the_questions_of_an_assignment() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    // A site that lists no questions gets no question bar.
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("Next question").is_none());

    stand_in.events.send(read_question(2)).unwrap();
    frames(&mut harness);
    harness.get_by_label("Question 2 of 3");
    harness.get_by_label("Part 2");

    // Nothing is at stake, so the next question opens at once.
    harness.get_by_label("Next question").click();
    frames(&mut harness);
    let Command::GoTo(address) = sent(&mut stand_in) else {
        panic!("expected to go to the next question");
    };
    assert!(address.ends_with("qid=3"), "{address}");
    harness.get_by_label("Opening the question…");

    // The last question has nowhere further to go.
    stand_in.events.send(read_question(3)).unwrap();
    frames(&mut harness);
    harness.get_by_label("Question 3 of 3");
    harness.get_by_label("Next question").click();
    frames(&mut harness);
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label("Previous question").click();
    frames(&mut harness);
    let Command::GoTo(address) = sent(&mut stand_in) else {
        panic!("expected to go to the previous question");
    };
    assert!(address.ends_with("qid=2"), "{address}");
}

#[test]
fn leaving_a_question_with_unwritten_grades_is_asked_about_first() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read_question(1)).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    harness.get_by_label("Next question").click();
    frames(&mut harness);
    assert!(stand_in.commands.try_recv().is_err(), "nothing moves yet");
    harness.get_by_label("2 proposed grades have not been written. Leaving drops them.");
    shot(&mut harness, "16-leaving-a-question");

    harness.get_by_label("Stay here").click();
    frames(&mut harness);
    assert!(harness.query_by_label("Leave this question").is_none());
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label("Fill in 2 grades");

    harness.get_by_label("Next question").click();
    frames(&mut harness);
    harness.get_by_label("Leave this question").click();
    frames(&mut harness);
    let Command::GoTo(address) = sent(&mut stand_in) else {
        panic!("expected to go to the next question");
    };
    assert!(address.ends_with("qid=2"), "{address}");
}

#[test]
fn leaving_with_grades_filled_in_but_not_saved_is_asked_about_first() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read_question(1)).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Fill in 2 grades").click();
    frames(&mut harness);
    sent(&mut stand_in);
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

    harness.get_by_label("Next question").click();
    frames(&mut harness);
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label("Grades are filled in on the page but not saved. Leaving loses them.");

    // Once saved there is nothing to lose, and the way is clear.
    harness.get_by_label("Save on MyOpenMath").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::Save));
    stand_in.events.send(Event::Saved(Some(filled))).unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("Leave this question").is_none());
    harness.get_by_label("Next question").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::GoTo(_)));
}

#[test]
fn the_old_apps_service_and_key_can_be_copied_in_settings() {
    let dir = std::env::temp_dir().join(format!("ogre-test-old-app-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("ogre-server.json");
    std::fs::write(
        &file,
        r#"{"providers":[{"id":"ollama","api_url":"https://ollama.com","model":"gemma4:31b",
            "is_active":true,"credentials":{"api_key":"made-up-key"}}]}"#,
    )
    .unwrap();

    let (worker, mut stand_in) = Worker::detached();
    let old_app = Some(file.clone());
    let mut harness = Harness::builder()
        .with_size([1200.0, 760.0])
        .build_eframe(move |cc| {
            OgreApp::new(
                &cc.egui_ctx,
                worker,
                Settings::default(),
                Box::new(MemoryKeys::default()),
            )
            .with_old_app_settings(old_app)
        });
    frames(&mut harness);
    harness.get_by_label("Settings").click();
    frames(&mut harness);
    harness.get_by_label("Copy from the old OGRE app").click();
    frames(&mut harness);
    harness.get_by_label("Copied from the old OGRE app: Ollama Cloud, model gemma4:31b.");
    // The key is used but never shown.
    assert!(harness.query_by_label_contains("made-up-key").is_none());

    harness.get_by_label("List models").click();
    frames(&mut harness);
    let Command::ListModels { provider, api_key } = sent(&mut stand_in) else {
        panic!("expected a model list request");
    };
    assert_eq!(provider.service, Service::OllamaCloud);
    assert_eq!(provider.model, "gemma4:31b");
    assert_eq!(api_key.as_deref(), Some("made-up-key"));

    // A file that cannot be used says so and changes nothing.
    std::fs::write(&file, "{}").unwrap();
    stand_in.events.send(Event::Models(Ok(vec![]))).unwrap();
    frames(&mut harness);
    harness.get_by_label("Copy from the old OGRE app").click();
    frames(&mut harness);
    harness.get_by_label_contains("settings could not be read");
    let _ = std::fs::remove_dir_all(&dir);
}

/// A window with the students of `read` on the Grade screen and the rubric
/// card open.
fn rubric_open(read: Event) -> (Harness<'static, OgreApp>, StandIn) {
    let (mut harness, stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read).unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    (harness, stand_in)
}

/// Picks `option` in the dropdown named `dropdown`.
fn choose(harness: &mut Harness<'_, OgreApp>, dropdown: &str, option: &str) {
    harness.get_by_label(dropdown).click();
    frames(harness);
    // The option may also be named elsewhere in the window, as a student
    // is in the table, but only as plain text there.
    harness
        .query_all_by(|node| {
            node.role() != egui::accesskit::Role::Label
                && node.label().is_some_and(|label| label == option)
        })
        .last()
        .unwrap_or_else(|| panic!("no {option:?} in {dropdown:?}"))
        .click();
    frames(harness);
}

/// Clicks something that may be out of sight in a part that scrolls: it is
/// brought into view first, as the teacher would.
fn scroll_to_and_press(harness: &mut Harness<'_, OgreApp>, label: &str) {
    harness.get_by_label(label).scroll_to_me();
    frames(harness);
    harness.get_by_label(label).click();
    frames(harness);
}

/// A page whose first requirement stands outside every category.
fn read_with_a_loose_requirement() -> Event {
    let rubric: Rubric = serde_json::from_value(serde_json::json!({
        "maxScore": 10,
        "checklistItems": [
            { "items": ["Names the units"] },
            { "category": "Concept", "items": ["Mentions standard error"] },
            { "category": "Communication", "items": ["Uses course vocabulary"] }
        ],
        "rubricItems": [],
    }))
    .unwrap();
    Event::Read(Box::new(ReadReport {
        page: page(),
        rubric: Ok(rubric),
        site: "MyOpenMath",
        saves_on_write: false,
        manual_save: false,
        questions: Vec::new(),
        saved_rubrics: Vec::new(),
        skills: Vec::new(),
    }))
}

#[test]
fn category_weights_are_set_in_the_rubric_and_sent_with_it() {
    let (mut harness, mut stand_in) = rubric_open(read());
    harness.get_by_label("None are set, so the categories count alike.");
    assert!(harness.query_by_label_contains("They add up to").is_none());

    scroll_to_and_press(&mut harness, "Set category weights");
    harness.get_by_label("Edited");
    harness.get_by_label_contains("They add up to 100%.");
    shot(&mut harness, "17-category-weights");

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    let text = request
        .rubric_text
        .expect("the weights are in the rubric that is sent");
    assert!(text.starts_with("## Concept [50%]\n"), "{text}");
    assert!(text.contains("\n## Communication [50%]\n"), "{text}");
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    // Without the weights the rubric is the page's own again.
    scroll_to_and_press(&mut harness, "Remove the weights");
    assert!(harness.query_by_label("Edited").is_none());
    harness.get_by_label("None are set, so the categories count alike.");
}

#[test]
fn grading_waits_while_the_weights_would_give_wrong_scores() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in
        .events
        .send(read_with_a_loose_requirement())
        .unwrap();
    frames(&mut harness);

    // Said where the teacher is looking, without opening the rubric.
    harness.get_by_label_contains("are in no category");
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    assert!(
        stand_in.commands.try_recv().is_err(),
        "nothing is graded against weights that do not add up"
    );
    shot(&mut harness, "18-weights-do-not-add-up");
}

#[test]
fn scoring_examples_are_written_when_asked_and_shown_to_the_grader() {
    const EXAMPLES: &str = "Excellent: The margin of error shrinks as n grows, because the standard error is s over root n.\n\nMinimal: It gets smaller.";
    let (mut harness, mut stand_in) = rubric_open(read());

    scroll_to_and_press(&mut harness, "Write scoring examples");
    let Command::WriteExamples(request) = sent(&mut stand_in) else {
        panic!("expected a request for scoring examples");
    };
    assert_eq!(request.rubric_text, None, "the page's rubric, unedited");
    assert_eq!(request.rubric.checklist_items.len(), 2);
    // The setting's default, on the grading engine's scale.
    assert_eq!(request.leniency, 0);
    harness.get_by_label_contains("Writing scoring examples");

    stand_in
        .events
        .send(Event::Examples(Ok(EXAMPLES.into())))
        .unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("Write scoring examples").is_none());
    harness.get_by_label("Write them again");
    assert!(
        harness
            .query_by_label_contains("has changed since these were written")
            .is_none()
    );
    shot(&mut harness, "19-scoring-examples");

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert_eq!(request.examples.as_deref(), Some(EXAMPLES));
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    // A second try that fails says so and leaves the examples in hand alone.
    scroll_to_and_press(&mut harness, "Write them again");
    assert!(matches!(sent(&mut stand_in), Command::WriteExamples(_)));
    stand_in
        .events
        .send(Event::Examples(Err(
            "The scoring examples could not be written: the service timed out".into(),
        )))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("the service timed out");
    harness.get_by_label("Write them again");

    // Removed, they are not sent.
    scroll_to_and_press(&mut harness, "Remove the examples");
    harness.get_by_label("Write scoring examples");
    choose(&mut harness, "Who to grade", "Everyone with an answer");
    harness.get_by_label("Grade 3 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert_eq!(request.examples, None);
}

#[test]
fn reading_the_page_again_keeps_the_rubric_the_teacher_set_up() {
    let (mut harness, stand_in) = rubric_open(read());
    scroll_to_and_press(&mut harness, "Set category weights");
    stand_in
        .events
        .send(Event::Examples(Ok("Excellent: all of it.".into())))
        .unwrap();
    frames(&mut harness);

    // The same page, read again for the students' new state.
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Edited");
    harness.get_by_label_contains("They add up to 100%.");
    harness.get_by_label("Write them again");

    // Another question's page starts from what that page says.
    let Event::Read(mut other) = read() else {
        unreachable!()
    };
    other.page.url.push_str("&qid=2");
    stand_in.events.send(Event::Read(other)).unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("Edited").is_none());
    assert!(harness.query_by_label("Write them again").is_none());
}

fn saved(name: &str, text: &str) -> SavedRubric {
    SavedRubric {
        name: name.into(),
        text: text.into(),
        ..SavedRubric::default()
    }
}

/// A page of a site that shows no rubric OGRE can read, with the teacher's
/// saved rubrics at hand.
fn read_without_a_rubric(saved_rubrics: Vec<SavedRubric>) -> Event {
    let mut page = page();
    page.url = "https://grades.example.edu/course/7/grade".into();
    page.title = "Grading an essay on sampling".into();
    Event::Read(Box::new(ReadReport {
        page,
        rubric: Err("this site shows no rubric OGRE can read".into()),
        site: "Example LMS",
        saves_on_write: false,
        manual_save: true,
        questions: Vec::new(),
        saved_rubrics,
        skills: Vec::new(),
    }))
}

#[test]
fn a_rubric_is_saved_under_a_name_and_used_on_another_page() {
    const NAME_BOX: &str = "Save this rubric as";
    let (mut harness, mut stand_in) = rubric_open(read());
    harness.get_by_label_contains("None yet.");

    harness.get_by_label(NAME_BOX).scroll_to_me();
    frames(&mut harness);
    harness.get_by_label(NAME_BOX).click();
    frames(&mut harness);
    harness.get_by_label(NAME_BOX).type_text("Margin of error");
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Save the rubric");
    let Command::SaveRubric(rubric) = sent(&mut stand_in) else {
        panic!("expected a rubric to save");
    };
    assert_eq!(rubric.name, "Margin of error");
    assert!(
        rubric
            .text
            .starts_with("## Concept\nMentions standard error\n")
    );
    let library = vec![
        saved(
            "Essay 2",
            "## Thesis [40%]\nStates a position\n## Evidence [60%]\nCites two sources",
        ),
        *rubric,
    ];
    stand_in
        .events
        .send(Event::Rubrics(library.clone()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("Saved the rubric as \u{201c}Margin of error\u{201d}.");
    // The name is taken now, and saying so is the button's job.
    harness.get_by_label("Replace the saved rubric");
    shot(&mut harness, "20-saved-rubrics");

    // Another site's page, which has no rubric of its own.
    stand_in
        .events
        .send(read_without_a_rubric(library))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("The rubric could not be read from the page");
    scroll_to_and_press(&mut harness, "Saved rubrics");
    harness.get_by_label("Essay 2").click();
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Use it");
    harness.get_by_label("2 requirements in 2 categories, no model response.");
    harness.get_by_label_contains("They add up to 100%.");
    shot(&mut harness, "21-saved-rubric-in-use");

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert_eq!(
        request.rubric_text.as_deref(),
        Some("## Thesis [40%]\nStates a position\n## Evidence [60%]\nCites two sources")
    );
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    // Deleting asks first, and only then goes.
    scroll_to_and_press(&mut harness, "Delete it");
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label_contains("Delete the saved rubric \u{201c}Essay 2\u{201d}?");
    scroll_to_and_press(&mut harness, "Keep it");
    assert!(
        harness
            .query_by_label_contains("cannot be brought back")
            .is_none()
    );
    scroll_to_and_press(&mut harness, "Delete it");
    scroll_to_and_press(&mut harness, "Delete the saved rubric");
    let Command::DeleteRubric(name) = sent(&mut stand_in) else {
        panic!("expected a rubric to delete");
    };
    assert_eq!(name, "Essay 2");
    stand_in.events.send(Event::Rubrics(Vec::new())).unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("None yet.");
    // The rubric in the editor is the teacher's to keep using.
    harness.get_by_label("2 requirements in 2 categories, no model response.");
}

#[test]
fn a_rubric_is_read_from_a_picture_of_the_page_when_asked() {
    const BUTTON: &str = "Read the rubric from a picture of the page";
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in
        .events
        .send(read_without_a_rubric(Vec::new()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);

    scroll_to_and_press(&mut harness, BUTTON);
    assert!(matches!(
        sent(&mut stand_in),
        Command::RubricFromPicture { .. }
    ));
    stand_in
        .events
        .send(Event::RubricRead(Err(
            "The AI found no rubric in the picture of the page. Scroll the rubric into view in Chrome and try again.".into(),
        )))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("found no rubric in the picture");
    assert!(harness.query_by_label("Edited").is_none());

    scroll_to_and_press(&mut harness, BUTTON);
    assert!(matches!(
        sent(&mut stand_in),
        Command::RubricFromPicture { .. }
    ));
    stand_in
        .events
        .send(Event::RubricRead(Ok(OutsideRubric {
            requirements:
                "## Thesis [40%]\nStates a position\n## Evidence [60%]\nCites two sources".into(),
            parts: 2,
            name: "Essay 2 rubric".into(),
        })))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("Read a rubric of 2 parts from the picture of the page.");
    harness.get_by_label("Edited");
    harness.get_by_label("2 requirements in 2 categories, no model response.");
    shot(&mut harness, "22-rubric-from-a-picture");

    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected a grading request");
    };
    assert!(
        request
            .rubric_text
            .unwrap()
            .starts_with("## Thesis [40%]\n")
    );
}

#[test]
fn a_rubric_is_drafted_from_the_question_when_asked() {
    const BUTTON: &str = "Draft a rubric from the question";
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    // The page gives a question and how much it is worth, and no rubric.
    let Event::Read(mut report) = read() else {
        unreachable!()
    };
    report.rubric = Ok(serde_json::from_value(serde_json::json!({
        "essayPrompt": "Explain how sample size affects the margin of error.",
        "maxScore": 14,
    }))
    .unwrap());
    stand_in.events.send(Event::Read(report)).unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);

    scroll_to_and_press(&mut harness, BUTTON);
    let Command::DraftRubric {
        question,
        max_score,
        ..
    } = sent(&mut stand_in)
    else {
        panic!("expected a rubric to be drafted");
    };
    assert_eq!(
        question,
        "Explain how sample size affects the margin of error."
    );
    assert_eq!(max_score, 14.0);
    stand_in
        .events
        .send(Event::RubricDrafted(Ok(OutsideRubric {
            requirements: "## Direction [40%]\nFull: says it shrinks | Partial: vague | None: wrong\n## Reason [60%]\nFull: names the standard error | Partial: hints | None: none".into(),
            parts: 2,
            name: "Margin of error".into(),
        })))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("The AI drafted a rubric of 2 parts from the question.");
    harness.get_by_label("Edited");
    harness.get_by_label("2 requirements in 2 categories, no model response.");
    shot(&mut harness, "24-rubric-drafted");
}

#[test]
fn the_question_a_student_was_asked_will_do_where_the_rubric_names_none() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in
        .events
        .send(read_without_a_rubric(Vec::new()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Draft a rubric from the question");
    let Command::DraftRubric {
        question,
        max_score,
        ..
    } = sent(&mut stand_in)
    else {
        panic!("expected a rubric to be drafted");
    };
    assert_eq!(
        question,
        "Explain how sample size affects the margin of error."
    );
    // No rubric to say what the question is worth: the usual 10.
    assert_eq!(max_score, 10.0);
}

#[test]
fn a_page_without_a_question_has_nothing_to_draft_a_rubric_from() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    let Event::Read(mut report) = read_without_a_rubric(Vec::new()) else {
        unreachable!()
    };
    for submission in &mut report.page.submissions {
        submission.prompt = None;
    }
    stand_in.events.send(Event::Read(report)).unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Draft a rubric from the question");
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label("OGRE read no question on this page to draft a rubric from.");
}

/// Settings that show the page inside OGRE's window.
fn page_inside() -> Settings {
    Settings {
        page_inside: true,
        ..local_model()
    }
}

/// Everything the teacher has done on the page shown inside the window.
fn page_inputs(stand_in: &mut StandIn) -> Vec<ViewInput> {
    std::iter::from_fn(|| stand_in.view_input.try_recv().ok()).collect()
}

#[test]
fn the_browser_screen_is_offered_only_once_the_teacher_asks_for_it() {
    let (mut harness, mut stand_in) = window(local_model());
    frames(&mut harness);
    assert!(harness.query_by_label("Browser").is_none());

    harness.get_by_label("Settings").click();
    frames(&mut harness);
    let switch = "Show the page inside OGRE (an experiment)";
    harness.get_by_label(switch).scroll_to_me();
    frames(&mut harness);
    harness.get_by_label(switch).click();
    frames(&mut harness);
    shot(&mut harness, "25-settings-page-inside");
    harness.get_by_label("Browser").click();
    frames(&mut harness);

    // Chrome is then started without a window of its own.
    harness.get_by_label("Start Chrome").click();
    frames(&mut harness);
    assert!(matches!(
        sent(&mut stand_in),
        Command::StartChrome { inside: true }
    ));
}

#[test]
fn the_page_is_drawn_in_the_window_and_takes_the_mouse_and_keyboard() {
    const PAGE: &str = "The page in Chrome";
    let (mut harness, mut stand_in) = window(page_inside());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    // Chrome starting brings the page up, since that is where to sign in.
    harness.get_by_label("Back");
    let inputs = page_inputs(&mut stand_in);
    let [ViewInput::Size(size)] = inputs.as_slice() else {
        panic!("expected the page's size to be sent once, got {inputs:?}");
    };
    assert!(size.width > 800 && size.height > 400, "{size:?}");

    {
        let mut state = stand_in.view.state();
        state.showing = true;
        state.address = "https://www.myopenmath.com/".into();
        // A small picture of plain green stands for the page.
        let green = egui::Color32::from_rgb(45, 106, 79);
        state.picture = Some(egui::ColorImage::filled([8, 6], green));
    }
    frames(&mut harness);
    assert!(
        harness
            .query_all_by_value("https://www.myopenmath.com/")
            .next()
            .is_some(),
        "the address box follows the page"
    );
    assert!(stand_in.view.state().picture.is_none(), "it was drawn");
    shot(&mut harness, "26-page-inside");

    harness.get_by_label(PAGE).click();
    frames(&mut harness);
    let clicks: Vec<MouseAction> = page_inputs(&mut stand_in)
        .into_iter()
        .filter_map(|input| match input {
            ViewInput::Mouse { action, x, y, .. } => {
                assert!(
                    x > 0.0 && y > 0.0,
                    "inside the page, measured from its corner"
                );
                Some(action)
            }
            _ => None,
        })
        .filter(|action| !matches!(action, MouseAction::Move { .. }))
        .collect();
    let button = MouseButton::Left;
    assert_eq!(
        clicks,
        [
            MouseAction::Press { button, clicks: 1 },
            MouseAction::Release { button, clicks: 1 }
        ]
    );

    // The click gave the page the keyboard.
    harness.get_by_label(PAGE).type_text("h");
    harness.key_press(egui::Key::Tab);
    frames(&mut harness);
    let key = |name: &str, pressed| ViewInput::Key {
        name: name.into(),
        pressed,
        held: Held::default(),
    };
    assert_eq!(
        page_inputs(&mut stand_in),
        [
            key("h", true),
            key("h", false),
            key("Tab", true),
            key("Tab", false)
        ]
    );

    harness.get_by_label("Reload the page").click();
    frames(&mut harness);
    assert_eq!(page_inputs(&mut stand_in), [ViewInput::Reload]);

    // Text the teacher copied on the page reaches the window's clipboard,
    // and is handed over once.
    stand_in.view.state().copied = Some("standard error".into());
    frames(&mut harness);
    assert!(stand_in.view.state().copied.is_none());

    harness.get_by_label("Stop Chrome").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::StopChrome));
    stand_in.events.send(Event::ChromeClosed).unwrap();
    frames(&mut harness);
    harness.get_by_label("Start Chrome");
}

#[test]
fn what_the_page_asks_can_be_answered_from_any_screen() {
    let (mut harness, mut stand_in) = window(page_inside());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Grade").click();
    frames(&mut harness);
    page_inputs(&mut stand_in);

    stand_in.view.state().dialog = Some(PageDialog {
        kind: DialogKind::Confirm,
        message: "Really submit these grades?".into(),
    });
    frames(&mut harness);
    harness.get_by_label("The page asks: Really submit these grades?");
    shot(&mut harness, "27-page-asks");
    harness.get_by_label("Cancel").click();
    frames(&mut harness);
    assert_eq!(page_inputs(&mut stand_in), [ViewInput::Answer(false)]);

    // Leaving a page with unsaved changes is put in OGRE's own words.
    stand_in.view.state().dialog = Some(PageDialog {
        kind: DialogKind::Leave,
        message: String::new(),
    });
    frames(&mut harness);
    harness.get_by_label_contains("you may have changes that are not saved");
    harness.get_by_label("Leave the page").click();
    frames(&mut harness);
    assert_eq!(page_inputs(&mut stand_in), [ViewInput::Answer(true)]);

    stand_in.view.state().dialog = None;
    frames(&mut harness);
    assert!(harness.query_by_label_contains("The page asks").is_none());
}

#[test]
fn a_skill_is_written_changed_and_deleted_on_the_agent_screen() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    harness.get_by_label("Agent").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListSkills));
    stand_in.events.send(skills()).unwrap();
    frames(&mut harness);

    // A skill of the teacher's opens in the form with what its file holds.
    scroll_to_and_press(&mut harness, "Change");
    harness.get_by_label("Change the skill");
    assert!(harness.query_all_by_value("Late work").next().is_some());
    harness.get_by_label("What it is for").scroll_to_me();
    frames(&mut harness);
    harness.get_by_label("Sites it is a guide to").click();
    frames(&mut harness);
    harness
        .get_by_label("Sites it is a guide to")
        .type_text("schoology.com, ,canvas.example.edu ");
    frames(&mut harness);
    shot(&mut harness, "28-skill-editor");
    scroll_to_and_press(&mut harness, "Save the skill");
    let Command::SaveSkill { id, draft } = sent(&mut stand_in) else {
        panic!("expected a skill to save");
    };
    assert_eq!(id.as_deref(), Some("late-work"));
    assert_eq!(draft.name, "Late work");
    assert_eq!(draft.body, "Take a point off for each day late.");
    assert_eq!(draft.sites, ["schoology.com", "canvas.example.edu"]);
    stand_in.events.send(skills()).unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("Saved the skill \u{201c}Late work\u{201d}.");
    assert!(harness.query_by_label("Change the skill").is_none());

    // A new one needs a name and something for the agent to know.
    scroll_to_and_press(&mut harness, "Write a skill");
    harness.get_by_label("A new skill");
    scroll_to_and_press(&mut harness, "Save the skill");
    assert!(stand_in.commands.try_recv().is_err());
    for (field, text) in [
        ("Name", "Rounding"),
        ("What the agent should know", "Round to two places."),
    ] {
        harness.get_by_label(field).scroll_to_me();
        frames(&mut harness);
        harness.get_by_label(field).click();
        frames(&mut harness);
        harness.get_by_label(field).type_text(text);
        frames(&mut harness);
    }
    scroll_to_and_press(&mut harness, "Save the skill");
    let Command::SaveSkill { id, draft } = sent(&mut stand_in) else {
        panic!("expected a skill to save");
    };
    assert_eq!(id, None);
    assert_eq!(
        (draft.name.as_str(), draft.body.as_str()),
        ("Rounding", "Round to two places.")
    );
    assert!(draft.sites.is_empty());

    // The worker lists it under the id it gave the file; it starts ticked.
    let Event::Skills { folder, mut skills } = skills() else {
        unreachable!()
    };
    skills.push(SkillSummary {
        id: "rounding".into(),
        name: "Rounding".into(),
        description: String::new(),
        sites: Vec::new(),
        built_in: false,
        on_in_file: false,
        draft: Some(*draft),
    });
    stand_in
        .events
        .send(Event::Skills { folder, skills })
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Task").click();
    frames(&mut harness);
    harness.get_by_label("Task").type_text("Round the scores.");
    frames(&mut harness);
    harness.get_by_label("Start").click();
    frames(&mut harness);
    let Command::RunAgent(request) = sent(&mut stand_in) else {
        panic!("expected the agent to start");
    };
    assert_eq!(request.skill_choices.get("rounding"), Some(&true));
    assert_eq!(request.skill_choices.get("late-work"), None);
    stand_in
        .events
        .send(Event::AgentDone(AgentSummary {
            finished: true,
            message: "Done.".into(),
        }))
        .unwrap();
    // Back to one skill of the teacher's, so that "Delete" names one thing.
    stand_in.events.send(self::skills()).unwrap();
    frames(&mut harness);

    // Deleting asks first.
    scroll_to_and_press(&mut harness, "Delete");
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label_contains("Delete the skill \u{201c}Late work\u{201d}?");
    scroll_to_and_press(&mut harness, "Keep it");
    assert!(
        harness
            .query_by_label_contains("cannot be brought back")
            .is_none()
    );
    scroll_to_and_press(&mut harness, "Delete");
    scroll_to_and_press(&mut harness, "Delete the skill");
    let Command::DeleteSkill(id) = sent(&mut stand_in) else {
        panic!("expected a skill to delete");
    };
    assert_eq!(id, "late-work");
}

/// The Agent screen with the skill interview open.
fn interview_open() -> (Harness<'static, OgreApp>, StandIn) {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    frames(&mut harness);
    harness.get_by_label("Agent").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListSkills));
    stand_in.events.send(skills()).unwrap();
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Write one with the AI");
    harness.get_by_label("Write a skill with the AI");
    (harness, stand_in)
}

/// Writes `message` to the AI in the skill interview and sends it. Gives
/// the conversation the window sent.
fn tell_the_ai(
    harness: &mut Harness<'_, OgreApp>,
    stand_in: &mut StandIn,
    message: &str,
) -> Vec<InterviewTurn> {
    const BOX: &str = "Your message to the AI";
    harness.get_by_label(BOX).scroll_to_me();
    frames(harness);
    harness.get_by_label(BOX).click();
    frames(harness);
    harness.get_by_label(BOX).type_text(message);
    frames(harness);
    scroll_to_and_press(harness, "Send");
    let Command::SkillInterview { turns, .. } = sent(stand_in) else {
        panic!("expected the interview to be sent");
    };
    turns
}

#[test]
fn a_skill_is_written_by_talking_it_over_with_the_ai() {
    // The AI answers in Markdown, which is shown as what it means.
    const ASKED: &str = "**1.** What subject or course is this skill for?";
    const QUESTION: &str = "What subject or course is this skill for?";
    const WRITTEN: &str = "Here is your skill:\n\n```markdown\n---\nname: Late work in statistics\ndescription: How late work is marked down\nauthor: Created with O.G.R.E\n---\n\n# Late work in statistics\n\nOne point off for each day late, down to half credit.\n```\n\nDoes this look right?";
    let (mut harness, mut stand_in) = interview_open();

    // There is nothing to send until something is written.
    scroll_to_and_press(&mut harness, "Send");
    assert!(stand_in.commands.try_recv().is_err());

    let turns = tell_the_ai(&mut harness, &mut stand_in, "A skill for late work");
    assert_eq!(turns, [InterviewTurn::teacher("A skill for late work")]);
    stand_in
        .events
        .send(Event::SkillInterview(Ok(ASKED.into())))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains(QUESTION);
    assert!(harness.query_by_label_contains("**").is_none());
    assert!(
        harness
            .query_by_label("Put the skill in the editor")
            .is_none(),
        "a question is not a skill"
    );

    // The whole conversation goes with each message.
    let turns = tell_the_ai(&mut harness, &mut stand_in, "AP Statistics");
    assert_eq!(
        turns,
        [
            InterviewTurn::teacher("A skill for late work"),
            InterviewTurn::ai(ASKED),
            InterviewTurn::teacher("AP Statistics"),
        ]
    );
    stand_in
        .events
        .send(Event::SkillInterview(Ok(WRITTEN.into())))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("The AI wrote \u{201c}Late work in statistics\u{201d}.");
    shot(&mut harness, "29-skill-interview");

    // What the AI wrote goes to the editor. Nothing is saved until the
    // teacher saves it there.
    assert!(harness.query_by_label("A new skill").is_none());
    scroll_to_and_press(&mut harness, "Put the skill in the editor");
    assert!(stand_in.commands.try_recv().is_err());
    harness.get_by_label("A new skill");
    assert!(
        harness
            .query_all_by_value("Late work in statistics")
            .next()
            .is_some()
    );
    scroll_to_and_press(&mut harness, "Save the skill");
    let Command::SaveSkill { id, draft } = sent(&mut stand_in) else {
        panic!("expected a skill to save");
    };
    assert_eq!(id, None);
    assert_eq!(draft.name, "Late work in statistics");
    assert_eq!(draft.description, "How late work is marked down");
    assert_eq!(
        draft.body,
        "# Late work in statistics\n\nOne point off for each day late, down to half credit."
    );
}

#[test]
fn a_message_the_ai_did_not_answer_can_be_sent_again() {
    let (mut harness, mut stand_in) = interview_open();
    tell_the_ai(&mut harness, &mut stand_in, "A skill for late work");
    stand_in
        .events
        .send(Event::SkillInterview(Err(
            "The AI could not be asked: the service did not answer in time.".into(),
        )))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("The AI could not be asked");
    // The message is back where it was written, and the conversation is as
    // it was before it.
    assert!(
        harness
            .query_all_by_value("A skill for late work")
            .next()
            .is_some()
    );
    scroll_to_and_press(&mut harness, "Send");
    let Command::SkillInterview { turns, .. } = sent(&mut stand_in) else {
        panic!("expected the interview to be sent");
    };
    assert_eq!(turns, [InterviewTurn::teacher("A skill for late work")]);

    // Closing ends it; opening it again starts afresh.
    stand_in
        .events
        .send(Event::SkillInterview(Ok("What grade level?".into())))
        .unwrap();
    frames(&mut harness);
    scroll_to_and_press(&mut harness, "Close");
    assert!(
        harness
            .query_by_label("Write a skill with the AI")
            .is_none()
    );
    scroll_to_and_press(&mut harness, "Write one with the AI");
    assert!(harness.query_by_label("What grade level?").is_none());
}

/// The page of [`read`], read while the teacher has the skills of
/// [`skills`] in their folder.
fn read_with_skills() -> Event {
    let (Event::Read(mut report), Event::Skills { skills, .. }) = (read(), skills()) else {
        unreachable!()
    };
    report.skills = skills;
    Event::Read(report)
}

#[test]
fn a_ticked_skill_is_given_to_the_grader_and_the_rubric_card_says_so() {
    const SAYS_SO: &str = "The grader is also given your skill: Late work.";

    // Nothing is ticked: the grader gets the rubric and nothing else.
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read_with_skills()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    assert!(
        harness
            .query_by_label_contains("The grader is also given")
            .is_none()
    );
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected grading to start");
    };
    assert!(request.skill_choices.is_empty());

    // The teacher ticked "Late work" on the Agent screen. The guide to
    // MyOpenMath is not a skill for grading, whatever its switch says.
    let mut settings = local_model();
    settings.skills.insert("late-work".into(), true);
    settings.skills.insert("bundled-myopenmath".into(), true);
    let (mut harness, mut stand_in) = window(settings);
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read_with_skills()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Rubric").click();
    frames(&mut harness);
    harness.get_by_label_contains(SAYS_SO).scroll_to_me();
    frames(&mut harness);
    shot(&mut harness, "30-skills-for-grading");
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected grading to start");
    };
    assert_eq!(request.skill_choices.get("late-work"), Some(&true));
}

#[test]
fn the_teacher_chooses_who_is_graded() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Grade 2 students");

    choose(&mut harness, "Who to grade", "Everyone with an answer");
    harness.get_by_label("Grade 3 students");
    // Late work is whoever is at zero or blank and has an answer now.
    choose(
        &mut harness,
        "Who to grade",
        "Late work: at 0 or blank, now answered",
    );
    harness.get_by_label("Grade 2 students");

    // One student, who may be one that already has a grade.
    choose(&mut harness, "Who to grade", "One student");
    harness.get_by_label("Grade 1 student");
    choose(&mut harness, "Which student", "Diaz, Remy");
    shot(&mut harness, "31-who-to-grade");
    harness.get_by_label("Grade 1 student").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected grading to start");
    };
    let names: Vec<&str> = request.students.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, ["Diaz, Remy"]);
}

#[test]
fn a_zero_for_no_response_is_proposed_only_when_asked_and_written_only_with_the_grades() {
    const SWITCH: &str = "Give 0 to students with no response";
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    // Off until the teacher asks: nothing is proposed for the blank answer.
    harness.get_by_label_contains("1 student on this page.");
    assert!(harness.query_by_label_contains("Fill in").is_none());

    harness.get_by_label(SWITCH).click();
    frames(&mut harness);
    assert!(
        stand_in.commands.try_recv().is_err(),
        "nothing is written yet"
    );
    harness.get_by_label("Fill in 1 grade");
    shot(&mut harness, "32-zero-for-no-response");

    // The choice is remembered for the next page read.
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Fill in 1 grade").click();
    frames(&mut harness);
    let Command::Write(writes) = sent(&mut stand_in) else {
        panic!("expected the zero to be written");
    };
    assert_eq!(writes.len(), 1);
    assert_eq!(writes[0].name, "Cruz, Jo");
    assert_eq!(writes[0].score.value, 0.0);
    assert_eq!(writes[0].feedback, None, "a zero comes with no feedback");
}

#[test]
fn the_rubric_can_be_reworded_before_grading_to_read_and_change() {
    const REWORDED: &str = "## Concept\nMentions standard error, in any words\nSays which way it goes\n## Communication\nUses a course word or two";
    let (mut harness, mut stand_in) = rubric_open(read());

    // At the usual leniency the AI rewords the rubric, and says so.
    scroll_to_and_press(&mut harness, "Reword the rubric now");
    let Command::RewordRubric(request) = sent(&mut stand_in) else {
        panic!("expected the rubric to be reworded");
    };
    assert_eq!(request.leniency, ogre_app::engine_leniency(50));
    assert_eq!(
        request.rubric_text, None,
        "the page's rubric, unchanged so far"
    );
    stand_in
        .events
        .send(Event::Reworded(Ok(REWORDED.into())))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("The rubric is reworded in the editor.");
    harness.get_by_label_contains("This is the AI\u{2019}s rewording at leniency 50");
    assert!(harness.query_by_label("Reword the rubric now").is_none());
    assert!(harness.query_all_by_value(REWORDED).next().is_some());
    shot(&mut harness, "33-rubric-reworded");

    // Grading sends that wording, to be used as written.
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected grading to start");
    };
    assert_eq!(request.rubric_text.as_deref(), Some(REWORDED));
    assert_eq!(
        request.leniency,
        ogre_app::engine_leniency(75),
        "the rubric as written"
    );
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);

    // The page's own rubric is one press away, and is reworded at grading
    // as before.
    scroll_to_and_press(&mut harness, "Use the page\u{2019}s rubric");
    harness.get_by_label("Reword the rubric now");

    // A failure leaves the editor alone.
    scroll_to_and_press(&mut harness, "Reword the rubric now");
    assert!(matches!(sent(&mut stand_in), Command::RewordRubric(_)));
    stand_in
        .events
        .send(Event::Reworded(Err(
            "The rubric could not be reworded: the AI dropped a requirement.".into(),
        )))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("could not be reworded");
    assert!(harness.query_by_label("Edited").is_none());
}

#[test]
fn the_consistency_check_can_be_run_again_on_the_grades_in_the_table() {
    const AGAIN: &str = "Run the consistency check again";
    // Two grades are too few to compare.
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("needs at least 5 grades");
    scroll_to_and_press(&mut harness, AGAIN);
    assert!(stand_in.commands.try_recv().is_err());

    // A class of six, all graded.
    let names = [
        "Avery, Sam",
        "Brook, Kai",
        "Cruz, Jo",
        "Diaz, Remy",
        "Ellis, Pat",
        "Evans, Lee",
    ];
    let mut class = page();
    class.submissions = names
        .iter()
        .enumerate()
        .map(|(index, name)| submission(index, name, "0", "", "An answer of some kind."))
        .collect();
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in
        .events
        .send(Event::Read(Box::new(ReadReport {
            page: class,
            rubric: Ok(rubric()),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        })))
        .unwrap();
    stand_in
        .events
        .send(Event::Graded(GradeReport {
            rubric_text: None,
            examples: None,
            skills: Vec::new(),
            rows: (0..6)
                .map(|index| GradedRow {
                    index,
                    outcome: Ok(Grade {
                        score: 6.0 + index as f64 * 0.5,
                        feedback_html: "<p>Mostly there.</p>".into(),
                        flag: None,
                        suggestion: None,
                    }),
                })
                .collect(),
            warnings: Vec::new(),
            cancelled: false,
        }))
        .unwrap();
    frames(&mut harness);

    scroll_to_and_press(&mut harness, AGAIN);
    let Command::Sweep(request, grades) = sent(&mut stand_in) else {
        panic!("expected the consistency check to run");
    };
    assert_eq!(request.students.len(), 6);
    assert_eq!(grades.len(), 6);
    assert_eq!((grades[2].student_index, grades[2].score), (2, 7.0));
    assert_eq!(grades[2].feedback, "<p>Mostly there.</p>");
    stand_in
        .events
        .send(Event::Swept(Ok(vec![(
            2,
            Suggestion {
                score: 5.0,
                feedback_html: None,
                reason: Some("Pat said the same and got less.".into()),
            },
        )])))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("The consistency check suggests a different grade for 1 student.");
    harness.get_by_label("Has a suggestion");

    // Run again, it finds nothing, and the old suggestion goes.
    scroll_to_and_press(&mut harness, AGAIN);
    assert!(matches!(sent(&mut stand_in), Command::Sweep(..)));
    stand_in.events.send(Event::Swept(Ok(Vec::new()))).unwrap();
    frames(&mut harness);
    harness.get_by_label("The consistency check found nothing to change.");
    assert!(harness.query_by_label("Has a suggestion").is_none());
}

#[test]
fn grades_show_in_the_table_as_they_arrive_and_can_be_looked_at_meanwhile() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::Grade(_)));

    // Kai's grade is there; Remy is still with the AI.
    stand_in
        .events
        .send(Event::StudentGraded(GradedRow {
            index: 1,
            outcome: Ok(Grade {
                score: 6.0,
                feedback_html:
                    "<p>Kai, you have the right idea. Name the <strong>standard error</strong>.</p>"
                        .into(),
                flag: None,
                suggestion: None,
            }),
        }))
        .unwrap();
    stand_in
        .events
        .send(Event::GradeProgress { done: 1, total: 2 })
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Stop");
    harness.get_by_label("Ready to write");
    assert!(
        harness.query_by_label_contains("Fill in").is_none()
            || harness.query_all_by_label("Ungraded").count() == 1,
        "Remy is not graded yet"
    );
    shot(&mut harness, "34-grades-arriving");

    // The teacher holds Kai back while waiting. The end of the run adds
    // Remy and leaves that as it is.
    harness.get_by_label("Brook, Kai").click();
    frames(&mut harness);
    harness.get_by_label("Write this one").click();
    frames(&mut harness);
    stand_in.events.send(graded()).unwrap();
    frames(&mut harness);
    assert!(harness.query_by_label("Stop").is_none());
    assert!(harness.query_all_by_label("Held back").next().is_some());
    harness.get_by_label("Has a suggestion");
    harness.get_by_label("Fill in 1 grade");
}

#[test]
fn several_ai_services_stay_set_up_and_the_grade_screen_switches_between_them() {
    let (mut harness, mut stand_in) = window(local_model());
    stand_in.events.send(Event::ChromeStarted).unwrap();
    stand_in.events.send(read()).unwrap();
    frames(&mut harness);
    // With one service there is nothing to switch to.
    assert!(harness.query_by_label("Graded by").is_none());

    // A second service is set up in Settings. The first is not lost.
    harness.get_by_label("Settings").click();
    frames(&mut harness);
    choose(&mut harness, "Service", "OpenAI or compatible");
    assert!(
        harness.query_all_by_value("gemma4:31b").next().is_none(),
        "a service that was never set up starts blank"
    );
    harness.get_by_label("Model").click();
    frames(&mut harness);
    harness.get_by_label("Model").type_text("gpt-test");
    frames(&mut harness);
    choose(&mut harness, "Service", "Ollama on this computer");
    assert!(harness.query_all_by_value("gemma4:31b").next().is_some());

    // Both are offered where grading starts.
    harness.get_by_label("Grade").click();
    frames(&mut harness);
    choose(
        &mut harness,
        "Graded by",
        "OpenAI or compatible \u{b7} gpt-test",
    );
    // OpenAI needs a key, which this teacher has not entered.
    harness.get_by_label("Enter an API key in Settings first.");
    choose(
        &mut harness,
        "Graded by",
        "Ollama on this computer \u{b7} gemma4:31b",
    );
    shot(&mut harness, "35-graded-by");
    harness.get_by_label("Grade 2 students").click();
    frames(&mut harness);
    let Command::Grade(request) = sent(&mut stand_in) else {
        panic!("expected grading to start");
    };
    assert_eq!(request.provider.service, Service::Ollama);
    assert_eq!(request.provider.model, "gemma4:31b");
}

#[test]
fn rubrics_are_written_changed_copied_and_deleted_with_no_page_open() {
    const ESSAY: &str = "## Thesis [60%]\nStates a position\n## Evidence [40%]\nQuotes the text";
    let (mut harness, mut stand_in) = window(local_model());
    frames(&mut harness);
    harness.get_by_label("Rubrics").click();
    frames(&mut harness);
    assert!(matches!(sent(&mut stand_in), Command::ListRubrics));
    stand_in
        .events
        .send(Event::Rubrics(vec![saved("Essay 2", ESSAY)]))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Essay 2");
    harness.get_by_label("2 requirements in 2 categories, no model response.");
    shot(&mut harness, "36-rubric-library");

    // Changed under its own name.
    scroll_to_and_press(&mut harness, "Change");
    harness.get_by_label("Change the rubric");
    assert!(harness.query_all_by_value(ESSAY).next().is_some());
    scroll_to_and_press(&mut harness, "Save the rubric");
    let Command::PutRubric { was, rubric } = sent(&mut stand_in) else {
        panic!("expected the rubric to be saved");
    };
    assert_eq!(was.as_deref(), Some("Essay 2"));
    assert_eq!(
        (rubric.name.as_str(), rubric.text.as_str()),
        ("Essay 2", ESSAY)
    );
    stand_in
        .events
        .send(Event::Rubrics(vec![saved("Essay 2", ESSAY)]))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("Saved the rubric \u{201c}Essay 2\u{201d}.");
    assert!(harness.query_by_label("Change the rubric").is_none());

    // A copy starts under a name of its own, as a new rubric.
    scroll_to_and_press(&mut harness, "Copy");
    harness.get_by_label("A new rubric");
    scroll_to_and_press(&mut harness, "Save the rubric");
    let Command::PutRubric { was, rubric } = sent(&mut stand_in) else {
        panic!("expected the copy to be saved");
    };
    assert_eq!(was, None);
    assert_eq!(rubric.name, "Essay 2 (copy)");
    // The worker refuses it: the form stays, to put right.
    stand_in
        .events
        .send(Event::Failed("The disk is full.".into()))
        .unwrap();
    frames(&mut harness);
    harness.get_by_label("The disk is full.");
    harness.get_by_label("A new rubric");
    scroll_to_and_press(&mut harness, "Cancel");
    assert!(harness.query_by_label("A new rubric").is_none());

    // Deleting asks first.
    scroll_to_and_press(&mut harness, "Delete");
    assert!(stand_in.commands.try_recv().is_err());
    scroll_to_and_press(&mut harness, "Delete the saved rubric");
    let Command::DeleteRubric(name) = sent(&mut stand_in) else {
        panic!("expected the rubric to be deleted");
    };
    assert_eq!(name, "Essay 2");
    stand_in.events.send(Event::Rubrics(Vec::new())).unwrap();
    frames(&mut harness);
    harness.get_by_label_contains("None yet.");

    // A new one needs a name and something to grade against.
    scroll_to_and_press(&mut harness, "Write a rubric");
    scroll_to_and_press(&mut harness, "Save the rubric");
    assert!(stand_in.commands.try_recv().is_err());
    for (field, text) in [
        ("Name", "Binomial FRQ"),
        ("Requirements and model response", "Names n and p"),
    ] {
        harness.get_by_label(field).scroll_to_me();
        frames(&mut harness);
        harness.get_by_label(field).click();
        frames(&mut harness);
        harness.get_by_label(field).type_text(text);
        frames(&mut harness);
    }
    harness.get_by_label_contains("1 requirement in 1 category");
    scroll_to_and_press(&mut harness, "Save the rubric");
    let Command::PutRubric { was, rubric } = sent(&mut stand_in) else {
        panic!("expected the new rubric to be saved");
    };
    assert_eq!(was, None);
    assert_eq!(
        (rubric.name.as_str(), rubric.text.as_str()),
        ("Binomial FRQ", "Names n and p")
    );
}
