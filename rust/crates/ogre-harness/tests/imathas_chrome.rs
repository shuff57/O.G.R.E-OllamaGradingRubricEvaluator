//! Runs the IMathAS adapter in a real headless Chrome against saved pages.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness -- --ignored

use std::path::{Path, PathBuf};

use ogre_core::{FeedbackKind, Position};
use ogre_harness::cdp::{Chrome, LaunchOptions};
use ogre_harness::sites::SiteAdapter;
use ogre_harness::sites::imathas::IMathAs;
use ogre_harness::{Error, PageDriver};

fn fixture_url(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
        .canonicalize()
        .expect("fixture exists");
    format!("file://{}", path.display())
}

async fn chrome(test: &str) -> (Chrome, PathBuf) {
    let profile_dir = std::env::temp_dir().join(format!("ogre-test-{test}-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    (chrome, profile_dir)
}

async fn finish(chrome: Chrome, profile_dir: PathBuf) {
    chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(profile_dir);
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reads_every_student_from_a_grade_all_page() {
    let (chrome, profile_dir) = chrome("grade-all").await;
    let page = chrome
        .open(&fixture_url("imathas-gradeallq2.html"))
        .await
        .unwrap();

    let read = IMathAs.read_page(&page).await.unwrap();

    assert_eq!(read.title, "Grade all questions - fixture");
    assert_eq!(
        read.position,
        Some(Position {
            current: 2,
            total: 2
        })
    );
    let names: Vec<_> = read.submissions.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "Avery, Sam",
            "Brook, Kai",
            "Cruz, Jo",
            "Diaz, Remy",
            "Evans, Lee"
        ]
    );

    // Graded, with feedback already written.
    let sam = &read.submissions[0];
    assert_eq!(sam.student_id.as_deref(), Some("1001"));
    assert_eq!(sam.scores.len(), 1);
    assert_eq!(sam.scores[0].field, "ud-1001-0-2-0");
    assert_eq!(sam.scores[0].label, "Score");
    assert_eq!((sam.score(), sam.max_score()), (Some(10.0), Some(10.0)));
    assert!(sam.has_nonzero_score());
    let feedback = sam.feedback.as_ref().unwrap();
    assert_eq!(feedback.field, "fb-0-2-1001");
    assert_eq!(feedback.kind, FeedbackKind::RichText);
    assert_eq!(feedback.text, "Nice work, Sam.");
    assert_eq!(
        sam.response,
        "Larger samples shrink the **standard error**, so the margin of error gets smaller."
    );
    // The collapsed grading checklist is not part of the prompt.
    assert_eq!(
        sam.prompt.as_deref(),
        Some(
            "A sample of 40 students has a mean of 72. Explain how sample size affects the margin of error."
        )
    );

    // Ungraded; a rubric block sits between the prompt and the answer.
    let kai = &read.submissions[1];
    assert_eq!(kai.score(), Some(0.0));
    assert!(!kai.has_nonzero_score());
    assert!(!kai.has_feedback());
    assert_eq!(
        kai.response,
        "If you ask more people the answer is closer to the real one."
    );
    assert!(kai.prompt.as_deref().unwrap().contains("55 students"));

    // Two score boxes, one not applicable.
    let jo = &read.submissions[2];
    let labels: Vec<_> = jo.scores.iter().map(|s| s.label.as_str()).collect();
    assert_eq!(labels, ["Score for part 1", "Score for part 2"]);
    assert_eq!(jo.scores[1].raw, "N/A");
    assert_eq!(jo.scores[1].field, "ud-1003-0-2-1");
    assert_eq!((jo.score(), jo.max_score()), (Some(3.5), Some(10.0)));
    assert_eq!(jo.response, "Sample means look normal when n is big.");
    assert_eq!(
        jo.prompt.as_deref(),
        Some("State the Central Limit Theorem in your own words.")
    );

    // Blank score; rendered math becomes its spoken text.
    let remy = &read.submissions[3];
    assert_eq!(remy.score(), None);
    assert_eq!(remy.max_score(), Some(10.0));
    assert!(
        remy.prompt
            .as_deref()
            .unwrap()
            .contains("y hat equals 30 plus 9 x")
    );
    assert!(
        remy.response.contains("The slope is 9"),
        "{}",
        remy.response
    );

    // An auto-graded answer is not an essay: scores are read, text is not guessed at.
    let lee = &read.submissions[4];
    assert_eq!((lee.score(), lee.max_score()), (Some(1.0), Some(1.0)));
    assert_eq!(lee.response, "");
    assert_eq!(lee.prompt, None);

    finish(chrome, profile_dir).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reads_plain_textarea_feedback_and_the_older_name_layout() {
    let (chrome, profile_dir) = chrome("plain-feedback").await;
    let page = chrome
        .open(&fixture_url("imathas-gradeallq2-plain-feedback.html"))
        .await
        .unwrap();

    let read = IMathAs.read_page(&page).await.unwrap();

    assert_eq!(read.position, None);
    assert_eq!(read.submissions.len(), 1);
    let pat = &read.submissions[0];
    assert_eq!(pat.name, "Ellis, Pat");
    assert_eq!(pat.student_id.as_deref(), Some("2001"));
    assert_eq!((pat.score(), pat.max_score()), (Some(4.0), Some(5.0)));
    let feedback = pat.feedback.as_ref().unwrap();
    assert_eq!(feedback.kind, FeedbackKind::Textarea);
    assert_eq!(feedback.field, "fb-0-0-2001");
    assert_eq!(feedback.text, "Good idea, say why.");
    assert_eq!(pat.response, "One huge value drags the mean toward it.");

    finish(chrome, profile_dir).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_page_with_no_students_is_an_error_and_script_errors_surface() {
    let (chrome, profile_dir) = chrome("errors").await;
    let page = chrome.open("about:blank").await.unwrap();

    let err = IMathAs.read_page(&page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("No student work found")),
        "{err:?}"
    );

    // A sign-in form where the students should be is named for what it is.
    page.eval(
        "document.body.innerHTML = '<form><input name=\"u\"><input type=\"password\"></form>'",
    )
    .await
    .unwrap();
    let err = IMathAs.read_page(&page).await.unwrap_err();
    assert!(
        matches!(&err, Error::Page(m) if m.contains("MyOpenMath is asking you to sign in")),
        "{err:?}"
    );

    let err = page
        .eval("(() => { throw new Error('boom') })()")
        .await
        .unwrap_err();
    assert!(
        matches!(&err, Error::Script(m) if m.contains("boom")),
        "{err:?}"
    );

    assert_eq!(
        page.eval("undefined").await.unwrap(),
        serde_json::Value::Null
    );
    assert_eq!(page.eval("Promise.resolve(1 + 2)").await.unwrap(), 3);

    page.navigate(&fixture_url("imathas-gradeallq2-plain-feedback.html"))
        .await
        .unwrap();
    assert!(page.url().await.unwrap().ends_with("plain-feedback.html"));

    finish(chrome, profile_dir).await;
}

/// The teacher opens and navigates tabs by hand; OGRE has to see those too.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn sees_tabs_it_did_not_open_and_where_they_navigate() {
    use ogre_harness::InputDriver;

    let (chrome, profile_dir) = chrome("tabs").await;
    let first = fixture_url("imathas-gradeallq2.html");
    let second = fixture_url("imathas-gradeallq2-plain-feedback.html");
    let page = chrome.open(&first).await.unwrap();

    // A real click on a link that opens a new tab stands in for the teacher:
    // the tab it opens is not one OGRE asked for.
    let spot = page
        .eval(&format!(
            "(() => {{ const a = document.createElement('a'); a.href = {second:?}; a.target = '_blank'; \
               a.textContent = 'open'; a.style.cssText = 'position:fixed;left:0;top:0;padding:20px;z-index:99999;background:white'; \
               document.body.append(a); const r = a.getBoundingClientRect(); \
               return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()"
        ))
        .await
        .unwrap();
    page.click_at(spot["x"].as_f64().unwrap(), spot["y"].as_f64().unwrap())
        .await
        .unwrap();

    let find = async |url: &str, not: Option<&str>| {
        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let mut at_url = Vec::new();
            for candidate in chrome.pages().await.unwrap() {
                if candidate.url().await.unwrap() == url {
                    at_url.push(candidate);
                }
            }
            // `not` is how many tabs were already there before the change.
            let needed = if not.is_some() { 2 } else { 1 };
            if at_url.len() >= needed {
                return at_url;
            }
        }
        Vec::new()
    };

    let opened = find(&second, None).await;
    assert_eq!(opened.len(), 1, "OGRE sees the tab the click opened");
    let teachers_tab = &opened[0];
    assert_eq!(
        IMathAs.read_page(teachers_tab).await.unwrap().submissions[0].name,
        "Ellis, Pat"
    );

    // The teacher's tab moves on by itself; OGRE sees where it went.
    teachers_tab
        .eval(&format!("location.href = {first:?}"))
        .await
        .unwrap();
    let at_first = find(&first, Some(&first)).await;
    assert_eq!(at_first.len(), 2, "both tabs now show the first page");

    finish(chrome, profile_dir).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn real_clicks_and_keys_reach_the_page() {
    use ogre_harness::InputDriver;

    let (chrome, profile_dir) = chrome("input").await;
    let page = chrome
        .open(&fixture_url("imathas-gradeallq2-plain-feedback.html"))
        .await
        .unwrap();

    // Click the score box where it is on screen, then type like a person would.
    let spot = page
        .eval(
            "(() => { const r = document.getElementById('scorebox0').getBoundingClientRect(); \
               return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()",
        )
        .await
        .unwrap();
    page.click_at(spot["x"].as_f64().unwrap(), spot["y"].as_f64().unwrap())
        .await
        .unwrap();
    assert_eq!(
        page.eval("document.activeElement.id").await.unwrap(),
        "scorebox0"
    );

    page.eval("document.activeElement.select()").await.unwrap();
    page.insert_text("3.5").await.unwrap();
    assert_eq!(
        page.eval("document.getElementById('scorebox0').value")
            .await
            .unwrap(),
        "3.5"
    );

    // The page sees the events as coming from the user.
    page.eval(
        "window.__trusted = null; \
         document.addEventListener('keydown', (e) => { window.__trusted = [e.key, e.isTrusted]; })",
    )
    .await
    .unwrap();
    page.press_key("Tab").await.unwrap();
    assert_eq!(
        page.eval("window.__trusted").await.unwrap(),
        serde_json::json!(["Tab", true])
    );

    let png = page.screenshot_png().await.unwrap();
    assert!(png.starts_with(b"\x89PNG"), "a PNG image");

    finish(chrome, profile_dir).await;
}
