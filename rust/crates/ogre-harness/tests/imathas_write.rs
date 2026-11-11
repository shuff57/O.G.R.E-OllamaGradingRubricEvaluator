//! Reads the rubric, writes grades, verifies and saves, in a real headless Chrome.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness -- --ignored

use std::path::{Path, PathBuf};

use ogre_core::{GradeWrite, GradingPage, WritePolicy, plan_write};
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_harness::sites::imathas::{self, IMathAs};
use ogre_harness::sites::{SiteAdapter, verify_writes};
use ogre_harness::{Error, PageDriver};
use serde_json::{Value, json};

struct Session {
    chrome: Chrome,
    profile_dir: PathBuf,
    page: CdpPage,
}

async fn open(test: &str, fixture: &str) -> Session {
    let profile_dir = std::env::temp_dir().join(format!("ogre-test-{test}-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(fixture)
        .canonicalize()
        .expect("fixture exists");
    let page = chrome
        .open(&format!("file://{}", path.display()))
        .await
        .unwrap();
    Session {
        chrome,
        profile_dir,
        page,
    }
}

async fn close(session: Session) {
    session.chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(session.profile_dir);
}

const NO_OVERWRITE: WritePolicy = WritePolicy {
    overwrite_scores: false,
    replace_feedback: false,
};

fn planned(page: &GradingPage, index: usize, score: f64, feedback: &str) -> GradeWrite {
    plan_write(&page.submissions[index], score, feedback, NO_OVERWRITE).expect("write is allowed")
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reads_the_rubric_from_a_student_copy_of_the_question() {
    let s = open("rubric", "imathas-gradeallq2.html").await;

    // The first student's question has only a checklist.
    let rubric = IMathAs.read_rubric(&s.page).await.unwrap();
    assert_eq!(rubric.max_score_value(), 10.0);
    assert_eq!(
        rubric.essay_prompt.as_deref(),
        Some(
            "A sample of 40 students has a mean of 72. Explain how sample size affects the margin of error."
        )
    );
    assert_eq!(rubric.checklist_items.len(), 1);
    assert_eq!(
        rubric.checklist_items[0].category.as_deref(),
        Some("Concept")
    );
    assert_eq!(rubric.checklist_items[0].items, ["Mentions standard error"]);
    assert!(rubric.rubric_items.is_empty());
    assert_eq!(rubric.model_text, None);

    // The third student's has a checklist, rubric targets and a model response.
    let rubric = imathas::read_rubric_from(&s.page, 2).await.unwrap();
    assert_eq!(
        rubric.essay_prompt.as_deref(),
        Some("State the Central Limit Theorem in your own words.")
    );
    let checklist: Vec<_> = rubric
        .checklist_items
        .iter()
        .map(|c| (c.category.as_deref().unwrap(), c.items.len()))
        .collect();
    assert_eq!(checklist, [("Concept", 2), ("Communication", 1)]);
    assert_eq!(rubric.rubric_items.len(), 2);
    assert_eq!(
        rubric.rubric_items[0].items,
        [
            "Sampling distribution of the mean",
            "Normal shape for large n"
        ]
    );
    assert_eq!(
        rubric.model_text.as_deref(),
        Some("For large samples, the distribution of sample means is approximately normal.")
    );
    assert_eq!(rubric.max_score_value(), 10.0);

    let err = imathas::read_rubric_from(&s.page, 99).await.unwrap_err();
    assert!(matches!(err, Error::Page(_)), "{err:?}");

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn writes_verifies_and_saves_through_the_rich_text_editor() {
    let s = open("write-rich", "imathas-gradeallq2.html").await;
    let before = IMathAs.read_page(&s.page).await.unwrap();

    // Kai (index 1) has 0 points and no feedback. The feedback carries an attack.
    let hostile = "<p onclick=\"steal()\">Good start, <strong>Kai</strong>.</p>\
                   <script>window.__pwned = true</script><img src=x onerror=\"window.__pwned = true\">";
    let write = planned(&before, 1, 7.5, hostile);
    let receipt = IMathAs.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.score, "7.5");
    assert_eq!(receipt.feedback_text.as_deref(), Some("Good start, Kai."));

    // Nothing hostile reached the page.
    let state = s
        .page
        .eval(
            "({ pwned: window.__pwned === true, \
               box: document.getElementById('fb-0-2-1002').innerHTML, \
               hidden: document.getElementsByName('fb-0-2-1002')[0].value, \
               posted: window.__posted.length })",
        )
        .await
        .unwrap();
    assert_eq!(state["pwned"], false);
    assert_eq!(state["box"], "<p>Good start, <strong>Kai</strong>.</p>");
    assert_eq!(state["hidden"], "<p>Good start, <strong>Kai</strong>.</p>");
    assert_eq!(state["posted"], 0, "writing must not save");

    // A fresh read shows the write, and nobody else changed.
    let written = vec![(write, receipt)];
    assert_eq!(
        verify_writes(&IMathAs, &s.page, &written).await.unwrap(),
        []
    );
    let after = IMathAs.read_page(&s.page).await.unwrap();
    assert_eq!(after.submissions[1].score(), Some(7.5));
    assert_eq!(
        after.submissions[1].feedback.as_ref().unwrap().text,
        "Good start, Kai."
    );
    for i in [0, 2, 3, 4] {
        assert_eq!(
            after.submissions[i], before.submissions[i],
            "student {i} changed"
        );
    }

    // Verification notices a value that did not stick.
    s.page
        .eval("document.getElementsByName('ud-1002-0-2-0')[0].value = '2'")
        .await
        .unwrap();
    let problems = verify_writes(&IMathAs, &s.page, &written).await.unwrap();
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].name, "Brook, Kai");
    assert_eq!(
        problems[0].problem,
        "score should be 7.5 but the page shows 2"
    );
    s.page
        .eval("document.getElementsByName('ud-1002-0-2-0')[0].value = '7.5'")
        .await
        .unwrap();

    // Saving posts the form once, with the new score and feedback in it.
    IMathAs.save(&s.page).await.unwrap();
    let posted: Value = s.page.eval("window.__posted").await.unwrap();
    assert_eq!(posted.as_array().unwrap().len(), 1);
    assert_eq!(posted[0]["ud-1002-0-2-0"], "7.5");
    assert_eq!(
        posted[0]["fb-0-2-1002"],
        "<p>Good start, <strong>Kai</strong>.</p>"
    );
    assert_eq!(
        posted[0]["ud-1001-0-2-0"], "10",
        "other students are posted unchanged"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn refuses_to_write_over_a_score_that_changed_since_it_was_read() {
    let s = open("write-race", "imathas-gradeallq2.html").await;
    let before = IMathAs.read_page(&s.page).await.unwrap();
    let write = planned(&before, 1, 7.0, "<p>Good start.</p>");

    // The teacher types a score while the AI is still grading.
    s.page
        .eval("document.getElementsByName('ud-1002-0-2-0')[0].value = '9'")
        .await
        .unwrap();

    let err = IMathAs.write_grade(&s.page, &write).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("Brook, Kai") && m.contains("changed on the page")),
        "{err:?}"
    );
    let after = IMathAs.read_page(&s.page).await.unwrap();
    assert_eq!(after.submissions[1].score(), Some(9.0));
    assert!(
        !after.submissions[1].has_feedback(),
        "no feedback was written either"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reports_a_save_the_site_rejects() {
    let s = open("save-fails", "imathas-gradeallq2.html").await;
    s.page
        .eval("window.__failSave = 'Error: session expired'")
        .await
        .unwrap();

    let err = IMathAs.save(&s.page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("session expired")),
        "{err:?}"
    );
    assert_eq!(
        s.page.eval("window.__posted.length").await.unwrap(),
        json!(0)
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn writes_plain_text_feedback_into_a_textarea() {
    let s = open("write-plain", "imathas-gradeallq2-plain-feedback.html").await;
    let before = IMathAs.read_page(&s.page).await.unwrap();

    // Pat already has 4 points and feedback: nothing may be written by default.
    assert!(plan_write(&before.submissions[0], 5.0, "<p>x</p>", NO_OVERWRITE).is_err());

    let allowed = WritePolicy {
        overwrite_scores: true,
        replace_feedback: true,
    };
    let write = plan_write(
        &before.submissions[0],
        5.0,
        "<p>Clear <em>and</em> correct.</p><p>Next: name the outlier.</p>",
        allowed,
    )
    .unwrap();
    let receipt = IMathAs.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(
        receipt.feedback_text.as_deref(),
        Some("Clear and correct.\n\nNext: name the outlier.")
    );

    let written = vec![(write, receipt)];
    assert_eq!(
        verify_writes(&IMathAs, &s.page, &written).await.unwrap(),
        []
    );

    IMathAs.save(&s.page).await.unwrap();
    let posted: Value = s.page.eval("window.__posted").await.unwrap();
    assert_eq!(posted[0]["ud-2001-0-0-0"], "5");
    assert_eq!(
        posted[0]["fb-0-2001"],
        "Clear and correct.\n\nNext: name the outlier."
    );

    close(s).await;
}
