//! The list of an assignment's questions, read by MyOpenMath's adapter from
//! the Item Analysis page that a grading page links to.
//!
//! Needs Chrome: cargo test -p ogre-harness --test imathas_questions -- --ignored

use axum::Router;
use axum::response::Html;
use axum::routing::get;
use ogre_harness::cdp::{Chrome, LaunchOptions};
use ogre_harness::sites::SiteAdapter;
use ogre_harness::sites::imathas::IMathAs;

/// A grading page reduced to what the question list is found from.
const GRADING_PAGE: &str = r#"<!doctype html><title>Grading a Question</title>
<div class="breadcrumb"><a href="gradebook.php?stu=0&amp;cid=1">Gradebook</a> &gt;
<a href="gb-itemanalysis2.php?stu=0&amp;cid=1&amp;aid=2">Item Analysis</a></div>
<h1>Grading Question 2 in Unit 4 FRQ</h1>"#;

const ITEM_ANALYSIS: &str = r#"<!doctype html><title>Gradebook</title>
<table><thead><tr><th>#</th><th>Question</th><th>Grade</th><th>Average Score</th></tr></thead>
<tbody>
<tr><td>1</td><td>Build the   table</td><td><a href="gradeallq2.php?stu=0&amp;cid=1&amp;asid=average&amp;aid=2&amp;qid=101">Grade</a></td><td>99%</td></tr>
<tr><td>2</td><td>Explain the margin of error</td><td><a href="gradeallq2.php?stu=0&amp;cid=1&amp;asid=average&amp;aid=2&amp;qid=102">Grade</a></td><td>71%</td></tr>
<tr><td>3</td><td>Interpret the interval</td><td><a href="gradeallq2.php?stu=0&amp;cid=1&amp;asid=average&amp;aid=2&amp;qid=103">Grade</a></td><td>64%</td></tr>
</tbody></table>"#;

async fn site() -> String {
    let app = Router::new()
        .route(
            "/course/gradeallq2.php",
            get(|| async { Html(GRADING_PAGE) }),
        )
        .route(
            "/course/gb-itemanalysis2.php",
            get(|| async { Html(ITEM_ANALYSIS) }),
        )
        .route(
            "/alone/gradeallq2.php",
            get(|| async { Html("<!doctype html><title>Grading a Question</title>") }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    format!("http://{address}")
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn lists_the_assignments_questions_and_marks_the_open_one() {
    let profile_dir =
        std::env::temp_dir().join(format!("ogre-test-questions-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&profile_dir);
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let site = site().await;

    let page = chrome
        .open(&format!(
            "{site}/course/gradeallq2.php?stu=0&cid=1&asid=average&aid=2&qid=102"
        ))
        .await
        .unwrap();
    let questions = IMathAs.questions(&page).await.unwrap();
    let listed: Vec<_> = questions
        .iter()
        .map(|q| (q.number.as_str(), q.title.as_str(), q.current))
        .collect();
    assert_eq!(
        listed,
        [
            ("1", "Build the table", false),
            ("2", "Explain the margin of error", true),
            ("3", "Interpret the interval", false),
        ]
    );
    // Addresses are whole, and are grading pages the adapter knows.
    assert_eq!(
        questions[2].url,
        format!("{site}/course/gradeallq2.php?stu=0&cid=1&asid=average&aid=2&qid=103")
    );
    assert!(questions.iter().all(|q| IMathAs.matches(&q.url)));

    // A question the list does not hold has no neighbours to offer.
    let stray = chrome
        .open(&format!(
            "{site}/course/gradeallq2.php?stu=0&cid=1&aid=2&qid=999"
        ))
        .await
        .unwrap();
    assert!(IMathAs.questions(&stray).await.unwrap().is_empty());

    // And a page with no link to the list gives none, without failing.
    let alone = chrome
        .open(&format!("{site}/alone/gradeallq2.php?qid=102"))
        .await
        .unwrap();
    assert!(IMathAs.questions(&alone).await.unwrap().is_empty());

    chrome.close().await.unwrap();
    let _ = std::fs::remove_dir_all(&profile_dir);
}
