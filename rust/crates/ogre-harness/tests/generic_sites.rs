//! Maps grading pages OGRE has never seen, validates the mapping and drives
//! the pages with it, in a real headless Chrome.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness -- --ignored
//!
//! The pages are the desktop app's fixtures, copied to fixtures/generic/.
//! simple-batch.html and batch-grading-complex.html have a small script added
//! that stands in for the site's save; rich-feedback.html was written for
//! these tests.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use ogre_core::{
    FeedbackKind, FeedbackWrite, GradeWrite, GradingPage, ScoreWrite, WritePolicy, plan_write,
};
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_harness::sites::generic::{
    ButtonRule, DiscoverOptions, DiscoveryError, DiscoverySource, Element, FeedbackBox, Framed,
    MaxScoreRule, PageMap, PickFor, ProfileAdapter, SaveRule, SaveSuccess, Severity, SiteProfile,
    Snapshot, SnapshotNode, SnapshotOptions, ValidatedProfile, capture_snapshot, detect, discover,
    draft_profile, main_frame, pick_element, validate_profile,
};
use ogre_harness::sites::{SiteAdapter, verify_writes};
use ogre_harness::{Error, InputDriver, PageDriver};
use ogre_llm::{ChatProvider, ChatRequest, LlmError, ProviderKind, Role};
use serde_json::{Value, json};

struct Session {
    chrome: Chrome,
    profile_dir: PathBuf,
    page: CdpPage,
}

async fn open(test: &str, fixture: &str) -> Session {
    let profile_dir =
        std::env::temp_dir().join(format!("ogre-test-generic-{test}-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let page = chrome.open(&fixture_url(fixture)).await.unwrap();
    Session {
        chrome,
        profile_dir,
        page,
    }
}

fn fixture_url(fixture: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/generic")
        .join(fixture)
        .canonicalize()
        .expect("fixture exists");
    format!("file://{}", path.display())
}

async fn close(session: Session) {
    session.chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(session.profile_dir);
}

const NO_OVERWRITE: WritePolicy = WritePolicy {
    overwrite_scores: false,
    replace_feedback: false,
};

/// Feedback an AI might return, with an attack in it.
const HOSTILE: &str = "<p onclick=\"steal()\">Good <strong>work</strong>.</p>\
                       <script>window.__pwned = true</script><img src=x onerror=\"window.__pwned = true\">";

fn planned(page: &GradingPage, index: usize, score: f64, feedback: &str) -> GradeWrite {
    plan_write(&page.submissions[index], score, feedback, NO_OVERWRITE).expect("write is allowed")
}

async fn snapshot(page: &CdpPage) -> Snapshot {
    capture_snapshot(page, &SnapshotOptions::default())
        .await
        .expect("snapshot is taken")
}

/// The profile heuristics propose for the page, which must validate as it stands.
async fn heuristic_profile(page: &CdpPage) -> ValidatedProfile {
    let draft = draft_profile(&snapshot(page).await).expect("heuristics propose a profile");
    validated(page, draft).await
}

async fn validated(page: &CdpPage, profile: SiteProfile) -> ValidatedProfile {
    let report = validate_profile(page, &profile).await.unwrap();
    match report.into_validated() {
        Ok(profile) => profile,
        Err(report) => panic!("profile did not validate:\n{}", report.error_summary()),
    }
}

fn names(page: &GradingPage) -> Vec<&str> {
    page.submissions.iter().map(|s| s.name.as_str()).collect()
}

/// What a fixture should read as, and where to write in it.
struct Expected {
    fixture: &'static str,
    map: PageMap,
    names: &'static [&'static str],
    /// A phrase from each student's answer, in order.
    answers: &'static [&'static str],
    max: f64,
    score_fields: &'static [&'static str],
    student_ids: &'static [Option<&'static str>],
}

/// Reads every student, writes to the second, checks that nobody else
/// changed and that a score typed in the meantime is not overwritten.
async fn read_write_and_refuse(test: &str, expected: Expected) {
    let s = open(test, expected.fixture).await;
    let profile = heuristic_profile(&s.page).await;
    assert_eq!(profile.profile().page, expected.map);
    assert!(
        profile
            .profile()
            .url
            .matches(&fixture_url(expected.fixture))
    );
    let adapter = ProfileAdapter::new(profile);
    assert!(adapter.matches(&s.page.url().await.unwrap()));
    assert!(!adapter.matches("https://www.myopenmath.com/course/gradeallq2.php"));
    assert!(!adapter.saves_on_write());

    // Every student is read, in order, with nothing awarded yet.
    let before = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&before), expected.names);
    assert_eq!(before.position, None);
    for (i, student) in before.submissions.iter().enumerate() {
        assert_eq!(student.index, i);
        assert!(
            student.response.contains(expected.answers[i]),
            "{i}: {:?}",
            student.response
        );
        assert_eq!(student.scores.len(), 1, "{i}");
        assert_eq!(student.scores[0].field, expected.score_fields[i]);
        assert_eq!(student.scores[0].raw, "");
        assert_eq!(student.max_score(), Some(expected.max), "{i}");
        assert_eq!(student.student_id.as_deref(), expected.student_ids[i]);
        assert_eq!(student.feedback.is_some(), expected.map.feedback.is_some());
        assert!(!student.has_feedback());
        // Nobody's answer leaks into another student's.
        for (j, other) in expected.answers.iter().enumerate() {
            assert_eq!(
                student.response.contains(other),
                i == j,
                "{i} holds {j}'s answer"
            );
        }
    }
    let rubric = adapter.read_rubric(&s.page).await.unwrap();
    assert_eq!(rubric.max_score_value(), expected.max);
    assert_eq!(rubric.essay_prompt, None);
    assert!(rubric.checklist_items.is_empty());

    // The second student gets a score and, where there is a box, feedback.
    let write = planned(&before, 1, 3.5, HOSTILE);
    assert_eq!(write.feedback.is_some(), expected.map.feedback.is_some());
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.score, "3.5");
    assert_eq!(
        receipt.feedback_text.as_deref(),
        expected.map.feedback.as_ref().map(|_| "Good work.")
    );
    assert_eq!(
        s.page.eval("window.__pwned === true").await.unwrap(),
        json!(false)
    );

    let after = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(after.submissions[1].score(), Some(3.5));
    if expected.map.feedback.is_some() {
        let feedback = after.submissions[1].feedback.as_ref().unwrap();
        assert_eq!(feedback.text, "Good work.");
    }
    for i in (0..after.submissions.len()).filter(|&i| i != 1) {
        assert_eq!(
            after.submissions[i], before.submissions[i],
            "student {i} changed"
        );
    }
    let written = vec![(write, receipt)];
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );

    // The teacher types a score for the first student while the AI is still grading.
    let late = planned(&before, 0, 2.0, "<p>Too late.</p>");
    let section = expected.map.student_section.as_deref().unwrap();
    let typed = format!(
        "document.querySelectorAll({})[0].querySelector({}).value = '4'",
        json!(section),
        json!(expected.map.score_input)
    );
    s.page.eval(&typed).await.unwrap();
    let err = adapter.write_grade(&s.page, &late).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains(expected.names[0]) && m.contains("changed on the page")),
        "{err:?}"
    );
    let now = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(now.submissions[0].score(), Some(4.0));
    assert!(
        !now.submissions[0].has_feedback(),
        "no feedback was written either"
    );
    // The earlier write is untouched by the refusal.
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );

    close(s).await;
}

fn textarea(selector: &str) -> Option<FeedbackBox> {
    Some(FeedbackBox {
        selector: selector.into(),
        kind: FeedbackKind::Textarea,
        hidden_field: None,
    })
}

fn max_in(selector: &str) -> Option<MaxScoreRule> {
    Some(MaxScoreRule::Selector {
        selector: selector.into(),
        pattern: None,
    })
}

fn save_by(selector: &str) -> Option<SaveRule> {
    Some(SaveRule {
        button: ButtonRule::Selector {
            selector: selector.into(),
        },
        success: None,
    })
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn simple_batch_is_mapped_read_and_written() {
    read_write_and_refuse(
        "simple",
        Expected {
            fixture: "simple-batch.html",
            map: PageMap {
                student_section: Some("div[data-lastchange]".into()),
                student_name: "span.student-name".into(),
                score_input: "input[name^=\"score_\"]".into(),
                max_score: max_in("span.max-score"),
                feedback: textarea("textarea[name^=\"feedback_\"]"),
                response: "div.question-region".into(),
                prompt: None,
                save: save_by("#save-all"),
                frame: None,
                next_student: None,
                previous_student: None,
            },
            names: &["Alice Johnson", "Bob Smith", "Carol Davis"],
            answers: &["by expanding", "I factored", "I think it equals"],
            max: 10.0,
            score_fields: &["name:score_1", "name:score_2", "name:score_3"],
            student_ids: &[None, None, None],
        },
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_table_layout_is_mapped_read_and_written() {
    read_write_and_refuse(
        "table",
        Expected {
            fixture: "batch-grading-complex.html",
            map: PageMap {
                student_section: Some("tr[data-lastchange]".into()),
                student_name: "td.student-col".into(),
                score_input: "input[name^=\"score_\"]".into(),
                max_score: max_in("span.max"),
                feedback: textarea("textarea[name^=\"feedback_\"]"),
                response: "td.response-col".into(),
                prompt: None,
                save: save_by("#save-all-btn"),
                frame: None,
                next_student: None,
                previous_student: None,
            },
            names: &["Alice Johnson", "Bob Smith", "Carol Davis"],
            answers: &["L'Hôpital", "squeeze theorem", "maybe it's infinity"],
            max: 20.0,
            score_fields: &["name:score_alice", "name:score_bob", "name:score_carol"],
            student_ids: &[Some("alice"), Some("bob"), Some("carol")],
        },
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn deeply_wrapped_rows_are_mapped_read_and_written() {
    read_write_and_refuse(
        "messy",
        Expected {
            fixture: "messy-wrappers.html",
            map: PageMap {
                student_section: Some("div[data-lastchange]".into()),
                student_name: "span.name".into(),
                score_input: "input[type=\"number\"]".into(),
                // "/ 5" sits in a bare span, so it is found by its text.
                max_score: Some(MaxScoreRule::usual()),
                feedback: None,
                response: "div.response-container".into(),
                prompt: None,
                save: None,
                frame: None,
                next_student: None,
                previous_student: None,
            },
            names: &["Alice Johnson", "Bob Smith"],
            answers: &["Student wrote: 42", "Student wrote: 7"],
            max: 5.0,
            score_fields: &["name:g1", "name:g2"],
            student_ids: &[None, None],
        },
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn an_unknown_lms_is_mapped_read_and_written() {
    read_write_and_refuse(
        "unknown",
        Expected {
            fixture: "unknown-lms.html",
            map: PageMap {
                student_section: Some("article[id^=\"sub-\"]".into()),
                student_name: "strong.submitter".into(),
                score_input: "input[aria-label=\"Points out of 25\"]".into(),
                max_score: max_in("span.pts-label"),
                feedback: textarea("textarea.comments"),
                response: "section.sub-body".into(),
                prompt: None,
                // Each student has a "Grade" button; none saves the page.
                save: None,
                frame: None,
                next_student: None,
                previous_student: None,
            },
            names: &["Emily Wilson", "Frank Martinez"],
            answers: &["abolition of feudalism", "storming of the Bastille"],
            max: 25.0,
            // The boxes have neither a name nor an id: they are found by position.
            score_fields: &["nth:0", "nth:1"],
            student_ids: &[Some("sub-9001"), Some("sub-9002")],
        },
    )
    .await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn validation_reports_what_it_found_for_each_mapped_element() {
    let s = open("report", "unknown-lms.html").await;
    let draft = draft_profile(&snapshot(&s.page).await).unwrap();
    let report = validate_profile(&s.page, &draft).await.unwrap();

    assert!(report.passed());
    assert_eq!(report.students, 2);
    assert_eq!(report.hidden_sections, 0);
    assert_eq!(report.url, fixture_url("unknown-lms.html"));
    assert_eq!(report.feedback_kind_seen, Some(FeedbackKind::Textarea));
    let counts: Vec<_> = report
        .elements
        .iter()
        .map(|c| (c.element, c.none, c.one, c.several))
        .collect();
    assert_eq!(
        counts,
        [
            (Element::StudentSection, 0, 0, 1),
            (Element::StudentName, 0, 2, 0),
            (Element::ScoreInput, 0, 2, 0),
            (Element::MaxScore, 0, 2, 0),
            (Element::Feedback, 0, 2, 0),
            (Element::Response, 0, 2, 0),
        ]
    );
    let sample = &report.samples[0];
    assert_eq!(sample.name, "Emily Wilson");
    assert_eq!(sample.score, "");
    assert_eq!(sample.max, Some(25.0));
    assert_eq!(
        sample.response_chars,
        "The French Revolution began in 1789 and fundamentally transformed European society through the abolition of feudalism and the rise of democratic ideals."
            .len()
    );
    assert!(sample.has_feedback_box);
    // The one remark: nothing is mapped for saving.
    let remarks: Vec<_> = report
        .problems()
        .iter()
        .map(|p| (p.element, p.severity))
        .collect();
    assert_eq!(remarks, [(Element::SaveButton, Severity::Warning)]);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_wrong_profile_fails_validation_with_a_list_of_what_is_wrong() {
    let s = open("wrong", "simple-batch.html").await;
    let good = draft_profile(&snapshot(&s.page).await).unwrap();

    let mut wrong = good.clone();
    wrong.page.student_name = ".student-nam".into();
    wrong.page.score_input = "label".into();
    wrong.page.max_score = max_in(".question-region p");
    wrong.page.feedback = Some(FeedbackBox {
        selector: ".grading-controls".into(),
        kind: FeedbackKind::RichText,
        hidden_field: None,
    });
    wrong.page.response = ".question-region > *".into();
    wrong.page.save = Some(SaveRule {
        button: ButtonRule::Text {
            text: "Save".into(),
        },
        success: Some(SaveSuccess {
            selector: "#save-status".into(),
            pattern: Some("(".into()),
        }),
    });
    let report = validate_profile(&s.page, &wrong).await.unwrap();
    let errors: Vec<String> = report.errors().map(ToString::to_string).collect();
    assert_eq!(
        errors,
        [
            "student name: `.student-nam` matches nothing inside any student section",
            "score box: `label` is a label, not a text or number box",
            "feedback box: `.grading-controls` is not a text box or an editable area",
            "student response: `.question-region > *` matches several elements for every student; it has to match exactly one",
            "save button: a button labelled \"Save\" was not found on the page",
            "save confirmation: the pattern is not a valid regular expression",
        ]
    );
    assert_eq!(report.students, 3);
    assert!(report.into_validated().is_err());

    // A selector the browser rejects, and one that matches nothing.
    let mut invalid = good.clone();
    invalid.page.student_section = Some("div..student-row".into());
    let report = validate_profile(&s.page, &invalid).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "student section: `div..student-row` is not a valid CSS selector"
    );
    let mut invalid = good.clone();
    invalid.page.score_input = "input[[name]".into();
    invalid.page.student_section = Some("div.student-row".into());
    let report = validate_profile(&s.page, &invalid).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "score box: `input[[name]` is not a valid CSS selector"
    );
    let mut elsewhere = good.clone();
    elsewhere.page.student_section = Some("tr.student".into());
    let report = validate_profile(&s.page, &elsewhere).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "student section: `tr.student` matches nothing on the page"
    );

    // A selector that takes in wrappers as well as rows.
    let mut nested = good.clone();
    nested.page.student_section = Some("div".into());
    let report = validate_profile(&s.page, &nested).await.unwrap();
    assert!(report.has_error(Element::StudentSection));
    assert!(
        report
            .error_summary()
            .contains("matches elements that contain each other"),
        "{}",
        report.error_summary()
    );

    // The maximum is read from where the profile says, even when that is wrong:
    // the first paragraph of the answer holds a 2 ("x^2 + 2x + 1").
    let mut odd_max = good.clone();
    odd_max.page.max_score = max_in(".question-region p");
    let report = validate_profile(&s.page, &odd_max).await.unwrap();
    assert!(report.passed());
    assert_eq!(report.samples[0].max, Some(2.0));
    // Which is why the report shows the teacher what was read.
    let good_report = validate_profile(&s.page, &good).await.unwrap();
    assert_eq!(good_report.samples[0].max, Some(10.0));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn an_adapter_refuses_a_page_its_profile_no_longer_fits() {
    let s = open("stale", "simple-batch.html").await;
    let adapter = ProfileAdapter::new(heuristic_profile(&s.page).await);
    let before = adapter.read_page(&s.page).await.unwrap();
    let write = planned(&before, 1, 5.0, "<p>Fine.</p>");

    // The site is redesigned: the names move to another element.
    s.page
        .eval(
            "document.querySelectorAll('.student-name').forEach((el) => { el.className = 'who'; })",
        )
        .await
        .unwrap();
    let err = adapter.read_page(&s.page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m)
            if m.contains("does not fit the site profile")
            && m.contains("student name: `span.student-name` matches nothing inside any student section")),
        "{err:?}"
    );
    assert!(adapter.read_rubric(&s.page).await.is_err());
    // A write planned before the change is refused too: the student cannot be confirmed.
    let err = adapter.write_grade(&s.page, &write).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("different student")),
        "{err:?}"
    );
    assert_eq!(
        s.page
            .eval("document.getElementsByName('score_2')[0].value")
            .await
            .unwrap(),
        json!("")
    );

    // A different page altogether.
    s.page
        .navigate(&fixture_url("unknown-lms.html"))
        .await
        .unwrap();
    let err = adapter.read_page(&s.page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("student section: `div[data-lastchange]` matches nothing")),
        "{err:?}"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_write_goes_to_the_student_it_was_planned_for_or_nowhere() {
    let s = open("identity", "unknown-lms.html").await;
    let adapter = ProfileAdapter::new(heuristic_profile(&s.page).await);
    let before = adapter.read_page(&s.page).await.unwrap();
    let untouched = "Array.from(document.querySelectorAll('input.pts-input, textarea.comments')).map((el) => el.value)";
    let blank = json!(["", "", "", ""]);

    // Feedback aimed at another student's box.
    let mut crossed = planned(&before, 0, 20.0, "<p>For Emily.</p>");
    crossed.feedback = Some(FeedbackWrite {
        field: before.submissions[1]
            .feedback
            .as_ref()
            .unwrap()
            .field
            .clone(),
        kind: FeedbackKind::Textarea,
        html: "<p>For Emily.</p>".into(),
    });
    let err = adapter.write_grade(&s.page, &crossed).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("belong to different students")),
        "{err:?}"
    );
    assert_eq!(s.page.eval(untouched).await.unwrap(), blank);

    // A box reference that does not exist.
    let mut missing = planned(&before, 0, 20.0, "");
    missing.score = ScoreWrite {
        field: "name:no-such-box".into(),
        expected: String::new(),
        value: 20.0,
    };
    let err = adapter.write_grade(&s.page, &missing).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("expected one score box \"no-such-box\", found 0")),
        "{err:?}"
    );

    // The list is re-sorted after reading: Frank is now where Emily was. The
    // boxes here are found by position, so only the name can tell.
    let for_emily = planned(&before, 0, 20.0, "<p>For Emily.</p>");
    s.page
        .eval("(() => { const list = document.querySelector('.submissions-list'); list.appendChild(list.firstElementChild); })()")
        .await
        .unwrap();
    let err = adapter.write_grade(&s.page, &for_emily).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("Emily Wilson") && m.contains("different student")),
        "{err:?}"
    );
    assert_eq!(s.page.eval(untouched).await.unwrap(), blank);

    // After a fresh read the same grade lands with Emily, wherever she is.
    let reread = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&reread), ["Frank Martinez", "Emily Wilson"]);
    let write = planned(&reread, 1, 20.0, "<p>For Emily.</p>");
    adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(
        s.page.eval(untouched).await.unwrap(),
        json!(["", "", "20", "For Emily."])
    );

    // A read-only box is not written through.
    s.page
        .eval("document.querySelector('input.pts-input').readOnly = true")
        .await
        .unwrap();
    let frank = planned(&reread, 0, 11.0, "");
    let err = adapter.write_grade(&s.page, &frank).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("read-only")),
        "{err:?}"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn saving_waits_for_the_confirmation_the_profile_describes() {
    let s = open("save", "simple-batch.html").await;
    let drafted = heuristic_profile(&s.page).await;

    // Heuristics find the button but cannot know what a finished save looks
    // like, so nothing is clicked.
    let cautious = ProfileAdapter::new(drafted.clone());
    let err = cautious.save(&s.page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("Save in the browser yourself")),
        "{err:?}"
    );
    assert_eq!(
        s.page.eval("window.__saved.length").await.unwrap(),
        json!(0)
    );

    // The teacher says what a finished save looks like.
    let mut profile = drafted.into_profile();
    profile.page.save = Some(SaveRule {
        button: ButtonRule::Text {
            text: "save all grades".into(),
        },
        success: Some(SaveSuccess {
            selector: "#save-status".into(),
            pattern: Some("^Saved$".into()),
        }),
    });
    let adapter = ProfileAdapter::new(validated(&s.page, profile).await)
        .with_save_timeout(Duration::from_millis(1500));

    let before = adapter.read_page(&s.page).await.unwrap();
    let write = planned(&before, 2, 7.0, "<p>Check the sign.</p>");
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(
        s.page.eval("window.__saved.length").await.unwrap(),
        json!(0),
        "writing must not save"
    );
    assert_eq!(
        verify_writes(&adapter, &s.page, &[(write, receipt)])
            .await
            .unwrap(),
        []
    );

    adapter.save(&s.page).await.unwrap();
    let saved: Value = s.page.eval("window.__saved").await.unwrap();
    assert_eq!(saved.as_array().map(Vec::len), Some(1));
    assert_eq!(saved[0]["score_3"], "7");
    assert_eq!(saved[0]["feedback_3"], "Check the sign.");
    assert_eq!(
        saved[0]["score_1"], "",
        "other students are saved unchanged"
    );

    // "Saved" is still on screen from the first save; the second must be
    // confirmed afresh, not by the old message.
    adapter.save(&s.page).await.unwrap();
    assert_eq!(
        s.page.eval("window.__saved.length").await.unwrap(),
        json!(2)
    );

    // A save the site rejects is reported with what the site said.
    s.page
        .eval("window.__failSave = 'Session expired'")
        .await
        .unwrap();
    let err = adapter.save(&s.page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m)
            if m.contains("timed out waiting for the site to confirm the save")
            && m.contains("Session expired")
            && m.contains("save in the browser yourself")),
        "{err:?}"
    );
    assert_eq!(
        s.page.eval("window.__saved.length").await.unwrap(),
        json!(2)
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_save_confirmed_by_a_notice_that_appears_is_recognized() {
    let s = open("save-notice", "batch-grading-complex.html").await;
    let mut profile = heuristic_profile(&s.page).await.into_profile();
    profile.page.save = Some(SaveRule {
        button: ButtonRule::Selector {
            selector: "#save-all-btn".into(),
        },
        success: Some(SaveSuccess {
            selector: ".notice-success".into(),
            pattern: None,
        }),
    });
    let adapter = ProfileAdapter::new(validated(&s.page, profile.clone()).await)
        .with_save_timeout(Duration::from_millis(1500));

    adapter.save(&s.page).await.unwrap();
    // The first notice stays up; a second save needs a notice of its own.
    adapter.save(&s.page).await.unwrap();
    assert_eq!(
        s.page
            .eval("[window.__saved.length, document.querySelectorAll('.notice-success').length]")
            .await
            .unwrap(),
        json!([2, 2])
    );

    // "Save" alone is each row's own button, not the page's.
    profile.page.save = Some(SaveRule {
        button: ButtonRule::Text {
            text: "Save".into(),
        },
        success: None,
    });
    let report = validate_profile(&s.page, &profile).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "save button: a button labelled \"Save\" matches 3 buttons; it has to be the page's one save button"
    );

    close(s).await;
}

/// A stand-in for TinyMCE on rich-feedback.html: owns each `.fb` box and
/// fills its hidden field on save, as the real editor does.
const EDITOR_STAND_IN: &str = "(() => {
  window.__editorCalls = [];
  window.tinymce = {
    get: (id) => {
      const el = document.getElementById(id);
      if (!el || !el.classList.contains('fb')) return null;
      return {
        setContent: (html) => { el.innerHTML = html; window.__editorCalls.push('set ' + id); },
        save: () => {
          el.parentElement.querySelector('input[type=hidden]').value = el.innerHTML;
          window.__editorCalls.push('save ' + id);
        },
        setDirty: () => {},
        getContent: () => el.textContent,
      };
    },
  };
})()";

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn rich_text_feedback_is_written_with_its_hidden_field() {
    let s = open("rich", "rich-feedback.html").await;
    let profile = heuristic_profile(&s.page).await;
    assert_eq!(
        profile.profile().page,
        PageMap {
            student_section: Some("li[data-student-id]".into()),
            student_name: "a.who".into(),
            score_input: "input[name^=\"pts[\"]".into(),
            max_score: max_in("span.of"),
            feedback: Some(FeedbackBox {
                selector: "div[aria-label=\"Feedback\"]".into(),
                kind: FeedbackKind::RichText,
                hidden_field: Some("input[name^=\"fb[\"]".into()),
            }),
            response: "div.essay".into(),
            prompt: None,
            save: None,
            frame: None,
            next_student: None,
            previous_student: None,
        }
    );
    let adapter = ProfileAdapter::new(profile);

    let before = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&before), ["Dana Ortiz", "Eli Park", "Fay Quinn"]);
    assert_eq!(before.submissions[0].student_id.as_deref(), Some("501"));
    assert_eq!(before.submissions[0].scores[0].field, "name:pts[501]");
    assert_eq!(before.submissions[0].max_score(), Some(8.0));
    assert_eq!(
        before.submissions[2].response,
        "Free trade lets each country do what it does *best*."
    );
    let existing = before.submissions[1].feedback.as_ref().unwrap();
    assert_eq!(
        (
            existing.field.as_str(),
            existing.kind,
            existing.text.as_str()
        ),
        ("id:fb502", FeedbackKind::RichText, "See me.")
    );
    // Eli already has points and feedback: nothing may be written by default.
    assert!(plan_write(&before.submissions[1], 8.0, "<p>x</p>", NO_OVERWRITE).is_err());

    // No editor runs on the page: the box and its hidden field are set directly.
    let write = planned(&before, 0, 6.5, HOSTILE);
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.feedback_text.as_deref(), Some("Good work."));
    let state = s
        .page
        .eval(
            "({ pwned: window.__pwned === true, \
               box: document.getElementById('fb501').innerHTML, \
               hidden: document.getElementsByName('fb[501]')[0].value, \
               others: [document.getElementsByName('fb[502]')[0].value, document.getElementsByName('fb[503]')[0].value] })",
        )
        .await
        .unwrap();
    assert_eq!(state["pwned"], false);
    assert_eq!(state["box"], "<p>Good <strong>work</strong>.</p>");
    assert_eq!(state["hidden"], "<p>Good <strong>work</strong>.</p>");
    assert_eq!(state["others"], json!(["<p>See me.</p>", ""]));
    let written = vec![(write, receipt)];
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );

    // With an editor on the page, the write goes through it.
    s.page.eval(EDITOR_STAND_IN).await.unwrap();
    let write = planned(&before, 2, 8.0, "<p>Clear and <em>correct</em>.</p>");
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.feedback_text.as_deref(), Some("Clear and correct."));
    assert_eq!(
        s.page
            .eval("[window.__editorCalls, document.getElementsByName('fb[503]')[0].value]")
            .await
            .unwrap(),
        json!([
            ["set fb503", "save fb503"],
            "<p>Clear and <em>correct</em>.</p>"
        ])
    );
    assert_eq!(
        verify_writes(&adapter, &s.page, &[(write, receipt)])
            .await
            .unwrap(),
        []
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn an_editor_ogre_cannot_drive_fails_validation_and_refuses_writes() {
    let s = open("foreign", "rich-feedback.html").await;
    let profile = heuristic_profile(&s.page).await;
    let adapter = ProfileAdapter::new(profile.clone());
    let before = adapter.read_page(&s.page).await.unwrap();
    let write = planned(&before, 0, 6.0, "<p>Good.</p>");

    // The boxes turn out to belong to an editor that keeps its own document.
    s.page
        .eval("document.querySelectorAll('.fb').forEach((el) => el.classList.add('ql-editor'))")
        .await
        .unwrap();
    let report = validate_profile(&s.page, profile.profile()).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "feedback box: `div[aria-label=\"Feedback\"]` belongs to Quill, an editor OGRE cannot write through"
    );
    let err = adapter.write_grade(&s.page, &write).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("Quill")),
        "{err:?}"
    );
    assert_eq!(
        s.page
            .eval("[document.getElementsByName('pts[501]')[0].value, document.getElementById('fb501').innerHTML]")
            .await
            .unwrap(),
        json!(["0", ""]),
        "the score is not written when the feedback cannot be"
    );

    // A profile that calls the boxes plain text is told what they are.
    let mut plain = profile.into_profile();
    if let Some(feedback) = &mut plain.page.feedback {
        feedback.kind = FeedbackKind::Textarea;
    }
    s.page
        .eval("document.querySelectorAll('.fb').forEach((el) => el.classList.remove('ql-editor'))")
        .await
        .unwrap();
    let report = validate_profile(&s.page, &plain).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "feedback box: `div[aria-label=\"Feedback\"]` is a rich text area but the profile says a plain text box"
    );
    assert_eq!(report.feedback_kind_seen, Some(FeedbackKind::RichText));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_page_showing_one_student_is_read_and_written_for_that_student() {
    let s = open("sequential", "sequential-grading.html").await;

    // Structure alone is not trusted here (no rows repeat), but its draft is sound.
    let found = detect(&snapshot(&s.page).await).expect("detected");
    assert_eq!(
        found.pattern_name,
        "Sequential grading (score-input, name-candidate, save-button)"
    );
    assert!(found.confidence < 0.7);
    let draft = SiteProfile::for_page(
        &fixture_url("sequential-grading.html"),
        found.page_map().unwrap(),
    );
    assert_eq!(
        draft.page,
        PageMap {
            student_section: None,
            student_name: "h2".into(),
            score_input: "input[name=\"score\"]".into(),
            max_score: Some(MaxScoreRule::usual()),
            feedback: textarea("textarea[name=\"feedback\"]"),
            response: "#student-response".into(),
            prompt: None,
            save: Some(SaveRule {
                button: ButtonRule::Text {
                    text: "Save & Next".into()
                },
                success: None
            }),
            frame: None,
            next_student: Some(ButtonRule::Selector {
                selector: "#next-student".into(),
            }),
            previous_student: Some(ButtonRule::Selector {
                selector: "#prev-student".into(),
            }),
        }
    );

    // With no way on mapped, the page is read and written for the student
    // it shows, and saving is left to the teacher.
    let mut alone = draft;
    alone.page.next_student = None;
    alone.page.previous_student = None;
    let adapter = ProfileAdapter::new(validated(&s.page, alone).await);
    assert!(!adapter.saves_on_write());
    let before = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(before.submissions.len(), 1);
    let student = &before.submissions[0];
    assert_eq!(student.name, "Student 3 of 30: Carol Davis");
    assert!(student.response.contains("3x^2 by the power rule"));
    assert_eq!(student.max_score(), Some(15.0));
    assert_eq!(student.scores[0].field, "name:score");
    assert_eq!(student.student_id, None);

    let write = planned(&before, 0, 12.5, "<p>Right, and well put.</p>");
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(
        s.page
            .eval("[document.getElementById('score-input').value, document.getElementById('feedback-input').value]")
            .await
            .unwrap(),
        json!(["12.5", "Right, and well put."])
    );
    assert_eq!(
        verify_writes(&adapter, &s.page, &[(write, receipt)])
            .await
            .unwrap(),
        []
    );

    close(s).await;
}

/// What says that the made-up sites below kept a grade.
fn confirmed_by(button: &str, selector: &str, pattern: Option<&str>) -> Option<SaveRule> {
    Some(SaveRule {
        button: ButtonRule::Selector {
            selector: button.into(),
        },
        success: Some(SaveSuccess {
            selector: selector.into(),
            pattern: pattern.map(str::to_owned),
        }),
    })
}

/// The made-up site that gives each student an address of their own.
fn by_address() -> PageMap {
    PageMap {
        student_section: None,
        student_name: "#student-name".into(),
        score_input: "#points".into(),
        max_score: Some(MaxScoreRule::usual()),
        feedback: textarea("#comment"),
        response: "#answer".into(),
        prompt: None,
        save: confirmed_by("#save", "#status", Some("^Saved for")),
        frame: None,
        next_student: Some(ButtonRule::Text {
            text: "Next student \u{bb}".into(),
        }),
        previous_student: None,
    }
}

/// What a made-up site has been given to keep, by key.
type Kept = std::sync::Arc<Mutex<serde_json::Map<String, Value>>>;

/// A web server for one of the made-up sites that show one student at a
/// time: it serves the fixtures, and keeps the grades their pages save, as a
/// site's server would. Every page it serves is told what is kept. Gives
/// the address of the server and what it keeps.
fn serve_site() -> (String, Kept) {
    use std::io::{BufRead, BufReader, Read, Write};
    let kept = Kept::default();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a free port");
    let address = format!("http://{}", listener.local_addr().unwrap());
    let shelf = kept.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(&stream);
            let mut request = String::new();
            if reader.read_line(&mut request).is_err() {
                continue;
            }
            let mut length = 0;
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
                    break;
                }
                if let Some((name, value)) = header.split_once(':')
                    && name.eq_ignore_ascii_case("content-length")
                {
                    length = value.trim().parse().unwrap_or(0);
                }
            }
            let mut body = vec![0; length];
            if reader.read_exact(&mut body).is_err() {
                continue;
            }
            let path = request.split_whitespace().nth(1).unwrap_or("/");
            let path = path.split('?').next().unwrap_or(path);
            let answer = match path.strip_prefix("/kept/") {
                Some(key) => {
                    let value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                    shelf.lock().unwrap().insert(key.to_owned(), value);
                    "{}".to_owned()
                }
                None => {
                    let file = Path::new(env!("CARGO_MANIFEST_DIR"))
                        .join("../../fixtures/generic")
                        .join(path.trim_start_matches('/'));
                    let page = std::fs::read_to_string(file).unwrap_or_default();
                    let known = Value::Object(shelf.lock().unwrap().clone());
                    page.replacen(
                        "<head>",
                        &format!("<head><script>window.KEPT = {known};</script>"),
                        1,
                    )
                }
            };
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                 Cache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}",
                answer.len()
            );
        }
    });
    (address, kept)
}

/// Starts Chrome on a fixture served by [`serve_site`].
async fn open_served(test: &str, fixture: &str) -> (Session, String, Kept) {
    let (address, kept) = serve_site();
    let url = format!("{address}/{fixture}");
    let s = open(test, fixture).await;
    s.page.navigate(&url).await.unwrap();
    (s, url, kept)
}

/// What the site keeps, as JSON.
fn kept_now(kept: &Kept) -> Value {
    Value::Object(kept.lock().unwrap().clone())
}

const FOUR_STUDENTS: [&str; 4] = ["Avery, Sam", "Brook, Kai", "Casey, Lin", "Drew, Pat"];

/// A profile adapter that does not wait long after the last student.
fn stepping(profile: ValidatedProfile) -> ProfileAdapter {
    ProfileAdapter::new(profile).with_settle_time(Duration::from_secs(2))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn every_student_of_a_site_that_shows_one_at_a_time_is_read_and_written() {
    let fixture = "one-at-a-time-addresses.html";
    let (s, url, kept) = open_served("one-by-address", fixture).await;
    let profile = SiteProfile::for_page(&url, by_address());
    let adapter = stepping(validated(&s.page, profile).await);
    assert!(
        adapter.saves_on_write(),
        "moving on would lose a grade that is only filled in"
    );

    // Read: everyone from the student shown to the last, the one with no
    // answer included, and the page is back where the teacher left it.
    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), FOUR_STUDENTS);
    assert_eq!(read.url, url);
    assert!(read.submissions[1].response.contains("sample size"));
    assert_eq!(read.submissions[2].response, "");
    for (at, student) in read.submissions.iter().enumerate() {
        assert_eq!(student.index, at);
        assert_eq!(student.scores[0].field, format!("{at}/name:points"));
        assert_eq!(
            student.feedback.as_ref().unwrap().field,
            format!("{at}/name:comment")
        );
        assert_eq!(student.max_score(), Some(10.0));
        assert_eq!(student.score(), None);
    }
    let shown = "document.getElementById('student-name').textContent";
    assert_eq!(s.page.eval(shown).await.unwrap(), json!("Avery, Sam"));

    // Write: the last student and then the second, each saved before OGRE
    // moves on, and each found again to check that the site kept it.
    let last = planned(&read, 3, 8.5, "<p>Clear and correct.</p>");
    let second = planned(&read, 1, 6.0, "<p>Say how it depends.</p>");
    let mut written = Vec::new();
    for write in [last, second] {
        let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
        written.push((write, receipt));
    }
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );
    assert_eq!(
        kept_now(&kept),
        json!({
            "grade-4": { "points": "8.5", "comment": "Clear and correct." },
            "grade-2": { "points": "6", "comment": "Say how it depends." },
        })
    );

    // A fresh read shows the two grades and nobody else's.
    let after = adapter.read_page(&s.page).await.unwrap();
    let scores: Vec<_> = after.submissions.iter().map(|s| s.score()).collect();
    assert_eq!(scores, [None, Some(6.0), None, Some(8.5)]);
    assert_eq!(
        after.submissions[3].feedback.as_ref().unwrap().text,
        "Clear and correct."
    );

    // A score someone gave in the meantime is not written over.
    let stale = planned(&after, 0, 9.0, "<p>Good.</p>");
    let by_hand = json!({ "points": "3", "comment": "By hand." });
    kept.lock()
        .unwrap()
        .insert("grade-1".into(), by_hand.clone());
    s.page.navigate(&url).await.unwrap();
    let refused = adapter.write_grade(&s.page, &stale).await.unwrap_err();
    assert!(
        matches!(&refused, Error::Page(reason) if reason.contains("changed on the page since it was read")),
        "{refused}"
    );
    assert_eq!(kept_now(&kept)["grade-1"], by_hand);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_student_who_cannot_be_graded_is_listed_and_passed_on_the_way() {
    let fixture = "one-at-a-time-addresses.html";
    let (s, url, kept) = open_served("one-nobox", fixture).await;
    s.page.navigate(&format!("{url}?odd=nobox")).await.unwrap();
    let profile = SiteProfile::for_page(&url, by_address());
    let adapter = stepping(validated(&s.page, profile).await);

    // The third student handed nothing in and has no score box. They are
    // still on the list, and the student after them is still read.
    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), FOUR_STUDENTS);
    assert!(read.submissions[2].scores.is_empty());
    assert_eq!(read.submissions[3].scores.len(), 1);

    // And the student after them is still reached to be written.
    let last = planned(&read, 3, 7.0, "<p>Good.</p>");
    let receipt = adapter.write_grade(&s.page, &last).await.unwrap();
    assert_eq!(
        verify_writes(&adapter, &s.page, &[(last, receipt)])
            .await
            .unwrap(),
        []
    );
    assert_eq!(kept_now(&kept)["grade-4"]["points"], "7");

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_walk_that_meets_a_page_it_cannot_read_says_so_and_does_not_stop_short() {
    let fixture = "one-at-a-time-addresses.html";
    let (s, url, _) = open_served("one-broken", fixture).await;
    s.page.navigate(&format!("{url}?odd=broken")).await.unwrap();
    let profile = SiteProfile::for_page(&url, by_address());
    let adapter = stepping(validated(&s.page, profile).await);

    // Two students in, the site shows a page with no name on it. Giving
    // back the two as if they were everyone would leave two ungraded.
    let stopped = adapter.read_page(&s.page).await.unwrap_err();
    assert!(
        matches!(&stopped, Error::Page(reason)
            if reason.contains("After \u{201c}Brook, Kai\u{201d}") && reason.contains("could not read")),
        "{stopped}"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_one_at_a_time_tool_inside_a_frame_is_read_and_written() {
    let fixture = "one-at-a-time-in-a-frame.html";
    let (s, top, kept) = open_served("one-in-a-frame", fixture).await;
    let mut map = by_address();
    map.frame = Some("iframe#tool".into());
    let profile = SiteProfile::for_page(&top, map);
    let adapter = stepping(validated(&s.page, profile).await);

    // Every student is found inside the frame, and the address is the one
    // the teacher has open, before the read and after it.
    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), FOUR_STUDENTS);
    assert_eq!(read.url, top);
    assert_eq!(s.page.url().await.unwrap(), top);
    let framed = Framed::new(&s.page, "iframe#tool");
    let shown = "document.getElementById('student-name').textContent";
    assert_eq!(framed.eval(shown).await.unwrap(), json!("Avery, Sam"));

    // Each student is gone to inside the frame, by their own address there.
    let last = planned(&read, 3, 8.5, "<p>Clear and correct.</p>");
    let second = planned(&read, 1, 6.0, "<p>Say how it depends.</p>");
    let mut written = Vec::new();
    for write in [last, second] {
        let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
        written.push((write, receipt));
    }
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );
    assert_eq!(kept_now(&kept)["grade-4"]["points"], "8.5");
    assert_eq!(kept_now(&kept)["grade-2"]["points"], "6");
    assert_eq!(s.page.url().await.unwrap(), top, "the school's page stayed");

    // A second read is of the same students under the same address.
    let again = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(again.url, top);
    let scores: Vec<_> = again.submissions.iter().map(|s| s.score()).collect();
    assert_eq!(scores, [None, Some(6.0), None, Some(8.5)]);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn students_behind_buttons_at_one_address_are_read_and_written() {
    let fixture = "one-at-a-time-buttons.html";
    let (s, _, kept) = open_served("one-by-buttons", fixture).await;

    // The page's structure gives the buttons away; what shows that a save
    // went through, it cannot.
    let mut draft = draft_profile(&snapshot(&s.page).await).expect("heuristics propose a profile");
    assert_eq!(
        draft.page.next_student,
        Some(ButtonRule::Selector {
            selector: "#next-student".into()
        })
    );
    assert_eq!(
        draft.page.previous_student,
        Some(ButtonRule::Selector {
            selector: "#prev-student".into()
        })
    );
    assert_eq!(draft.page.student_section, None);
    draft.page.save = confirmed_by("#save-grade", "#saved-note", None);
    let report = validate_profile(&s.page, &draft).await.unwrap();
    // On the first student the button back is there but cannot be pressed.
    assert!(report.passed(), "{}", report.error_summary());
    let adapter = stepping(validated(&s.page, draft.clone()).await);

    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), FOUR_STUDENTS);
    assert!(read.submissions[3].response.contains("bring down the 3"));
    assert_eq!(read.submissions[0].max_score(), Some(15.0));
    let shown = "document.getElementById('who').textContent";
    assert_eq!(s.page.eval(shown).await.unwrap(), json!("Avery, Sam"));

    // Forwards to the third student, then back to the first by the button.
    let third = planned(&read, 2, 4.0, "<p>The 3 is missing.</p>");
    let first = planned(&read, 0, 15.0, "<p>Yes.</p>");
    let mut written = Vec::new();
    for write in [third, first] {
        let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
        written.push((write, receipt));
    }
    assert_eq!(
        verify_writes(&adapter, &s.page, &written).await.unwrap(),
        []
    );
    assert_eq!(
        kept_now(&kept),
        json!({
            "quiz-grade-2": { "score": "4", "feedback": "The 3 is missing." },
            "quiz-grade-0": { "score": "15", "feedback": "Yes." },
        })
    );

    // With no button back mapped, an earlier student is reached by opening
    // the address again and going forwards from the first.
    draft.page.previous_student = None;
    let forwards_only = stepping(validated(&s.page, draft).await);
    let read = forwards_only.read_page(&s.page).await.unwrap();
    let last = planned(&read, 3, 12.0, "<p>Right.</p>");
    let second = planned(&read, 1, 10.0, "<p>Show the rule.</p>");
    let mut written = Vec::new();
    for write in [last, second] {
        let receipt = forwards_only.write_grade(&s.page, &write).await.unwrap();
        written.push((write, receipt));
    }
    assert_eq!(
        verify_writes(&forwards_only, &s.page, &written)
            .await
            .unwrap(),
        []
    );
    let all = kept_now(&kept);
    assert_eq!(all["quiz-grade-3"]["score"], "12");
    assert_eq!(all["quiz-grade-1"]["feedback"], "Show the rule.");
    assert_eq!(
        all["quiz-grade-0"]["score"], "15",
        "nobody else's grade changed"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn nothing_is_filled_in_on_a_one_at_a_time_site_that_cannot_confirm_a_save() {
    let fixture = "one-at-a-time-addresses.html";
    let s = open("one-no-confirmation", fixture).await;
    let mut map = by_address();
    map.save = save_by("#save");
    let profile = SiteProfile::for_page(&fixture_url(fixture), map);
    let report = validate_profile(&s.page, &profile).await.unwrap();
    assert!(report.passed());
    assert!(
        report.problems().iter().any(|p| {
            p.element == Element::NextStudent
                && p.severity == Severity::Warning
                && p.message.contains("none can be written")
        }),
        "the teacher is told before grading, not after"
    );
    let adapter = stepping(report.into_validated().unwrap());

    // Reading still goes through everyone.
    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), FOUR_STUDENTS);

    let write = planned(&read, 1, 6.0, "<p>Half.</p>");
    let refused = adapter.write_grade(&s.page, &write).await.unwrap_err();
    assert!(
        matches!(&refused, Error::Page(reason) if reason.contains("one student at a time")),
        "{refused}"
    );
    s.page
        .navigate(&format!("{}?student=2", fixture_url(fixture)))
        .await
        .unwrap();
    assert_eq!(
        s.page
            .eval("[document.getElementById('points').value, sessionStorage.length]")
            .await
            .unwrap(),
        json!(["", 0])
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn answers_shown_in_frames_from_another_site_are_read() {
    let s = open("answers-in-frames", "answers-in-frames.html").await;
    // A script of the page is not let into the frames.
    assert_eq!(
        s.page
            .eval("Array.from(document.querySelectorAll('iframe'), (f) => !!f.contentDocument)")
            .await
            .unwrap(),
        json!([false, false, false])
    );

    let profile = SiteProfile::for_page(
        &fixture_url("answers-in-frames.html"),
        PageMap {
            student_section: Some("div.submission".into()),
            student_name: ".student-name".into(),
            score_input: "input.score".into(),
            max_score: Some(MaxScoreRule::usual()),
            feedback: None,
            response: "iframe.answer-viewer".into(),
            prompt: None,
            save: None,
            frame: None,
            next_student: None,
            previous_student: None,
        },
    );
    let report = validate_profile(&s.page, &profile).await.unwrap();
    assert!(report.passed(), "{}", report.error_summary());
    assert!(
        !report.has_error(Element::Response),
        "the browser reads what the page's own script cannot"
    );

    let adapter = ProfileAdapter::new(report.into_validated().unwrap());
    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&read), ["Avery, Sam", "Brook, Kai", "Casey, Lin"]);
    let answers: Vec<&str> = read
        .submissions
        .iter()
        .map(|s| s.response.as_str())
        .collect();
    assert_eq!(
        answers,
        [
            "The **median** is 14, because it is the middle value.",
            "I added them all up and divided by 5.",
            "",
        ]
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_grading_page_inside_a_frame_is_mapped_read_and_written() {
    let fixture = "tool-in-a-frame.html";
    let s = open("tool-in-a-frame", fixture).await;
    let top = fixture_url(fixture);

    // The school's own page has no students on it; the frame that takes up
    // most of it is what there is to map.
    assert_eq!(draft_profile(&snapshot(&s.page).await), None);
    let frame = main_frame(&s.page).await.unwrap().expect("a frame to map");
    assert_eq!(frame, "iframe#tool_content");

    // Mapped as any page is, from inside the frame, and kept under the
    // address the teacher has open.
    let framed = Framed::new(&s.page, &frame);
    let inside = capture_snapshot(&framed, &SnapshotOptions::default())
        .await
        .unwrap();
    let mut map = draft_profile(&inside)
        .expect("heuristics propose a profile")
        .page;
    assert_eq!(map.student_section.as_deref(), Some("div[data-lastchange]"));
    map.frame = Some(frame.clone());
    let profile = SiteProfile::for_page(&top, map);
    assert!(profile.url.matches(&top));
    let adapter = ProfileAdapter::new(validated(&s.page, profile.clone()).await);

    let read = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(read.url, top, "the address is the one the teacher sees");
    assert_eq!(names(&read), ["Alice Johnson", "Bob Smith", "Carol Davis"]);
    assert!(read.submissions[1].response.contains("I factored"));
    assert_eq!(read.submissions[0].max_score(), Some(10.0));

    let write = planned(&read, 1, 7.5, "<p>Check the last step.</p>");
    let receipt = adapter.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(
        verify_writes(&adapter, &s.page, &[(write, receipt)])
            .await
            .unwrap(),
        []
    );
    // The grade is in the tool, and the school's page around it is untouched.
    let boxes = "Array.from(document.querySelectorAll('input[type=number]'), (box) => box.value)";
    assert_eq!(framed.eval(boxes).await.unwrap(), json!(["", "7.5", ""]));
    assert_eq!(
        s.page
            .eval("document.querySelector('input[name=q]').value")
            .await
            .unwrap(),
        json!("")
    );

    // With the frame gone from the page, the profile says so and reads nothing.
    s.page
        .eval("document.getElementById('tool_content').remove()")
        .await
        .unwrap();
    let gone = adapter.read_page(&s.page).await.unwrap_err();
    assert!(
        matches!(&gone, Error::Page(reason) if reason.contains("frame was not found")),
        "{gone}"
    );

    close(s).await;
}

fn find<'a>(
    node: &'a SnapshotNode,
    wanted: &dyn Fn(&SnapshotNode) -> bool,
) -> Vec<&'a SnapshotNode> {
    node.descendants()
        .into_iter()
        .filter(|n| wanted(n))
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_snapshot_is_a_bounded_outline_of_what_the_page_shows() {
    // Ported from dom-snapshot.test.ts: wrappers collapse, hidden content is
    // skipped, long lists are cut, text is clipped.
    let s = open("snapshot", "messy-wrappers.html").await;
    let taken = snapshot(&s.page).await;
    let tags: Vec<(usize, &str, &str)> = taken
        .nodes()
        .into_iter()
        .map(|(depth, n)| (depth, n.tag.as_str(), n.attr("class")))
        .collect();
    assert_eq!(
        tags[..9],
        [
            (0, "body", ""),
            (1, "div", "outer-wrapper"),
            (2, "div", "middle-wrapper"),
            (3, "div", "inner-wrapper"),
            (4, "div", "row"),
            (5, "span", "name"),
            (5, "div", "response-container"),
            (6, "p", ""),
            (5, "div", ""),
        ]
    );
    assert_eq!(taken.url, fixture_url("messy-wrappers.html"));
    assert!(!taken.stats.truncated);
    // The script and the SVG's insides are not part of the outline.
    assert!(find(&taken.root, &|n| n.tag == "script" || n.tag == "path").is_empty());
    assert_eq!(find(&taken.root, &|n| n.tag == "svg").len(), 1);

    // Every element's selector finds exactly that element again.
    let selectors: Vec<&str> = taken
        .nodes()
        .into_iter()
        .map(|(_, n)| n.selector.as_str())
        .collect();
    let resolved: Value = s
        .page
        .eval(&format!(
            "{}.map((sel) => {{ const found = document.querySelectorAll(sel); return [found.length, found[0] && found[0].localName]; }})",
            json!(selectors)
        ))
        .await
        .unwrap();
    for ((_, node), found) in taken.nodes().into_iter().zip(resolved.as_array().unwrap()) {
        assert_eq!(found, &json!([1, node.tag]), "{}", node.selector);
    }

    s.page
        .navigate(&fixture_url("hidden-content.html"))
        .await
        .unwrap();
    let taken = snapshot(&s.page).await;
    let shown: Vec<&str> = find(&taken.root, &|n| n.attr("class") == "student-name")
        .iter()
        .map(|n| n.text())
        .collect();
    assert_eq!(shown, ["Visible Student", "Off-Screen Student"]);
    assert!(taken.stats.hidden >= 4, "{:?}", taken.stats);
    assert!(find(&taken.root, &|n| n.attr("id") == "csrf-token").is_empty());

    s.page
        .navigate(&fixture_url("large-page.html"))
        .await
        .unwrap();
    let taken = snapshot(&s.page).await;
    let rows = find(&taken.root, &|n| n.attr("class") == "student-row");
    assert_eq!(rows.len(), 3, "the first three of thirty are kept");
    assert_eq!(rows[0].repeats, Some(30));
    assert_eq!(rows[1].repeats, None);
    // data-* values, which can identify a student, are not captured.
    assert_eq!(
        rows[0].attrs.get("data-lastchange").map(String::as_str),
        Some("")
    );
    let answer = find(&taken.root, &|n| n.attr("class") == "resp")[0];
    assert_eq!(answer.text().chars().count(), 60);
    assert_eq!(answer.text_len, 80);
    assert_eq!(
        find(&taken.root, &|n| n.tag == "button")[0].text(),
        "Save All"
    );
    // A row of buttons is not a list of students: none is left out.
    s.page
        .eval(
            "(() => { const bar = document.createElement('div'); \
             bar.innerHTML = '<button>Print</button><button>Export</button><button>Email</button><button>Sort</button><button>Publish</button>'; \
             document.body.prepend(bar); })()",
        )
        .await
        .unwrap();
    let with_bar = snapshot(&s.page).await;
    let labels: Vec<&str> = find(&with_bar.root, &|n| n.tag == "button")
        .iter()
        .map(|n| n.text())
        .collect();
    assert_eq!(
        labels,
        ["Print", "Export", "Email", "Sort", "Publish", "Save All"]
    );
    let outline = taken.outline();
    assert_eq!(outline.nodes, outline.total);
    assert!(outline.json.len() < 2500, "{}", outline.json.len());
    assert_eq!(detect(&taken).and_then(|d| d.students_seen), Some(30));
    // Heuristics see three rows; the profile they write holds for all thirty.
    let profile = heuristic_profile(&s.page).await;
    let adapter = ProfileAdapter::new(profile);
    let page = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(page.submissions.len(), 30);
    assert_eq!(page.submissions[29].name, "Student 30");
    assert_eq!(page.submissions[29].scores[0].field, "name:s30");
    assert_eq!(page.submissions[29].max_score(), Some(10.0));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_snapshot_leaves_out_what_was_typed_into_the_page() {
    let s = open("private", "simple-batch.html").await;
    s.page
        .eval(
            "(() => { document.getElementsByName('score_1')[0].value = '7'; \
                     document.getElementsByName('feedback_1')[0].value = 'PRIVATE-FEEDBACK'; \
                     document.querySelector('.student-row').setAttribute('data-email', 'alice@example.edu'); \
                     const a = document.createElement('a'); a.href = '/users/4242?token=SECRET'; a.textContent = 'Profile'; \
                     document.querySelector('.student-row').appendChild(a); })()",
        )
        .await
        .unwrap();
    let taken = snapshot(&s.page).await;
    let outline = taken.outline().json;
    for private in [
        "PRIVATE-FEEDBACK",
        "alice@example.edu",
        "4242",
        "SECRET",
        "\"value\"",
    ] {
        assert!(!outline.contains(private), "{private} in {outline}");
    }
    // What the outline does carry: structure, labels, and the start of visible text.
    for present in [
        "\"data-email\":\"\"",
        "Alice Johnson",
        "score_1",
        "Profile",
        "Save All Grades",
    ] {
        assert!(outline.contains(present), "{present} not in {outline}");
    }

    // Feedback already written in a rich text box is typed-in content too.
    s.page
        .navigate(&fixture_url("rich-feedback.html"))
        .await
        .unwrap();
    let taken = snapshot(&s.page).await;
    let outline = taken.outline().json;
    assert!(!outline.contains("See me"), "{outline}");
    assert!(
        outline.contains("\"contenteditable\":\"true\""),
        "{outline}"
    );
    assert!(outline.contains("Eli Park") && outline.contains("\"name\":\"fb[502]\""));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn fixtures_heuristics_cannot_map_are_left_for_the_ai() {
    // No answers are shown at all: there is nothing to grade from.
    let s = open("unmappable", "hidden-content.html").await;
    let taken = snapshot(&s.page).await;
    let found = detect(&taken).expect("it still looks like a grading page");
    assert_eq!(found.students_seen, Some(2));
    assert_eq!(found.candidates.response, None);
    assert_eq!(draft_profile(&taken), None);

    // Answers are in frames that are still empty.
    s.page
        .navigate(&fixture_url("iframe-grading.html"))
        .await
        .unwrap();
    let draft = draft_profile(&snapshot(&s.page).await).expect("drafted");
    assert_eq!(draft.page.response, "iframe[id^=\"response-frame-\"]");
    let report = validate_profile(&s.page, &draft).await.unwrap();
    assert_eq!(
        report.error_summary(),
        "student response: `iframe[id^=\"response-frame-\"]` is empty for every student"
    );
    // Once the frames hold the answers, the same profile reads them.
    s.page
        .eval("document.querySelectorAll('iframe').forEach((f, i) => { f.contentDocument.body.innerHTML = '<p>Answer number ' + (i + 1) + '</p>'; })")
        .await
        .unwrap();
    let adapter = ProfileAdapter::new(validated(&s.page, draft).await);
    let page = adapter.read_page(&s.page).await.unwrap();
    let answers: Vec<&str> = page
        .submissions
        .iter()
        .map(|s| s.response.as_str())
        .collect();
    assert_eq!(answers, ["Answer number 1", "Answer number 2"]);

    close(s).await;
}

/// A provider that plays back scripted replies and records what it was asked.
struct Scripted {
    replies: Mutex<VecDeque<Result<String, LlmError>>>,
    asked: Mutex<Vec<ChatRequest>>,
}

impl Scripted {
    fn new(replies: impl IntoIterator<Item = Result<String, LlmError>>) -> Self {
        Self {
            replies: Mutex::new(replies.into_iter().collect()),
            asked: Mutex::new(Vec::new()),
        }
    }

    fn asked(&self) -> Vec<ChatRequest> {
        self.asked.lock().unwrap().clone()
    }
}

#[async_trait]
impl ChatProvider for Scripted {
    async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
        self.asked.lock().unwrap().push(request.clone());
        self.replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("the AI was asked more often than scripted")
    }
}

fn answer(section: &str, name: &str, score: &str, feedback: &str, region: &str) -> String {
    json!({
        "navigation": { "mode": "batch", "nextButton": null, "prevButton": null, "studentIndicator": null, "submitButton": null, "waitForSelector": null },
        "selectors": { "studentSection": section, "studentName": name, "scoreInput": score, "feedbackBox": feedback, "feedbackHidden": null, "questionRegion": region, "fullCreditLink": null },
        "feedback": { "type": "unknown", "requiresHiddenSync": false, "htmlWrap": false },
        "save": { "buttonText": "Grade", "fallbackText": "Save" },
        "confidence": "medium",
        "notes": "Two submissions, each an article element."
    })
    .to_string()
}

fn ai_only() -> DiscoverOptions {
    DiscoverOptions {
        skip_heuristics: true,
        ..DiscoverOptions::default()
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn discovery_tells_the_ai_which_selectors_failed_and_asks_again() {
    let s = open("discover", "unknown-lms.html").await;
    let right = answer(
        "article.submission",
        ".submitter",
        "input.pts-input",
        "textarea.comments",
        ".sub-body",
    );
    let provider = Scripted::new([
        // Plausible, but the name is misspelt and "input" is not inside ".points".
        Ok(format!(
            "<think>Articles repeat.</think>\n```json\n{}\n```",
            answer(
                "article.submission",
                ".submiter",
                ".points input",
                "textarea",
                ".sub-body p, .sub-header *"
            )
        )),
        Ok(right),
    ]);

    let found = discover(&s.page, &provider, &ai_only()).await.unwrap();
    assert_eq!(
        found.source,
        DiscoverySource::Ai {
            attempts: 2,
            confidence: Some("medium".into())
        }
    );
    assert_eq!(
        found.profile.profile().page,
        PageMap {
            student_section: Some("article.submission".into()),
            student_name: ".submitter".into(),
            score_input: "input.pts-input".into(),
            // Not asked of the AI: found on the page by the usual "/ 25".
            max_score: Some(MaxScoreRule::usual()),
            // The AI said "unknown"; the page shows a plain text box.
            feedback: textarea("textarea.comments"),
            response: ".sub-body".into(),
            prompt: None,
            // "Grade" is on every submission and nothing is labelled "Save".
            save: None,
            frame: None,
            next_student: None,
            previous_student: None,
        }
    );
    assert_eq!(found.report.students, 2);
    assert_eq!(found.report.samples[1].max, Some(25.0));
    assert_eq!(
        found.notes,
        [
            "The page's save button could not be identified, so none is mapped.",
            "The AI noted: Two submissions, each an article element.",
        ]
    );

    let asked = provider.asked();
    assert_eq!(asked.len(), 2);
    assert_eq!(asked[0].messages.len(), 2);
    assert!(asked[0].json);
    assert!(
        asked[0].messages[1]
            .text
            .contains("\"class\":\"pts-input\"")
    );
    assert!(
        asked[0].messages[1]
            .text
            .contains("Page URL: file:///unknown-lms.html\n")
    );

    // The second request is the first, the rejected answer, and what was wrong with it.
    let second = &asked[1].messages;
    assert_eq!(second.len(), 4);
    assert_eq!(second[..2], asked[0].messages[..]);
    assert_eq!(second[2].role, Role::Assistant);
    assert!(second[2].text.contains(".submiter"));
    assert_eq!(second[3].role, Role::User);
    assert_eq!(
        second[3].text,
        "The selectors in your answer were tried on the live page and did not all work:\n\
         - selectors.studentName: `.submiter` matches nothing inside any student section\n\
         - selectors.scoreInput: `.points input` matches nothing inside any student section\n\
         - selectors.questionRegion: `.sub-body p, .sub-header *` matches several elements for every student; it has to match exactly one\n\
         selectors.studentSection matched 2 student sections. The other selectors are looked up inside each of them with section.querySelectorAll(selector).\n\
         Selectors that are not listed worked.\n\
         \n\
         Correct it and answer again with the complete JSON object only."
    );

    // The profile it found drives the page.
    let adapter = ProfileAdapter::new(found.profile);
    let page = adapter.read_page(&s.page).await.unwrap();
    assert_eq!(names(&page), ["Emily Wilson", "Frank Martinez"]);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn discovery_gives_up_after_three_answers_and_says_why_each_failed() {
    let s = open("discover-fail", "unknown-lms.html").await;
    let provider = Scripted::new([
        Ok("I cannot see a page.".to_owned()),
        Err(LlmError::EmptyReply(ProviderKind::Ollama)),
        Ok(answer("div.student", ".name", "input", "textarea", ".work")),
    ]);
    let err = discover(&s.page, &provider, &ai_only()).await.unwrap_err();
    let DiscoveryError::Failed { attempts } = &err else {
        panic!("{err:?}");
    };
    assert_eq!(
        attempts,
        &[
            "Attempt 1: Your answer could not be used: Could not parse AI discovery response as JSON.",
            "Attempt 2: ollama returned an empty reply",
            "Attempt 3: The selectors in your answer were tried on the live page and did not all work:\n\
             - selectors.studentSection: `div.student` matches nothing on the page\n\
             Selectors that are not listed worked.",
        ]
    );
    assert!(
        err.to_string()
            .starts_with("Discovery failed after 3 attempts:\nAttempt 1: ")
    );

    let asked = provider.asked();
    assert_eq!(asked.len(), 3);
    assert!(
        asked[1].messages[3]
            .text
            .starts_with("Your answer could not be used")
    );
    // After a reply that never arrived there is nothing to correct: the question is put again.
    assert_eq!(asked[2], asked[0]);

    // An error that asking again cannot fix ends discovery at once.
    let locked_out = Scripted::new([Err(LlmError::Http {
        provider: ProviderKind::OpenAi,
        status: 401,
        body: "bad key".into(),
    })]);
    let err = discover(&s.page, &locked_out, &ai_only())
        .await
        .unwrap_err();
    assert!(
        matches!(&err, DiscoveryError::Ai(LlmError::Http { status: 401, .. })),
        "{err:?}"
    );
    assert_eq!(locked_out.asked().len(), 1);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn discovery_asks_no_ai_when_the_structure_is_conclusive() {
    let s = open("discover-heuristic", "batch-grading-complex.html").await;
    let nobody = Scripted::new([]);
    let found = discover(&s.page, &nobody, &DiscoverOptions::default())
        .await
        .unwrap();
    let DiscoverySource::Heuristics {
        pattern,
        confidence,
    } = &found.source
    else {
        panic!("{:?}", found.source);
    };
    assert_eq!(
        pattern,
        "Batch grading (repeating-rows, score-input, name-candidate, save-button)"
    );
    assert!((confidence - 1.0).abs() < 1e-9);
    assert_eq!(
        found.profile.profile().page.student_section.as_deref(),
        Some("tr[data-lastchange]")
    );
    assert_eq!(found.report.students, 3);
    assert!(found.notes.is_empty(), "{:?}", found.notes);
    assert!(nobody.asked().is_empty());

    // One student at a time is never conclusive: the AI is asked, and here answers well.
    s.page
        .navigate(&fixture_url("sequential-grading.html"))
        .await
        .unwrap();
    let reply = json!({
        "navigation": { "mode": "sequential", "nextButton": "#next-student", "prevButton": "#prev-student", "studentIndicator": "h2", "submitButton": "button[type=submit]", "waitForSelector": "h2" },
        "selectors": { "studentSection": null, "studentName": "#grading-app h2", "scoreInput": "#score-input", "feedbackBox": "#feedback-input", "feedbackHidden": null, "questionRegion": ".response-text", "fullCreditLink": null },
        "feedback": { "type": "textarea", "requiresHiddenSync": false, "htmlWrap": false },
        "save": { "buttonText": "Save & Next" },
        "confidence": "high"
    })
    .to_string();
    let provider = Scripted::new([Ok(reply)]);
    let found = discover(&s.page, &provider, &DiscoverOptions::default())
        .await
        .unwrap();
    assert_eq!(
        found.source,
        DiscoverySource::Ai {
            attempts: 1,
            confidence: Some("high".into())
        }
    );
    let page = &found.profile.profile().page;
    assert_eq!(page.student_section, None);
    assert_eq!(page.max_score, Some(MaxScoreRule::usual()));
    assert_eq!(found.report.samples[0].max, Some(15.0));
    assert_eq!(
        page.save.as_ref().map(|save| &save.button),
        Some(&ButtonRule::Text {
            text: "Save & Next".into()
        })
    );

    close(s).await;
}

/// Against a real model on this machine. What it answers is printed, so that
/// a run shows what the model made of the page, pass or fail:
///     cargo test -p ogre-harness -- --ignored live_ollama --nocapture
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed and Ollama on localhost:11434"]
async fn live_ollama_maps_the_unknown_lms_fixture() {
    use ogre_llm::{HttpProvider, ProviderConfig, ProviderOptions};

    /// Passes requests through and prints both sides of the conversation.
    struct Logged(HttpProvider);

    #[async_trait]
    impl ChatProvider for Logged {
        async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
            let last = request.messages.last().map_or("", |m| m.text.as_str());
            println!(
                "--- request {} messages, {} chars; last message:\n{last}\n",
                request.messages.len(),
                request.messages.iter().map(|m| m.text.len()).sum::<usize>()
            );
            let reply = self.0.chat(request).await;
            println!("--- reply:\n{reply:?}\n");
            reply
        }
    }

    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "gemma4:31b".to_owned());
    let http = HttpProvider::new(
        ProviderConfig::new(ProviderKind::Ollama, model.clone()).with_options(ProviderOptions {
            temperature: Some(0.0),
            ..ProviderOptions::default()
        }),
    )
    .expect("client builds");
    let models = http.list_models().await.expect("Ollama is reachable");
    assert!(models.contains(&model), "{model} is not pulled: {models:?}");

    let s = open("live", "unknown-lms.html").await;
    let started = std::time::Instant::now();
    let outcome = discover(&s.page, &Logged(http), &ai_only()).await;
    println!("--- {model} took {:.1?}", started.elapsed());

    let result = match &outcome {
        Ok(found) => {
            println!(
                "--- validated profile from {:?}:\n{}\n--- notes: {:?}",
                found.source,
                found.profile.profile().to_json(),
                found.notes
            );
            let adapter = ProfileAdapter::new(found.profile.clone());
            let page = adapter.read_page(&s.page).await.unwrap();
            println!("--- read: {:?}", names(&page));
            assert_eq!(names(&page), ["Emily Wilson", "Frank Martinez"]);
            assert!(page.submissions[0].response.contains("French Revolution"));
            assert_eq!(page.submissions[0].scores.len(), 1);
            Ok(())
        }
        Err(error) => Err(format!(
            "{model} did not produce a profile that validates:\n{error}"
        )),
    };
    close(s).await;
    if let Err(message) = result {
        panic!("{message}");
    }
}

/// What heuristics alone make of every fixture, the desktop app's demo pages
/// included. Prints one line per page:
///     cargo test -p ogre-harness -- --ignored survey --nocapture
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn survey_of_heuristics_on_every_fixture() {
    let demo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../demo");
    let mut pages: Vec<(String, String)> = [
        "simple-batch.html",
        "batch-grading-complex.html",
        "messy-wrappers.html",
        "unknown-lms.html",
        "large-page.html",
        "rich-feedback.html",
        "sequential-grading.html",
        "iframe-grading.html",
        "hidden-content.html",
    ]
    .iter()
    .map(|name| (name.to_string(), fixture_url(name)))
    .collect();
    if let Ok(entries) = std::fs::read_dir(&demo) {
        let mut found: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|path| path.extension().is_some_and(|ext| ext == "html"))
            .filter_map(|path| path.canonicalize().ok())
            .collect();
        found.sort();
        for path in found {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            pages.push((format!("demo/{name}"), format!("file://{}", path.display())));
        }
    }

    let s = open("survey", "simple-batch.html").await;
    let mut valid = Vec::new();
    for (name, url) in &pages {
        s.page.navigate(url).await.unwrap();
        let taken = snapshot(&s.page).await;
        let outline = taken.outline();
        let Some(found) = detect(&taken) else {
            println!("{name}: not recognized as a grading page");
            continue;
        };
        let head = format!(
            "{name}: {} at {:.1}, {} of {} outline nodes in {} chars",
            found.pattern_name,
            found.confidence,
            outline.nodes,
            outline.total,
            outline.json.len()
        );
        let Some(map) = found.page_map() else {
            println!("{head}\n    no draft: candidates {:?}", found.candidates);
            continue;
        };
        let report = validate_profile(&s.page, &SiteProfile::for_page(url, map))
            .await
            .unwrap();
        let count_ok = found.students_seen.is_none_or(|n| n == report.students);
        if report.passed() && count_ok {
            valid.push(name.as_str());
            println!(
                "{head}\n    VALID for {} students; first: {:?}",
                report.students,
                report.samples.first()
            );
        } else {
            println!(
                "{head}\n    INVALID ({} students read, {:?} seen):\n    {}\n    {:?}",
                report.students,
                found.students_seen,
                report.error_summary().replace('\n', "\n    "),
                report.profile().page
            );
        }
    }
    close(s).await;

    for expected in [
        "simple-batch.html",
        "batch-grading-complex.html",
        "messy-wrappers.html",
        "unknown-lms.html",
        "large-page.html",
        "rich-feedback.html",
        "sequential-grading.html",
    ] {
        assert!(valid.contains(&expected), "{expected} is not in {valid:?}");
    }
    for unmappable in ["iframe-grading.html", "hidden-content.html"] {
        assert!(!valid.contains(&unmappable), "{unmappable} is in {valid:?}");
    }
}

/// Points at the element `selector` finds, the way a teacher would, while
/// the page waits to be told what to pick. Gives the selector the page
/// worked out.
async fn point_at(page: &CdpPage, what: PickFor, selector: &str) -> Option<String> {
    let middle = format!(
        "(() => {{ const el = document.querySelector({}); el.scrollIntoView({{block: 'center'}}); \
         const box = el.getBoundingClientRect(); \
         return [box.left + box.width / 2, box.top + box.height / 2]; }})()",
        json!(selector)
    );
    let at: (f64, f64) = serde_json::from_value(page.eval(&middle).await.unwrap()).unwrap();
    let picking = pick_element(page, &what);
    let clicking = async {
        // Once the page is listening.
        tokio::time::sleep(Duration::from_millis(400)).await;
        page.click_at(at.0, at.1).await.unwrap();
    };
    let (picked, ()) = tokio::join!(picking, clicking);
    picked.unwrap()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_mapping_is_put_together_by_pointing_at_the_page() {
    let session = open("pick", "simple-batch.html").await;
    let page = &session.page;

    // The block that repeats once per student, from anything inside one.
    let section = point_at(page, PickFor::StudentSection, "span.student-name")
        .await
        .expect("a student's block is found around the name");
    assert_eq!(section, "div.student-row");

    // Things inside it, each as a selector that holds for every student:
    // pointed at in the second student's block, with nothing of that
    // student's own in the selector.
    let inside = PickFor::InsideSection(Some(section.clone()));
    let second = |what: &str| format!("div.student-row:nth-of-type(2) {what}");
    let name = point_at(page, inside.clone(), &second(".student-name"))
        .await
        .unwrap();
    let score = point_at(page, inside.clone(), &second("input.score-input"))
        .await
        .unwrap();
    let response = point_at(page, inside.clone(), &second(".response-body"))
        .await
        .unwrap();
    let feedback = point_at(page, inside.clone(), &second("textarea"))
        .await
        .unwrap();
    assert_eq!(name, "span.student-name");
    assert_eq!(score, "input.score-input");
    assert_eq!(feedback, "textarea.feedback-input");

    // The click that picked did not reach the page: the box was not focused.
    let focused = page.eval("document.activeElement.localName").await.unwrap();
    assert_ne!(focused, json!("textarea"));

    // What was pointed at reads the page.
    let profile = SiteProfile::for_page(
        &page.url().await.unwrap(),
        PageMap {
            student_section: Some(section),
            student_name: name,
            score_input: score,
            max_score: Some(MaxScoreRule::usual()),
            feedback: Some(FeedbackBox {
                selector: feedback,
                kind: FeedbackKind::Textarea,
                hidden_field: None,
            }),
            response,
            prompt: None,
            save: None,
            frame: None,
            next_student: None,
            previous_student: None,
        },
    );
    let report = validate_profile(page, &profile).await.unwrap();
    assert!(report.passed(), "{}", report.error_summary());
    assert_eq!(report.students, 3);
    assert_eq!(report.samples[1].name, "Bob Smith");

    // The page's one save button, and something that is in no student's block.
    let save = point_at(page, PickFor::WholePage, "#save-all")
        .await
        .unwrap();
    assert_eq!(save, "#save-all");
    let outside = point_at(page, inside, "h1").await;
    assert_eq!(outside, None, "the heading belongs to no student");
    close(session).await;
}
