//! Reads and grades a Canvas assignment through a mock Canvas API, in a real
//! headless Chrome.
//!
//! There is no real Canvas to test against, so a small server in this file
//! stands in for one: it keeps its submissions in memory, pages its lists with
//! `Link` headers, wants the session cookie on every API request and the CSRF
//! token on every write, and answers failures the way Canvas does.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-harness -- --ignored

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use axum::Router;
use axum::extract::State as Shared;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use ogre_core::{GradeWrite, GradingPage, WritePolicy, plan_write};
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_harness::sites::canvas::Canvas;
use ogre_harness::sites::{SiteAdapter, verify_writes};
use ogre_harness::{Error, PageDriver};
use serde_json::{Value, json};

const SPEEDGRADER: &str = "/courses/7/gradebook/speed_grader?assignment_id=42&student_id=101";
const SUBMISSIONS: &str = "/api/v1/courses/7/assignments/42/submissions";
const TEACHER: u64 = 9;
/// Canvas's token is base64, so it needs decoding when read from the cookie.
const CSRF: &str = "mAsk+ed/Tok3n==";

// ---------------------------------------------------------------------------
// The mock Canvas
// ---------------------------------------------------------------------------

/// One request the mock received on `/api/v1`.
#[derive(Debug, Clone)]
struct Seen {
    method: String,
    path: String,
    query: Vec<(String, String)>,
    accept: String,
    content_type: String,
    csrf: Option<String>,
    has_session: bool,
    form: Vec<(String, String)>,
}

struct Canvas7 {
    origin: String,
    /// The token writes must carry.
    csrf: String,
    /// Whether loading a page hands out the `_csrf_token` cookie.
    gives_csrf_cookie: bool,
    /// Answer every API request with this status and body.
    reject_all: Option<(u16, String)>,
    /// Answer every write with this status and body, changing nothing.
    reject_writes: Option<(u16, String)>,
    /// The most items a list page holds, whatever `per_page` asks for.
    page_size: usize,
    assignment: Value,
    /// Stored submission records, in user id order, with `user` and
    /// `submission_comments` inside.
    submissions: Vec<Value>,
    next_comment_id: u64,
    seen: Vec<Seen>,
}

#[derive(Clone)]
struct Mock(Arc<Mutex<Canvas7>>);

impl Mock {
    fn state(&self) -> MutexGuard<'_, Canvas7> {
        self.0.lock().unwrap()
    }

    fn submission(&self, user: u64) -> Value {
        let state = self.state();
        state
            .submissions
            .iter()
            .find(|s| s["user_id"] == user)
            .cloned()
            .expect("student has a submission")
    }

    fn writes(&self) -> Vec<Seen> {
        let state = self.state();
        state
            .seen
            .iter()
            .filter(|r| r.method != "GET")
            .cloned()
            .collect()
    }
}

fn user(id: u64, name: &str, sortable: &str) -> Value {
    json!({ "id": id, "name": name, "sortable_name": sortable, "short_name": name })
}

fn comment(id: u64, author: u64, author_name: &str, text: &str, at: &str) -> Value {
    json!({
        "id": id, "author_id": author, "author_name": author_name, "comment": text,
        "created_at": at, "edited_at": null, "attempt": 1,
    })
}

fn submission(id: u64, student: Value, fields: Value) -> Value {
    let mut record = json!({
        "id": id, "assignment_id": 42, "user_id": student["id"], "user": student,
        "score": null, "entered_score": null, "grade": null, "excused": null,
        "submission_type": null, "body": null, "workflow_state": "unsubmitted",
        "attempt": null, "grader_id": null, "submission_comments": [],
    });
    record
        .as_object_mut()
        .unwrap()
        .extend(fields.as_object().unwrap().clone());
    record
}

impl Canvas7 {
    fn new(origin: String) -> Self {
        let assignment = json!({
            "id": 42, "course_id": 7, "name": "Essay 1: Sampling",
            "description": "<p>Explain how <strong>sample size</strong> affects the margin of error.</p>",
            "points_possible": 10.0, "grading_type": "points",
            "submission_types": ["online_text_entry", "online_upload"],
            "anonymous_grading": false, "anonymize_students": false, "moderated_grading": false,
            "group_category_id": null, "grade_group_students_individually": false,
            "use_rubric_for_grading": false,
            "rubric_settings": { "id": 3, "title": "Essay rubric", "points_possible": 10.0 },
            "rubric": [
                {
                    "id": "_1001", "points": 6.0, "description": "Concept",
                    "long_description": "Explains why larger samples vary less.",
                    "criterion_use_range": false,
                    "ratings": [
                        { "id": "r1", "points": 6.0, "description": "Full Marks", "long_description": "Links sample size to the standard error." },
                        { "id": "r2", "points": 3.0, "description": "Partial", "long_description": "States the direction only." },
                        { "id": "r3", "points": 0.0, "description": "No Marks", "long_description": "" }
                    ]
                },
                {
                    "id": "_1002", "points": 4.0, "description": "Communication",
                    "long_description": "", "criterion_use_range": false,
                    "ratings": [
                        { "id": "r4", "points": 4.0, "description": "Full Marks", "long_description": "" },
                        { "id": "r5", "points": 0.0, "description": "No Marks", "long_description": "" }
                    ]
                }
            ],
        });
        let submissions = vec![
            // Handed in as text, not graded; the only comment is the student's own.
            submission(
                501,
                user(101, "Avery Stone", "Stone, Avery"),
                json!({
                    "submission_type": "online_text_entry", "workflow_state": "submitted", "attempt": 1,
                    "body": "<p>Larger samples <strong>shrink</strong> the margin of error.</p>",
                    "submission_comments": [
                        comment(1, 101, "Avery Stone", "Sorry this is late.", "2026-03-01T10:00:00Z")
                    ],
                }),
            ),
            // Graded, with teacher comments and a later reply from the student.
            submission(
                502,
                user(102, "Kai Brook", "Brook, Kai"),
                json!({
                    "submission_type": "online_text_entry", "workflow_state": "graded", "attempt": 1,
                    "body": "<p>The margin of error is smaller.</p>",
                    "score": 8.0, "entered_score": 8.0, "grade": "8", "grader_id": TEACHER,
                    "submission_comments": [
                        comment(2, TEACHER, "Ms. Reyes", "First pass.", "2026-03-02T10:00:00Z"),
                        comment(3, TEACHER, "Ms. Reyes", "See me about paragraph two.", "2026-03-03T10:00:00Z"),
                        comment(4, 102, "Kai Brook", "Will do!", "2026-03-04T10:00:00Z")
                    ],
                }),
            ),
            // Handed in as a file.
            submission(
                503,
                user(103, "Pat Diaz", "Diaz, Pat"),
                json!({ "submission_type": "online_upload", "workflow_state": "submitted", "attempt": 1 }),
            ),
            // Nothing handed in: Canvas keeps a placeholder record.
            submission(504, user(104, "Rey Evans", "Evans, Rey"), json!({})),
            // The course's Test Student, who has tried the assignment.
            submission(
                505,
                user(105, "Test Student", "Student, Test"),
                json!({
                    "submission_type": "online_text_entry", "workflow_state": "submitted", "attempt": 1,
                    "body": "<p>testing</p>",
                }),
            ),
            // Excused.
            submission(
                506,
                user(106, "Lee Ford", "Ford, Lee"),
                json!({
                    "submission_type": "online_text_entry", "workflow_state": "graded", "attempt": 1,
                    "body": "<p>Excused work.</p>", "excused": true, "grade": "EX",
                }),
            ),
            // Sam Gray (107) is enrolled but the assignment is not given to
            // them, so there is no record at all.
        ];
        Self {
            origin,
            csrf: CSRF.to_owned(),
            gives_csrf_cookie: true,
            reject_all: None,
            reject_writes: None,
            page_size: 2,
            assignment,
            submissions,
            next_comment_id: 100,
            seen: Vec::new(),
        }
    }

    /// One submission the way the API shows it for the given `include[]`s.
    fn shown(record: &Value, includes: &[&str]) -> Value {
        let mut shown = record.clone();
        let fields = shown.as_object_mut().unwrap();
        if !includes.contains(&"user") {
            fields.remove("user");
        }
        if !includes.contains(&"submission_comments") {
            fields.remove("submission_comments");
        }
        shown
    }
}

fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' => match text
                .get(i + 1..i + 3)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
            {
                Some(byte) => {
                    out.push(byte);
                    i += 2;
                }
                None => out.push(b'%'),
            },
            other => out.push(other),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn pairs(text: &str) -> Vec<(String, String)> {
    text.split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
            (decode(name), decode(value))
        })
        .collect()
}

/// Whether a stored submission belongs to the user id in a request path.
fn is_user(record: &Value, student: &str) -> bool {
    student
        .parse::<u64>()
        .is_ok_and(|id| record["user_id"] == id)
}

fn values<'a>(pairs: &'a [(String, String)], name: &str) -> Vec<&'a str> {
    pairs
        .iter()
        .filter(|(n, _)| n == name)
        .map(|(_, v)| v.as_str())
        .collect()
}

/// What Canvas does for `Accept: application/json+canvas-string-ids`.
fn stringify_ids(value: &mut Value) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(stringify_ids),
        Value::Object(fields) => {
            for (name, inner) in fields.iter_mut() {
                if (name == "id" || name.ends_with("_id")) && inner.is_number() {
                    *inner = Value::String(inner.to_string());
                } else {
                    stringify_ids(inner);
                }
            }
        }
        _ => {}
    }
}

fn raw(status: u16, content_type: &'static str, body: String) -> Response {
    (
        StatusCode::from_u16(status).unwrap(),
        [(header::CONTENT_TYPE, content_type)],
        body,
    )
        .into_response()
}

fn error(status: u16, body: Value) -> Response {
    raw(status, "application/json; charset=utf-8", body.to_string())
}

fn not_found() -> Response {
    error(
        404,
        json!({ "errors": [{ "message": "The specified resource does not exist." }] }),
    )
}

async fn handle(
    Shared(mock): Shared<Mock>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: String,
) -> Response {
    let path = uri.path().to_owned();
    let segments: Vec<&str> = path.trim_matches('/').split('/').collect();
    match segments.as_slice() {
        ["api", "v1", rest @ ..] => api(&mock, &method, &uri, &headers, &body, rest),
        ["courses", _, "gradebook", "speed_grader"] | ["courses", _, "assignments", _]
            if method == Method::GET =>
        {
            let state = mock.state();
            let mut response = raw(
                200,
                "text/html; charset=utf-8",
                "<!DOCTYPE html><html><head><title>Canvas</title></head><body>Canvas</body></html>"
                    .to_owned(),
            );
            let cookies = response.headers_mut();
            cookies.append(
                header::SET_COOKIE,
                HeaderValue::from_static("canvas_session=teacher; Path=/; HttpOnly"),
            );
            if state.gives_csrf_cookie {
                let cookie = format!("_csrf_token={}; Path=/", encode(&state.csrf));
                cookies.append(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap());
            }
            response
        }
        _ => raw(
            404,
            "text/html; charset=utf-8",
            "<html>Page Not Found</html>".to_owned(),
        ),
    }
}

fn api(
    mock: &Mock,
    method: &Method,
    uri: &Uri,
    headers: &HeaderMap,
    body: &str,
    route: &[&str],
) -> Response {
    let text = |name: header::HeaderName| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_owned()
    };
    let query = pairs(uri.query().unwrap_or_default());
    let form = pairs(body);
    let accept = text(header::ACCEPT);
    let has_session = text(header::COOKIE)
        .split(';')
        .any(|c| c.trim() == "canvas_session=teacher");
    let csrf = headers
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mut state = mock.state();
    state.seen.push(Seen {
        method: method.to_string(),
        path: uri.path().to_owned(),
        query: query.clone(),
        accept: accept.clone(),
        content_type: text(header::CONTENT_TYPE),
        csrf: csrf.clone(),
        has_session,
        form: form.clone(),
    });

    if let Some((status, body)) = &state.reject_all {
        let kind = if body.starts_with('<') {
            "text/html"
        } else {
            "application/json"
        };
        return raw(*status, kind, body.clone());
    }
    if !has_session {
        return error(
            401,
            json!({ "status": "unauthenticated", "errors": [{ "message": "user authorization required" }] }),
        );
    }
    let is_write = *method != Method::GET;
    if is_write && csrf.as_deref() != Some(state.csrf.as_str()) {
        // An invalid authenticity token is a 422 from Rails.
        return error(
            422,
            json!({ "errors": [{ "message": "An error occurred.", "error_code": "unprocessable_entity" }] }),
        );
    }
    if is_write && let Some((status, body)) = &state.reject_writes {
        return raw(*status, "application/json", body.clone());
    }

    let includes = values(&query, "include[]");
    let mut answer = match (method.as_str(), route) {
        ("GET", ["courses", "7", "assignments", "42"]) => state.assignment.clone(),
        ("GET", ["courses", "7", "users"]) => {
            if values(&query, "enrollment_type[]") == ["student_view"] {
                json!([user(105, "Test Student", "Student, Test")])
            } else {
                // The real list leaves the Test Student out.
                json!([user(101, "Avery Stone", "Stone, Avery")])
            }
        }
        ("GET", ["courses", "7", "assignments", "42", "submissions"]) => {
            let asked = |name: &str, default: usize| {
                values(&query, name)
                    .first()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(default)
            };
            let per_page = asked("per_page", 10).clamp(1, state.page_size);
            let page = asked("page", 1).max(1);
            let last = state.submissions.len().div_ceil(per_page).max(1);
            let items: Vec<Value> = state
                .submissions
                .iter()
                .skip((page - 1) * per_page)
                .take(per_page)
                .map(|record| Canvas7::shown(record, &includes))
                .collect();

            let kept: Vec<String> = query
                .iter()
                .filter(|(name, _)| name != "page" && name != "per_page")
                .map(|(name, value)| format!("{}={}", encode(name), encode(value)))
                .collect();
            let link = |page: usize, rel: &str| {
                format!(
                    "<{}{}?{}&page={page}&per_page={per_page}>; rel=\"{rel}\"",
                    state.origin,
                    uri.path(),
                    kept.join("&")
                )
            };
            let mut links = vec![link(page, "current")];
            if page < last {
                links.push(link(page + 1, "next"));
            }
            links.push(link(1, "first"));
            links.push(link(last, "last"));

            let mut items = Value::Array(items);
            if accept.contains("application/json+canvas-string-ids") {
                stringify_ids(&mut items);
            }
            let mut response = raw(200, "application/json; charset=utf-8", items.to_string());
            response.headers_mut().insert(
                header::LINK,
                HeaderValue::from_str(&links.join(",")).unwrap(),
            );
            return response;
        }
        ("GET", ["courses", "7", "assignments", "42", "submissions", student]) => {
            match state.submissions.iter().find(|s| is_user(s, student)) {
                Some(record) => Canvas7::shown(record, &includes),
                None => return not_found(),
            }
        }
        ("PUT", ["courses", "7", "assignments", "42", "submissions", student]) => {
            let comment_id = state.next_comment_id;
            let Some(record) = state.submissions.iter_mut().find(|s| is_user(s, student)) else {
                return not_found();
            };
            let mut wrote_comment = false;
            if let Some(grade) = values(&form, "submission[posted_grade]").first() {
                let Ok(score) = grade.parse::<f64>() else {
                    return error(400, json!({ "error": "Invalid grade" }));
                };
                record["score"] = json!(score);
                record["entered_score"] = json!(score);
                record["grade"] = json!(grade);
                record["workflow_state"] = json!("graded");
                record["grader_id"] = json!(TEACHER);
            }
            if let Some(text) = values(&form, "comment[text_comment]").first() {
                let at = format!("2026-11-12T08:00:{:02}Z", comment_id % 60);
                record["submission_comments"]
                    .as_array_mut()
                    .unwrap()
                    .push(comment(comment_id, TEACHER, "Ms. Reyes", text, &at));
                wrote_comment = true;
            }
            // The answer always carries the comments, and never the user.
            let mut answer = Canvas7::shown(record, &["submission_comments"]);
            answer["all_submissions"] = json!([Canvas7::shown(record, &[])]);
            if wrote_comment {
                state.next_comment_id += 1;
            }
            answer
        }
        _ => return not_found(),
    };
    if accept.contains("application/json+canvas-string-ids") {
        stringify_ids(&mut answer);
    }
    raw(200, "application/json; charset=utf-8", answer.to_string())
}

async fn start_mock() -> Mock {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let mock = Mock(Arc::new(Mutex::new(Canvas7::new(origin))));
    let app = Router::new().fallback(handle).with_state(mock.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    mock
}

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

struct Session {
    chrome: Chrome,
    profile_dir: PathBuf,
    page: CdpPage,
    mock: Mock,
}

impl Session {
    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.mock.state().origin)
    }
}

/// Starts a mock Canvas, lets `prepare` change it, and opens `path` on it.
async fn open_with(test: &str, path: &str, prepare: impl FnOnce(&mut Canvas7)) -> Session {
    let mock = start_mock().await;
    prepare(&mut mock.state());
    let profile_dir =
        std::env::temp_dir().join(format!("ogre-test-canvas-{test}-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let url = format!("{}{path}", mock.state().origin);
    let page = chrome.open(&url).await.unwrap();
    Session {
        chrome,
        profile_dir,
        page,
        mock,
    }
}

async fn open(test: &str) -> Session {
    open_with(test, SPEEDGRADER, |_| {}).await
}

async fn close(session: Session) {
    session.chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(session.profile_dir);
}

const NO_OVERWRITE: WritePolicy = WritePolicy {
    overwrite_scores: false,
    replace_feedback: false,
};

fn student<'a>(page: &'a GradingPage, name: &str) -> &'a ogre_core::Submission {
    page.submissions
        .iter()
        .find(|s| s.name == name)
        .unwrap_or_else(|| panic!("{name} is on the page"))
}

fn planned(page: &GradingPage, name: &str, score: f64, feedback: &str) -> GradeWrite {
    plan_write(student(page, name), score, feedback, NO_OVERWRITE).expect("write is allowed")
}

fn page_error(result: Result<impl std::fmt::Debug, Error>) -> String {
    match result {
        Err(Error::Page(message)) => message,
        other => panic!("expected a page error, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reads_every_student_across_pages() {
    let s = open("read").await;
    let stored_before = s.mock.state().submissions.clone();

    let page = Canvas.read_page(&s.page).await.unwrap();
    assert_eq!(page.title, "Essay 1: Sampling");
    assert_eq!(page.url, s.url(SPEEDGRADER));
    assert_eq!(page.position, None);

    // In name order. No Test Student, and nobody without a submission record.
    let names: Vec<_> = page.submissions.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "Brook, Kai",
            "Diaz, Pat",
            "Evans, Rey",
            "Ford, Lee",
            "Stone, Avery"
        ]
    );
    assert_eq!(
        page.submissions.iter().map(|s| s.index).collect::<Vec<_>>(),
        [0, 1, 2, 3, 4]
    );

    // Graded, with a teacher comment: the newest one that is not the student's.
    let kai = student(&page, "Brook, Kai");
    assert_eq!(kai.student_id.as_deref(), Some("102"));
    assert_eq!(kai.scores.len(), 1);
    assert_eq!(kai.scores[0].field, "canvas:score:7:42:102");
    assert_eq!(kai.scores[0].raw, "8");
    assert_eq!(kai.scores[0].max, Some(10.0));
    assert_eq!(kai.response, "The margin of error is smaller.");
    let feedback = kai.feedback.as_ref().unwrap();
    assert_eq!(feedback.field, "canvas:comment:7:42:102");
    assert_eq!(feedback.text, "See me about paragraph two.");
    assert!(kai.has_nonzero_score() && kai.has_feedback());
    assert!(plan_write(kai, 9.0, "<p>x</p>", NO_OVERWRITE).is_err());

    // Ungraded text entry; the student's own comment is not feedback.
    let avery = student(&page, "Stone, Avery");
    assert_eq!(avery.student_id.as_deref(), Some("101"));
    assert_eq!(avery.scores[0].raw, "");
    assert_eq!(avery.score(), None);
    assert_eq!(
        avery.response,
        "Larger samples **shrink** the margin of error."
    );
    assert!(!avery.has_feedback());

    // A file upload and a missing submission have no written response.
    let pat = student(&page, "Diaz, Pat");
    assert_eq!(pat.response, "");
    assert_eq!(pat.scores[0].raw, "");
    let rey = student(&page, "Evans, Rey");
    assert_eq!(rey.response, "");
    assert_eq!(rey.scores.len(), 1);

    // An excused student has no score box, so nothing can be planned.
    let lee = student(&page, "Ford, Lee");
    assert!(lee.scores.is_empty());
    assert!(plan_write(lee, 5.0, "<p>x</p>", NO_OVERWRITE).is_err());

    {
        let state = s.mock.state();
        assert_eq!(state.submissions, stored_before, "reading changes nothing");
        assert!(!state.seen.is_empty());
        for request in &state.seen {
            assert_eq!(request.method, "GET", "{request:?}");
            assert!(request.has_session, "{request:?}");
            assert_eq!(request.accept, "application/json+canvas-string-ids");
            assert_eq!(request.csrf, None, "a read does not need the token");
        }
        // Six records, two to a page: three requests, each following `next`.
        let lists: Vec<_> = state
            .seen
            .iter()
            .filter(|r| r.path == SUBMISSIONS)
            .collect();
        assert_eq!(lists.len(), 3);
        assert_eq!(values(&lists[0].query, "per_page"), ["100"]);
        assert_eq!(values(&lists[0].query, "page"), [] as [&str; 0]);
        for (list, page) in lists.iter().zip(["1", "2", "3"]).skip(1) {
            assert_eq!(values(&list.query, "page"), [page]);
            assert_eq!(
                values(&list.query, "include[]"),
                ["user", "submission_comments"]
            );
        }
    }

    // The same assignment read from its own page.
    s.page
        .navigate(&s.url("/courses/7/assignments/42"))
        .await
        .unwrap();
    let again = Canvas.read_page(&s.page).await.unwrap();
    assert_eq!(again.submissions, page.submissions);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn maps_the_assignment_and_its_rubric() {
    let s = open("rubric").await;

    let rubric = Canvas.read_rubric(&s.page).await.unwrap();
    assert_eq!(
        rubric.essay_prompt.as_deref(),
        Some("Explain how **sample size** affects the margin of error.")
    );
    assert_eq!(rubric.max_score_value(), 10.0);
    let checklist: Vec<_> = rubric
        .checklist_items
        .iter()
        .map(|c| (c.category.as_deref().unwrap(), c.points, c.items.clone()))
        .collect();
    assert_eq!(
        checklist,
        [
            (
                "Concept",
                Some(6.0),
                vec![
                    "Explains why larger samples vary less.".to_owned(),
                    "Full credit: Links sample size to the standard error.".to_owned()
                ]
            ),
            ("Communication", Some(4.0), vec!["Communication".to_owned()]),
        ]
    );
    assert!(rubric.rubric_items.is_empty());
    assert_eq!(rubric.model_text, None);

    // No rubric attached: Canvas leaves the field out.
    s.mock
        .state()
        .assignment
        .as_object_mut()
        .unwrap()
        .remove("rubric");
    let rubric = Canvas.read_rubric(&s.page).await.unwrap();
    assert!(rubric.checklist_items.is_empty());
    assert_eq!(rubric.max_score_value(), 10.0);

    assert!(s.mock.writes().is_empty());
    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn writes_a_grade_and_comment_then_verifies() {
    let s = open("write").await;
    let before = Canvas.read_page(&s.page).await.unwrap();

    // Avery has no score and no teacher feedback. The feedback carries an attack.
    let hostile = "<p onclick=\"steal()\">Good start, <strong>Avery</strong>.</p>\
                   <script>window.__pwned = true</script><img src=x onerror=\"window.__pwned = true\">\
                   <p>Next: define the standard error.</p>";
    let write = planned(&before, "Stone, Avery", 7.5, hostile);
    assert_eq!(write.score.field, "canvas:score:7:42:101");
    assert_eq!(write.score.expected, "");
    assert!(write.feedback.is_some());

    let receipt = Canvas.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.score, "7.5");
    assert_eq!(
        receipt.feedback_text.as_deref(),
        Some("Good start, Avery.\n\nNext: define the standard error.")
    );

    // What the server received: one write, for this student, as plain text.
    let writes = s.mock.writes();
    assert_eq!(writes.len(), 1, "{writes:?}");
    let put = &writes[0];
    assert_eq!(put.method, "PUT");
    assert_eq!(put.path, format!("{SUBMISSIONS}/101"));
    assert_eq!(put.csrf.as_deref(), Some(CSRF), "the cookie, URL-decoded");
    assert!(put.has_session);
    assert!(
        put.content_type
            .starts_with("application/x-www-form-urlencoded"),
        "{}",
        put.content_type
    );
    let sent: Vec<_> = put
        .form
        .iter()
        .map(|(n, v)| (n.as_str(), v.as_str()))
        .collect();
    assert_eq!(
        sent,
        [
            ("submission[posted_grade]", "7.5"),
            ("prefer_points_over_scheme", "true"),
            (
                "comment[text_comment]",
                "Good start, Avery.\n\nNext: define the standard error."
            ),
        ]
    );
    assert_eq!(
        s.page.eval("window.__pwned === true").await.unwrap(),
        json!(false)
    );

    // What the server now holds.
    let stored = s.mock.submission(101);
    assert_eq!(stored["score"], json!(7.5));
    assert_eq!(stored["workflow_state"], "graded");
    let comments = stored["submission_comments"].as_array().unwrap();
    assert_eq!(comments.len(), 2);
    assert_eq!(comments[1]["author_id"], json!(TEACHER));
    assert_eq!(
        comments[1]["comment"],
        "Good start, Avery.\n\nNext: define the standard error."
    );

    // Canvas stores on write: there is nothing left to save.
    assert!(Canvas.saves_on_write());
    Canvas.save(&s.page).await.unwrap();
    assert_eq!(s.mock.writes().len(), 1);

    // A fresh read shows the write, and nobody else changed.
    let written = vec![(write, receipt)];
    assert_eq!(verify_writes(&Canvas, &s.page, &written).await.unwrap(), []);
    let after = Canvas.read_page(&s.page).await.unwrap();
    let avery = student(&after, "Stone, Avery");
    assert_eq!(avery.score(), Some(7.5));
    assert_eq!(
        avery.feedback.as_ref().unwrap().text,
        "Good start, Avery.\n\nNext: define the standard error."
    );
    for name in ["Brook, Kai", "Diaz, Pat", "Evans, Rey", "Ford, Lee"] {
        assert_eq!(
            student(&after, name),
            student(&before, name),
            "{name} changed"
        );
    }

    // Verification notices a score and a comment that are no longer what was written.
    {
        let mut state = s.mock.state();
        let record = state
            .submissions
            .iter_mut()
            .find(|r| r["user_id"] == 101)
            .unwrap();
        record["score"] = json!(2.0);
        record["entered_score"] = json!(2.0);
        record["submission_comments"]
            .as_array_mut()
            .unwrap()
            .push(comment(
                900,
                TEACHER,
                "Ms. Reyes",
                "Regraded by hand.",
                "2026-11-12T09:00:00Z",
            ));
    }
    let problems = verify_writes(&Canvas, &s.page, &written).await.unwrap();
    assert_eq!(problems.len(), 2, "{problems:?}");
    assert!(problems.iter().all(|p| p.name == "Stone, Avery"));
    assert_eq!(
        problems[0].problem,
        "score should be 7.5 but the page shows 2"
    );
    assert_eq!(
        problems[1].problem,
        "feedback on the page differs from what was written"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn writes_only_the_score_where_the_teacher_already_commented() {
    let s = open("write-score-only").await;
    let before = Canvas.read_page(&s.page).await.unwrap();

    let allowed = WritePolicy {
        overwrite_scores: true,
        replace_feedback: false,
    };
    let write = plan_write(
        student(&before, "Brook, Kai"),
        9.0,
        "<p>Better.</p>",
        allowed,
    )
    .unwrap();
    assert_eq!(write.feedback, None);
    assert_eq!(write.score.expected, "8");

    let receipt = Canvas.write_grade(&s.page, &write).await.unwrap();
    assert_eq!(receipt.score, "9");
    assert_eq!(receipt.feedback_text, None);

    let writes = s.mock.writes();
    assert_eq!(writes.len(), 1);
    assert!(values(&writes[0].form, "comment[text_comment]").is_empty());
    let stored = s.mock.submission(102);
    assert_eq!(stored["score"], json!(9.0));
    assert_eq!(stored["submission_comments"].as_array().unwrap().len(), 3);

    assert_eq!(
        verify_writes(&Canvas, &s.page, &[(write, receipt)])
            .await
            .unwrap(),
        []
    );
    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn refuses_to_write_over_a_score_that_changed_since_it_was_read() {
    let s = open("write-race").await;
    let before = Canvas.read_page(&s.page).await.unwrap();
    let write = planned(&before, "Stone, Avery", 7.0, "<p>Good start.</p>");

    // The teacher grades the student in SpeedGrader while the AI is working.
    {
        let mut state = s.mock.state();
        let record = state
            .submissions
            .iter_mut()
            .find(|r| r["user_id"] == 101)
            .unwrap();
        record["score"] = json!(9.0);
        record["entered_score"] = json!(9.0);
    }

    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Stone, Avery")
            && message.contains("changed in Canvas")
            && message.contains("now \"9\""),
        "{message}"
    );
    assert!(s.mock.writes().is_empty(), "nothing was sent");
    let stored = s.mock.submission(101);
    assert_eq!(stored["score"], json!(9.0));
    assert_eq!(stored["submission_comments"].as_array().unwrap().len(), 1);

    // The same for a student who was excused in the meantime.
    let write = planned(&before, "Diaz, Pat", 4.0, "<p>See notes.</p>");
    s.mock
        .state()
        .submissions
        .iter_mut()
        .find(|r| r["user_id"] == 103)
        .unwrap()["excused"] = json!(true);
    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Diaz, Pat") && message.contains("excused"),
        "{message}"
    );
    assert!(s.mock.writes().is_empty());

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn refuses_to_write_once_the_browser_is_on_another_assignment() {
    let s = open("write-moved").await;
    let before = Canvas.read_page(&s.page).await.unwrap();
    let write = planned(&before, "Stone, Avery", 7.0, "<p>Good start.</p>");

    s.page
        .navigate(&s.url("/courses/7/assignments/43"))
        .await
        .unwrap();
    let requests_before = s.mock.state().seen.len();
    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Stone, Avery") && message.contains("no longer on the assignment"),
        "{message}"
    );
    assert_eq!(
        s.mock.state().seen.len(),
        requests_before,
        "no request was made"
    );

    // A write that was not planned from a Canvas page is refused the same way.
    s.page.navigate(&s.url(SPEEDGRADER)).await.unwrap();
    let mut foreign = write.clone();
    foreign.score.field = "ud-1002-0-2-0".into();
    let message = page_error(Canvas.write_grade(&s.page, &foreign).await);
    assert!(
        message.contains("not read from a Canvas assignment"),
        "{message}"
    );

    // So is one whose comment is addressed to a different student.
    let mut crossed = write.clone();
    crossed.feedback.as_mut().unwrap().field = "canvas:comment:7:42:102".into();
    let message = page_error(Canvas.write_grade(&s.page, &crossed).await);
    assert!(message.contains("different students"), "{message}");
    assert!(s.mock.writes().is_empty());

    // A page that is not an assignment at all.
    s.page
        .navigate(&s.url("/courses/7/gradebook"))
        .await
        .unwrap();
    let message = page_error(Canvas.read_page(&s.page).await);
    assert!(message.contains("is not a Canvas assignment"), "{message}");

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reports_what_canvas_says_when_it_refuses() {
    let s = open("errors").await;
    let before = Canvas.read_page(&s.page).await.unwrap();
    let write = planned(&before, "Stone, Avery", 7.0, "<p>Good start.</p>");

    // Canvas turns a grade down.
    s.mock.state().reject_writes = Some((
        400,
        json!({ "error": "Student must be enrolled in the course as a student to be graded" })
            .to_string(),
    ));
    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Stone, Avery")
            && message.contains("400")
            && message.contains("Student must be enrolled in the course as a student to be graded"),
        "{message}"
    );
    assert_eq!(s.mock.writes().len(), 1);
    assert_eq!(s.mock.submission(101)["score"], Value::Null);
    s.mock.state().reject_writes = None;

    // The server falls over and answers with its error page.
    s.mock.state().reject_all = Some((500, "<html><body>Page Error</body></html>".to_owned()));
    let message = page_error(Canvas.read_page(&s.page).await);
    assert!(
        message.contains("500") && message.contains("a web page, not an error message"),
        "{message}"
    );

    // The teacher's login has ended.
    s.mock.state().reject_all = Some((
        401,
        json!({ "status": "unauthenticated", "errors": [{ "message": "user authorization required" }] })
            .to_string(),
    ));
    for message in [
        page_error(Canvas.read_page(&s.page).await),
        page_error(Canvas.read_rubric(&s.page).await),
        page_error(Canvas.write_grade(&s.page, &write).await),
    ] {
        assert!(
            message.contains("401")
                && message.contains("user authorization required")
                && message.contains("log in"),
            "{message}"
        );
    }

    // The account may not grade here.
    s.mock.state().reject_all = Some((
        403,
        json!({ "status": "unauthorized", "errors": [{ "message": "user not authorized to perform that action" }] })
            .to_string(),
    ));
    let message = page_error(Canvas.read_page(&s.page).await);
    assert!(
        message.contains("403")
            && message.contains("user not authorized to perform that action")
            && message.contains("not allowed"),
        "{message}"
    );

    // The student is gone.
    s.mock.state().reject_all = None;
    s.mock.state().submissions.retain(|r| r["user_id"] != 101);
    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("404") && message.contains("The specified resource does not exist."),
        "{message}"
    );
    assert_eq!(
        s.mock.writes().len(),
        1,
        "only the refused write was ever sent"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn sends_nothing_without_the_csrf_cookie() {
    let s = open_with("no-csrf", SPEEDGRADER, |canvas| {
        canvas.gives_csrf_cookie = false
    })
    .await;

    // Reading needs no token.
    let before = Canvas.read_page(&s.page).await.unwrap();
    let write = planned(&before, "Stone, Avery", 7.0, "<p>Good start.</p>");

    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Stone, Avery") && message.contains("_csrf_token"),
        "{message}"
    );
    assert!(
        s.mock.writes().is_empty(),
        "the write never left the browser"
    );
    assert_eq!(s.mock.submission(101)["score"], Value::Null);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_stale_csrf_token_is_rejected_by_canvas_and_reported() {
    let s = open("stale-csrf").await;
    let before = Canvas.read_page(&s.page).await.unwrap();
    let write = planned(&before, "Stone, Avery", 7.0, "<p>Good start.</p>");

    // The mock itself turns away a write with no token at all.
    let status = s
        .page
        .eval(&format!(
            "fetch('{SUBMISSIONS}/101', {{ method: 'PUT', \
               body: new URLSearchParams([['submission[posted_grade]', '1']]) }}).then((r) => r.status)"
        ))
        .await
        .unwrap();
    assert_eq!(status, json!(422));

    // Canvas has issued a new token since this page was loaded.
    s.mock.state().csrf = "r0tated/Token==".to_owned();
    let message = page_error(Canvas.write_grade(&s.page, &write).await);
    assert!(
        message.contains("Stone, Avery")
            && message.contains("422")
            && message.contains("An error occurred. [unprocessable_entity]")
            && message.contains("reload the Canvas page"),
        "{message}"
    );
    let writes = s.mock.writes();
    assert_eq!(writes.len(), 2);
    assert_eq!(writes[1].csrf.as_deref(), Some(CSRF));
    let stored = s.mock.submission(101);
    assert_eq!(
        stored["score"],
        Value::Null,
        "a rejected write changes nothing"
    );
    assert_eq!(stored["submission_comments"].as_array().unwrap().len(), 1);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn refuses_assignments_it_cannot_grade_one_student_at_a_time() {
    let s = open("unsupported").await;

    for (field, value, word) in [
        ("anonymize_students", json!(true), "anonymously"),
        ("moderated_grading", json!(true), "moderated"),
        ("group_category_id", json!(31), "group assignment"),
    ] {
        let original = s.mock.state().assignment[field].clone();
        s.mock.state().assignment[field] = value;
        let message = page_error(Canvas.read_page(&s.page).await);
        assert!(
            message.contains("cannot grade") && message.contains(word),
            "{field}: {message}"
        );
        s.mock.state().assignment[field] = original;
    }

    // A pass/fail assignment can be read, but offers no score box to write to.
    s.mock.state().assignment["grading_type"] = json!("pass_fail");
    let page = Canvas.read_page(&s.page).await.unwrap();
    assert_eq!(page.submissions.len(), 5);
    assert!(page.submissions.iter().all(|s| s.scores.is_empty()));
    assert!(
        plan_write(
            student(&page, "Stone, Avery"),
            10.0,
            "<p>x</p>",
            NO_OVERWRITE
        )
        .is_err()
    );

    // An assignment given to nobody.
    s.mock.state().submissions.clear();
    let message = page_error(Canvas.read_page(&s.page).await);
    assert!(message.contains("no students"), "{message}");

    assert!(s.mock.writes().is_empty());
    close(s).await;
}
