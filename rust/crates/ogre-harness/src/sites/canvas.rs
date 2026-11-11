//! Canvas LMS: one assignment and its submissions, through Canvas's REST API.
//!
//! Nothing is scraped. From a Canvas page the teacher is logged in to, the
//! page script calls the API on the same site, so the browser attaches the
//! session cookies and no API token is needed. The course and assignment come
//! from the page's address each time something is read or written.
//!
//! Endpoints used, as documented at
//! <https://canvas.instructure.com/doc/api/> (assignments, submissions,
//! courses, pagination):
//!
//! | Request | Used for |
//! |---|---|
//! | `GET /api/v1/courses/:course_id/assignments/:id` | title, description, points, rubric |
//! | `GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions` with `include[]=user`, `include[]=submission_comments` | every student's work |
//! | `GET /api/v1/courses/:course_id/users?enrollment_type[]=student_view` | who the Test Student is |
//! | `GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id` | the score just before writing |
//! | `PUT` to the same path with `submission[posted_grade]`, `comment[text_comment]` | grade and comment |
//!
//! Not handled, and refused or left alone rather than guessed at: anonymous
//! grading, moderated grading and group-graded assignments are refused when
//! read; pass/fail and ungraded assignments, and excused students, get no
//! score box, so nothing is written for them. Rubric criteria are never
//! scored one by one: only the overall grade is set.

use std::collections::HashSet;

use async_trait::async_trait;
use ogre_core::{
    FeedbackField, FeedbackKind, GradeWrite, GradingPage, Rubric, ScoreField, Submission,
    format_score,
};
use serde::Deserialize;
use serde::de::{DeserializeOwned, Deserializer};
use serde_json::{Value, json};

use super::{SiteAdapter, WriteReceipt};
use crate::driver::eval_as;
use crate::{Error, PageDriver, Result, feedback};

const API_SCRIPT: &str = include_str!("canvas_api.js");

/// Prompts longer than this are cut, as the grading prompts expect.
const PROMPT_LIMIT: usize = 1500;
/// Canvas caps a page at 100 items whatever is asked for.
const PER_PAGE: &str = "100";
/// A list longer than this many pages is reported, not silently cut short.
const MAX_PAGES: u32 = 200;
/// Grading types whose grade is a number of points. A number sent to a
/// pass/fail assignment is only kept if it is zero or full marks.
const POINT_GRADING_TYPES: [&str; 4] = ["points", "percent", "letter_grade", "gpa_scale"];

pub struct Canvas;

#[async_trait]
impl SiteAdapter for Canvas {
    fn name(&self) -> &'static str {
        "Canvas"
    }

    fn matches(&self, url: &str) -> bool {
        Place::from_url(url).is_some()
    }

    async fn read_page(&self, page: &dyn PageDriver) -> Result<GradingPage> {
        let (url, place) = current_place(page).await?;
        let assignment = read_assignment(page, &place).await?;
        assignment.check_gradable()?;

        let test_students: Vec<RawUser> = get_all(
            page,
            "Canvas would not say which student is the Test Student",
            &format!("/api/v1/courses/{}/users", place.course),
            &[
                ("enrollment_type[]", "student_view"),
                ("per_page", PER_PAGE),
            ],
        )
        .await?;
        let test_students: HashSet<String> = test_students
            .into_iter()
            .filter_map(|user| user.id)
            .collect();

        let listed: Vec<RawSubmission> = get_all(
            page,
            "Canvas would not list the submissions",
            &format!("{}/submissions", place.assignment_path()),
            &[
                ("include[]", "user"),
                ("include[]", "submission_comments"),
                ("per_page", PER_PAGE),
            ],
        )
        .await?;

        let submissions = submissions_from(&place, &assignment, listed, &test_students)?;
        if submissions.is_empty() {
            return Err(Error::Page(
                "Canvas lists no students for this assignment.".into(),
            ));
        }
        Ok(GradingPage {
            url,
            title: assignment.name.clone().unwrap_or_default(),
            position: None,
            submissions,
        })
    }

    /// The assignment's description is the prompt and its Canvas rubric, if it
    /// has one, the checklist.
    async fn read_rubric(&self, page: &dyn PageDriver) -> Result<Rubric> {
        let (_, place) = current_place(page).await?;
        let assignment = read_assignment(page, &place).await?;
        // Built as JSON so the rubric decodes exactly like one saved by the app.
        Ok(serde_json::from_value(assignment.rubric_json())?)
    }

    async fn write_grade(&self, page: &dyn PageDriver, write: &GradeWrite) -> Result<WriteReceipt> {
        let refuse = |why: &str| Error::Page(format!("{}: {why}; nothing was written", write.name));

        let target = Target::parse(&write.score.field, SCORE_KEY)
            .ok_or_else(|| refuse("this score was not read from a Canvas assignment"))?;
        let (_, place) = current_place(page).await?;
        if place != target.place {
            return Err(refuse(
                "the browser is no longer on the assignment the scores were read from",
            ));
        }
        if let Some(feedback) = &write.feedback
            && Target::parse(&feedback.field, COMMENT_KEY).as_ref() != Some(&target)
        {
            return Err(refuse(
                "the score and the comment belong to different students",
            ));
        }
        if !write.score.value.is_finite() || write.score.value < 0.0 {
            return Err(refuse("the score to write is not a usable number"));
        }
        // AI feedback is untrusted: only its text is ever sent.
        let comment = write
            .feedback
            .as_ref()
            .map(|f| feedback::plain_text(&f.html))
            .filter(|text| !text.is_empty());

        let path = format!("{}/submissions/{}", place.assignment_path(), target.student);
        let before: RawSubmission = get(
            page,
            &format!("{}: Canvas would not show the current score", write.name),
            &path,
            &[("include[]", "submission_comments")],
        )
        .await?;
        if before.id.is_none() || before.user_id.as_deref() != Some(target.student.as_str()) {
            return Err(refuse("Canvas has no submission record for this student"));
        }
        if before.excused == Some(true) {
            return Err(refuse("the student has been excused from this assignment"));
        }
        let now = before.score_text();
        if !same_score(&write.score.expected, &now) {
            return Err(Error::Page(format!(
                "{}: the score changed in Canvas since it was read (was \"{}\", now \"{now}\"); nothing was written",
                write.name, write.score.expected
            )));
        }

        let mut form = vec![
            ("submission[posted_grade]", format_score(write.score.value)),
            // Without this, a number that is also a grade in the assignment's
            // grading scheme (a GPA scale has "4.0") is read as that grade.
            ("prefer_points_over_scheme", "true".to_owned()),
        ];
        if let Some(text) = &comment {
            form.push(("comment[text_comment]", text.clone()));
        }
        let after: RawSubmission = decode(
            send(
                page,
                &format!("{}: Canvas did not save the grade", write.name),
                json!({ "method": "PUT", "path": path, "query": [], "form": form }),
            )
            .await?,
        )?;

        // The receipt is what Canvas says it now holds, not what was sent.
        let score = after.score_text();
        if score.is_empty() {
            return Err(Error::Page(format!(
                "{}: Canvas accepted the grade but shows no score for the student. Check this student in Canvas.",
                write.name
            )));
        }
        let feedback_text = match comment {
            None => None,
            Some(_) => {
                let known: HashSet<&str> = before
                    .comments()
                    .iter()
                    .filter_map(|c| c.id.as_deref())
                    .collect();
                let added = after
                    .comments()
                    .iter()
                    .filter(|c| c.id.as_deref().is_some_and(|id| !known.contains(id)))
                    .rfind(|c| c.author_id.as_deref() != Some(target.student.as_str()))
                    .and_then(|c| c.comment.clone());
                Some(added.ok_or_else(|| {
                    Error::Page(format!(
                        "{}: Canvas saved the score {score} but not the comment. Check this student in Canvas.",
                        write.name
                    ))
                })?)
            }
        };
        Ok(WriteReceipt {
            score,
            feedback_text,
        })
    }

    /// The API stores a grade as soon as it is sent.
    fn saves_on_write(&self) -> bool {
        true
    }

    async fn save(&self, _page: &dyn PageDriver) -> Result<()> {
        Ok(())
    }
}

/// The course and assignment a Canvas page is about.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Place {
    course: String,
    assignment: String,
}

impl Place {
    /// Reads the ids from the address of SpeedGrader
    /// (`/courses/7/gradebook/speed_grader?assignment_id=42`) or of an
    /// assignment (`/courses/7/assignments/42`), on any host.
    fn from_url(url: &str) -> Option<Self> {
        let (scheme, rest) = url.split_once("://")?;
        if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
            return None;
        }
        let rest = rest.split('#').next()?;
        let (location, query) = rest.split_once('?').unwrap_or((rest, ""));
        let (host, path) = location.split_once('/')?;
        if host.is_empty() {
            return None;
        }
        let segments: Vec<&str> = path.split('/').collect();
        let segments = match segments.as_slice() {
            [most @ .., ""] => most,
            all => all,
        };
        let (course, assignment) = match segments {
            ["courses", course, "gradebook", "speed_grader"] => {
                let mut asked = query
                    .split('&')
                    .filter_map(|pair| pair.split_once('='))
                    .filter(|(name, _)| *name == "assignment_id")
                    .map(|(_, value)| value);
                let assignment = asked.next()?;
                // Two different answers to "which assignment" is no answer.
                if asked.any(|other| other != assignment) {
                    return None;
                }
                (*course, assignment)
            }
            ["courses", course, "assignments", assignment] => (*course, *assignment),
            _ => return None,
        };
        (is_id(course) && is_id(assignment)).then(|| Self {
            course: course.to_owned(),
            assignment: assignment.to_owned(),
        })
    }

    fn assignment_path(&self) -> String {
        format!(
            "/api/v1/courses/{}/assignments/{}",
            self.course, self.assignment
        )
    }
}

/// Canvas ids are whole numbers; one from another Canvas database is written
/// `shard~id`. Anything else never reaches a request path.
fn is_id(text: &str) -> bool {
    let digits =
        |part: &str| (1..=20).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_digit());
    match text.split_once('~') {
        Some((shard, id)) => digits(shard) && digits(id),
        None => digits(text),
    }
}

const SCORE_KEY: &str = "score";
const COMMENT_KEY: &str = "comment";

/// One student's score or comment on one assignment. Its text form is the
/// `field` of a [`ScoreField`] or [`FeedbackField`]: `canvas:score:7:42:1002`.
/// Carrying the course and assignment lets a write notice that the browser has
/// moved to another assignment since the page was read.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Target {
    place: Place,
    student: String,
}

impl Target {
    fn key(&self, kind: &str) -> String {
        format!(
            "canvas:{kind}:{}:{}:{}",
            self.place.course, self.place.assignment, self.student
        )
    }

    fn parse(field: &str, kind: &str) -> Option<Self> {
        let parts: Vec<&str> = field.split(':').collect();
        match parts.as_slice() {
            ["canvas", found, course, assignment, student]
                if *found == kind && is_id(course) && is_id(assignment) && is_id(student) =>
            {
                Some(Self {
                    place: Place {
                        course: (*course).to_owned(),
                        assignment: (*assignment).to_owned(),
                    },
                    student: (*student).to_owned(),
                })
            }
            _ => None,
        }
    }
}

async fn current_place(page: &dyn PageDriver) -> Result<(String, Place)> {
    let url = page.url().await?;
    match Place::from_url(&url) {
        Some(place) => Ok((url, place)),
        None => Err(Error::Page(format!(
            "{url} is not a Canvas assignment. Open the assignment, or its SpeedGrader, first."
        ))),
    }
}

async fn read_assignment(page: &dyn PageDriver, place: &Place) -> Result<RawAssignment> {
    get(
        page,
        "Canvas would not show the assignment",
        &place.assignment_path(),
        &[],
    )
    .await
}

async fn get<T: DeserializeOwned>(
    page: &dyn PageDriver,
    what: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<T> {
    let args = json!({ "method": "GET", "path": path, "query": query, "form": null });
    decode(send(page, what, args).await?)
}

/// A list, read to its last page.
async fn get_all<T: DeserializeOwned>(
    page: &dyn PageDriver,
    what: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<Vec<T>> {
    let args = json!({
        "method": "GET",
        "path": path,
        "query": query,
        "form": null,
        "all_pages": true,
        "max_pages": MAX_PAGES,
    });
    decode(send(page, what, args).await?)
}

/// Runs one API request in the page. `what` starts the error if it fails.
async fn send(page: &dyn PageDriver, what: &str, args: Value) -> Result<Value> {
    let reply: Reply = eval_as(page, &format!("({API_SCRIPT})({args})")).await?;
    reply
        .into_data()
        .map_err(|why| Error::Page(format!("{what}: {why}")))
}

fn decode<T: DeserializeOwned>(data: Value) -> Result<T> {
    Ok(serde_json::from_value(data)?)
}

/// What the page script reports for one request.
#[derive(Debug, Deserialize)]
struct Reply {
    status: u16,
    /// Whether the body was JSON, now in `data`.
    json: bool,
    #[serde(default)]
    data: Value,
    /// The start of a body that was not JSON.
    text: Option<String>,
    /// Set when no usable answer came back at all.
    problem: Option<String>,
    detail: Option<String>,
}

impl Reply {
    /// The data Canvas sent, or a sentence saying why there is none.
    fn into_data(self) -> std::result::Result<Value, String> {
        let detail = self.detail.as_deref().unwrap_or("no details");
        if let Some(problem) = &self.problem {
            return Err(match problem.as_str() {
                "no_csrf_cookie" => "this page has no _csrf_token cookie from Canvas, so nothing was sent. Reload the Canvas page, log in again if asked, and retry.".to_owned(),
                "network" => format!("Canvas could not be reached ({detail}). If a grade was being saved, check in Canvas whether it arrived."),
                "not_a_web_page" => format!("{detail} is not a page on a Canvas site."),
                "too_many_pages" => format!("the list did not end after {MAX_PAGES} pages, so it was not used."),
                "bad_page_link" => format!("Canvas pointed to the next page of the list at an address that cannot be used ({detail})."),
                "not_a_list" => "Canvas sent something other than a list.".to_owned(),
                other => format!("the request failed ({other}: {detail})."),
            });
        }
        if !(200..300).contains(&self.status) {
            return Err(self.http_failure());
        }
        if !self.json {
            return Err("Canvas sent a web page instead of data. You may be logged out: log in to Canvas in this browser window and try again.".to_owned());
        }
        Ok(self.data)
    }

    fn http_failure(&self) -> String {
        let said = canvas_message(&self.data, self.text.as_deref());
        let throttled = self.status == 429 || said.contains("Rate Limit Exceeded");
        let advice = match self.status {
            _ if throttled => {
                " Canvas is limiting how fast requests arrive; wait a minute and try again."
            }
            401 => {
                " You are not logged in to Canvas in this browser window: log in there and try again."
            }
            403 => {
                " Your Canvas account is not allowed to do this; grading needs a teacher or TA role in the course."
            }
            404 => " The assignment or student may be gone, or not open to your account.",
            422 => " If it keeps happening, reload the Canvas page: the login may have expired.",
            _ => "",
        };
        format!("Canvas answered {} ({said}).{advice}", self.status)
    }
}

/// The reason Canvas gave for refusing. Its error bodies come as
/// `{"errors": [{"message": ..}]}`, `{"errors": {field: ..}}`,
/// `{"error": ".."}` or `{"message": ".."}`.
fn canvas_message(data: &Value, text: Option<&str>) -> String {
    fn collect(value: &Value, into: &mut Vec<String>) {
        match value {
            Value::String(text) => into.push(text.clone()),
            Value::Array(list) => list.iter().for_each(|item| collect(item, into)),
            Value::Object(map) => match map.get("message") {
                Some(Value::String(message)) => match map.get("error_code") {
                    Some(Value::String(code)) => into.push(format!("{message} [{code}]")),
                    _ => into.push(message.clone()),
                },
                _ => {
                    for (name, inner) in map {
                        let mut found = Vec::new();
                        collect(inner, &mut found);
                        into.extend(found.into_iter().map(|text| format!("{name}: {text}")));
                    }
                }
            },
            _ => {}
        }
    }

    let mut reasons = Vec::new();
    for key in ["errors", "error", "message"] {
        if let Some(value) = data.get(key) {
            collect(value, &mut reasons);
        }
    }
    if reasons.is_empty()
        && let Some(text) = text.map(squash).filter(|text| !text.is_empty())
    {
        reasons.push(if text.starts_with('<') {
            "a web page, not an error message".to_owned()
        } else {
            text.chars().take(200).collect()
        });
    }
    if reasons.is_empty() {
        "no reason given".to_owned()
    } else {
        reasons.join("; ")
    }
}

/// An id, which Canvas sends as a string when asked to and as a number otherwise.
fn lenient_id<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<String>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::String(text) => Some(text),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
    .filter(|id| is_id(id)))
}

/// A number, tolerating one sent as text.
fn lenient_number<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<f64>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
    .filter(|number: &f64| number.is_finite()))
}

#[derive(Debug, Deserialize)]
struct RawAssignment {
    name: Option<String>,
    /// An HTML fragment.
    description: Option<String>,
    #[serde(default, deserialize_with = "lenient_number")]
    points_possible: Option<f64>,
    grading_type: Option<String>,
    /// Present only when a rubric is attached.
    rubric: Option<Vec<RawCriterion>>,
    moderated_grading: Option<bool>,
    anonymous_grading: Option<bool>,
    /// Whether Canvas is hiding student identities from this teacher right now.
    anonymize_students: Option<bool>,
    #[serde(default, deserialize_with = "lenient_id")]
    group_category_id: Option<String>,
    grade_group_students_individually: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawCriterion {
    description: Option<String>,
    long_description: Option<String>,
    #[serde(default, deserialize_with = "lenient_number")]
    points: Option<f64>,
    ratings: Option<Vec<RawRating>>,
    ignore_for_scoring: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawRating {
    long_description: Option<String>,
    #[serde(default, deserialize_with = "lenient_number")]
    points: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawUser {
    #[serde(default, deserialize_with = "lenient_id")]
    id: Option<String>,
    name: Option<String>,
    sortable_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawSubmission {
    /// Missing when Canvas describes a student who has no stored submission.
    #[serde(default, deserialize_with = "lenient_id")]
    id: Option<String>,
    #[serde(default, deserialize_with = "lenient_id")]
    user_id: Option<String>,
    #[serde(default, deserialize_with = "lenient_number")]
    score: Option<f64>,
    /// The score as the teacher entered it, before any late penalty. This is
    /// what `submission[posted_grade]` sets, so it is the one compared.
    #[serde(default, deserialize_with = "lenient_number")]
    entered_score: Option<f64>,
    excused: Option<bool>,
    submission_type: Option<String>,
    /// For a text entry, the student's answer as HTML.
    body: Option<String>,
    user: Option<RawUser>,
    submission_comments: Option<Vec<RawComment>>,
}

#[derive(Debug, Deserialize)]
struct RawComment {
    #[serde(default, deserialize_with = "lenient_id")]
    id: Option<String>,
    /// Null when Canvas hides who wrote the comment.
    #[serde(default, deserialize_with = "lenient_id")]
    author_id: Option<String>,
    /// Plain text.
    comment: Option<String>,
    created_at: Option<String>,
}

impl RawAssignment {
    /// Refuses the kinds of assignment a one-student-at-a-time grade cannot
    /// be written to safely.
    fn check_gradable(&self) -> Result<()> {
        let hidden = self
            .anonymize_students
            .or(self.anonymous_grading)
            .unwrap_or(false);
        let why = if hidden {
            "it is graded anonymously, so Canvas hides which student wrote what"
        } else if self.moderated_grading == Some(true) {
            "it uses moderated grading"
        } else if self.group_category_id.is_some()
            && self.grade_group_students_individually != Some(true)
        {
            "it is a group assignment, where one grade goes to every member of a group"
        } else {
            return Ok(());
        };
        Err(Error::Page(format!(
            "OGRE cannot grade this Canvas assignment: {why}. Grade it in SpeedGrader."
        )))
    }

    fn takes_points(&self) -> bool {
        self.grading_type
            .as_deref()
            .is_some_and(|kind| POINT_GRADING_TYPES.contains(&kind))
    }

    /// The assignment as the JSON of an [`ogre_core::Rubric`].
    fn rubric_json(&self) -> Value {
        let prompt = self
            .description
            .as_deref()
            .map(to_markdown)
            .filter(|text| !text.is_empty())
            .map(|text| text.chars().take(PROMPT_LIMIT).collect::<String>());
        let checklist: Vec<Value> = self
            .rubric
            .iter()
            .flatten()
            .filter(|criterion| criterion.ignore_for_scoring != Some(true))
            .enumerate()
            .map(|(index, criterion)| {
                let category = criterion
                    .description
                    .as_deref()
                    .map(readable)
                    .filter(|text| !text.is_empty())
                    .unwrap_or_else(|| format!("Criterion {}", index + 1));
                let items = criterion.requirements(&category);
                json!({ "category": category, "points": criterion.points, "items": items })
            })
            .collect();
        json!({
            "essayPrompt": prompt,
            "maxScore": self.points_possible,
            "checklistItems": checklist,
        })
    }
}

impl RawCriterion {
    /// What a student must do for this criterion. Each entry becomes a
    /// requirement the AI writes feedback for, so the lower rating levels
    /// ("No marks") are left out: only the criterion's own detail and the
    /// description of full-credit work are requirements.
    fn requirements(&self, category: &str) -> Vec<String> {
        let mut items = Vec::new();
        let detail = self.long_description.as_deref().map(readable);
        if let Some(detail) = detail.filter(|text| !text.is_empty()) {
            items.push(detail);
        }
        let best = self
            .ratings
            .iter()
            .flatten()
            .filter(|rating| rating.points.is_some())
            .reduce(|best, rating| {
                if rating.points > best.points {
                    rating
                } else {
                    best
                }
            })
            .and_then(|rating| rating.long_description.as_deref())
            .map(readable);
        if let Some(best) = best.filter(|text| !text.is_empty() && !items.contains(text)) {
            items.push(format!("Full credit: {best}"));
        }
        if items.is_empty() {
            items.push(category.to_owned());
        }
        items
    }
}

impl RawSubmission {
    /// The score a teacher would see in the grade box, or nothing if ungraded.
    fn score_text(&self) -> String {
        self.entered_score
            .or(self.score)
            .map(|score| score.to_string())
            .unwrap_or_default()
    }

    fn comments(&self) -> &[RawComment] {
        self.submission_comments.as_deref().unwrap_or_default()
    }

    /// The newest comment someone other than the student wrote, or nothing.
    fn feedback_text(&self, student: &str) -> String {
        self.comments()
            .iter()
            .enumerate()
            .filter(|(_, comment)| comment.author_id.as_deref() != Some(student))
            .max_by(|(a_at, a), (b_at, b)| a.created_at.cmp(&b.created_at).then(a_at.cmp(b_at)))
            .and_then(|(_, comment)| comment.comment.clone())
            .unwrap_or_default()
    }
}

/// Turns Canvas's submission list into the students OGRE may grade, in name
/// order. Only stored submission records are used, so a student the
/// assignment is not given to never appears.
fn submissions_from(
    place: &Place,
    assignment: &RawAssignment,
    listed: Vec<RawSubmission>,
    test_students: &HashSet<String>,
) -> Result<Vec<Submission>> {
    let mut seen = HashSet::new();
    let mut students = Vec::new();
    for raw in listed {
        let Some(student) = raw.user_id.clone() else {
            return Err(Error::Page(
                "Canvas listed a submission without saying whose it is, so nothing was read."
                    .into(),
            ));
        };
        if raw.id.is_none() || test_students.contains(&student) || !seen.insert(student.clone()) {
            continue;
        }
        let user = raw.user.as_ref();
        let name = user
            .and_then(|user| user.sortable_name.as_deref().or(user.name.as_deref()))
            .map(squash)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("Student {student}"));
        let target = Target {
            place: place.clone(),
            student: student.clone(),
        };
        // An excused student has no grade to give, and a grade would cancel
        // the excusal.
        let scores = if assignment.takes_points() && raw.excused != Some(true) {
            vec![ScoreField {
                field: target.key(SCORE_KEY),
                label: "Score".to_owned(),
                raw: raw.score_text(),
                max: assignment.points_possible,
            }]
        } else {
            Vec::new()
        };
        // Uploads, links, media and missing work have no text to grade.
        let response = match (raw.submission_type.as_deref(), raw.body.as_deref()) {
            (Some("online_text_entry"), Some(body)) => to_markdown(body),
            _ => String::new(),
        };
        students.push(Submission {
            index: 0,
            student_id: Some(student.clone()),
            name,
            scores,
            feedback: Some(FeedbackField {
                field: target.key(COMMENT_KEY),
                kind: FeedbackKind::Textarea,
                text: raw.feedback_text(&student),
            }),
            response,
            prompt: None,
        });
    }
    students.sort_by_cached_key(|s| (s.name.to_lowercase(), s.student_id.clone()));
    for (index, student) in students.iter_mut().enumerate() {
        student.index = index;
    }
    Ok(students)
}

/// Whether the score Canvas holds now is the one that was read.
fn same_score(expected: &str, now: &str) -> bool {
    let (expected, now) = (expected.trim(), now.trim());
    expected == now
        || matches!((expected.parse::<f64>(), now.parse::<f64>()), (Ok(a), Ok(b)) if a == b)
}

/// Converts HTML to markdown, falling back to the raw HTML if it cannot be parsed.
fn to_markdown(html: &str) -> String {
    htmd::convert(html)
        .map(|md| md.trim().to_string())
        .unwrap_or_else(|_| html.trim().to_string())
}

/// Rubric text is normally plain, but rows copied from an outcome hold HTML.
fn readable(text: &str) -> String {
    if text.contains("</") || text.contains("/>") {
        squash(&to_markdown(text))
    } else {
        squash(text)
    }
}

fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn place() -> Place {
        Place {
            course: "7".into(),
            assignment: "42".into(),
        }
    }

    fn assignment(extra: Value) -> RawAssignment {
        let mut base = json!({
            "id": 42,
            "name": "Essay 1",
            "description": "<p>Explain <em>sampling error</em>.</p>",
            "points_possible": 10.0,
            "grading_type": "points",
        });
        if let (Some(base), Some(extra)) = (base.as_object_mut(), extra.as_object()) {
            base.extend(extra.clone());
        }
        serde_json::from_value(base).unwrap()
    }

    fn reply(status: u16, data: Value) -> Reply {
        Reply {
            status,
            json: true,
            data,
            text: None,
            problem: None,
            detail: None,
        }
    }

    #[test]
    fn matches_speedgrader_and_assignment_pages_on_any_host() {
        let site = Canvas;
        for url in [
            "https://school.instructure.com/courses/7/gradebook/speed_grader?assignment_id=42",
            "https://school.instructure.com/courses/7/gradebook/speed_grader?assignment_id=42&student_id=1002",
            "https://canvas.example.edu/courses/7/gradebook/speed_grader?student_id=3&assignment_id=42#x",
            "https://canvas.example.edu/courses/7/assignments/42",
            "https://canvas.example.edu/courses/7/assignments/42/",
            "http://127.0.0.1:3000/courses/7/assignments/42?module_item_id=9",
            "HTTPS://canvas.example.edu/courses/7/assignments/42#submit",
        ] {
            assert!(site.matches(url), "{url}");
        }
        for url in [
            "https://school.instructure.com/courses/7/gradebook/speed_grader",
            "https://school.instructure.com/courses/7/gradebook/speed_grader?student_id=3",
            "https://school.instructure.com/courses/7/gradebook/speed_grader?assignment_id=",
            "https://school.instructure.com/courses/7/gradebook/speed_grader?assignment_id=42&assignment_id=43",
            "https://school.instructure.com/courses/7/gradebook",
            "https://school.instructure.com/courses/7/assignments",
            "https://school.instructure.com/courses/7/assignments/syllabus",
            "https://school.instructure.com/courses/7/assignments/42/edit",
            "https://school.instructure.com/courses/7/assignments/42/submissions/9",
            "https://school.instructure.com/courses/abc/assignments/42",
            "https://school.instructure.com/courses/7/quizzes/42",
            "https://example.com/?next=/courses/7/assignments/42",
            "https://example.com/lms/courses/7/assignments/42",
            "file:///courses/7/assignments/42",
            "/courses/7/assignments/42",
            "https:///courses/7/assignments/42",
            "",
        ] {
            assert!(!site.matches(url), "{url}");
        }
    }

    #[test]
    fn reads_the_ids_from_the_address() {
        assert_eq!(
            Place::from_url(
                "https://x.instructure.com/courses/7/gradebook/speed_grader?assignment_id=42&student_id=9"
            ),
            Some(place())
        );
        assert_eq!(
            Place::from_url("https://x.instructure.com/courses/7/assignments/42"),
            Some(place())
        );
        // An id from another Canvas database keeps its shard prefix.
        let other = Place::from_url("https://x.instructure.com/courses/12~7/assignments/12~42");
        assert_eq!(
            other.map(|p| p.assignment_path()).as_deref(),
            Some("/api/v1/courses/12~7/assignments/12~42")
        );
    }

    #[test]
    fn only_numbers_count_as_ids() {
        for id in ["1", "42", "10000000000042", "12~42"] {
            assert!(is_id(id), "{id}");
        }
        for id in [
            "",
            "abc",
            "4 2",
            "42/../1",
            "-1",
            "4.2",
            "~42",
            "42~",
            "1~2~3",
            "sis_course_id:x",
            "123456789012345678901",
        ] {
            assert!(!is_id(id), "{id}");
        }
    }

    #[test]
    fn field_keys_name_the_student_and_the_assignment() {
        let target = Target {
            place: place(),
            student: "1002".into(),
        };
        assert_eq!(target.key(SCORE_KEY), "canvas:score:7:42:1002");
        assert_eq!(target.key(COMMENT_KEY), "canvas:comment:7:42:1002");
        assert_eq!(
            Target::parse("canvas:score:7:42:1002", SCORE_KEY),
            Some(target.clone())
        );
        assert_eq!(
            Target::parse("canvas:comment:7:42:1002", COMMENT_KEY),
            Some(target)
        );
        for field in [
            "canvas:comment:7:42:1002",
            "canvas:score:7:42",
            "canvas:score:7:42:1002:1",
            "canvas:score:7:42:../1",
            "canvas:score:7:42:",
            "ud-1002-0-2-0",
            "",
        ] {
            assert_eq!(Target::parse(field, SCORE_KEY), None, "{field}");
        }
    }

    #[test]
    fn maps_each_kind_of_submission() {
        // Ids as numbers, the way Canvas sends them when not asked for strings.
        let listed: Vec<RawSubmission> = serde_json::from_value(json!([
            {
                "id": 501, "user_id": 1002, "score": null, "entered_score": null,
                "submission_type": "online_text_entry",
                "body": "<p>Bigger samples have <strong>less</strong> error.</p>",
                "user": { "id": 1002, "name": "Kai Brook", "sortable_name": "Brook, Kai" },
                "submission_comments": [
                    { "id": 1, "author_id": 1002, "comment": "Sorry it is late.", "created_at": "2026-03-01T10:00:00Z" }
                ]
            },
            {
                "id": 502, "user_id": 1001, "score": 7.2, "entered_score": 8.0,
                "submission_type": "online_text_entry", "body": "<p>Done.</p>",
                "user": { "id": 1001, "name": "Sam Avery", "sortable_name": "Avery, Sam" },
                "submission_comments": [
                    { "id": 2, "author_id": 9, "comment": "First.", "created_at": "2026-03-01T10:00:00Z" },
                    { "id": 3, "author_id": 9, "comment": "See me.", "created_at": "2026-03-03T10:00:00Z" },
                    { "id": 4, "author_id": 1001, "comment": "OK!", "created_at": "2026-03-04T10:00:00Z" }
                ]
            },
            {
                "id": 503, "user_id": 1003, "score": null, "submission_type": "online_upload",
                "body": null, "user": { "id": 1003, "name": "Pat Diaz", "sortable_name": "Diaz, Pat" }
            },
            {
                "id": 504, "user_id": 1004, "score": null, "submission_type": null,
                "workflow_state": "unsubmitted", "user": { "id": 1004, "sortable_name": "Evans, Rey" }
            },
            {
                "id": 505, "user_id": 1005, "score": null, "excused": true,
                "submission_type": "online_text_entry", "body": "<p>x</p>",
                "user": { "id": 1005, "sortable_name": "Ford, Lee" }
            },
            {
                "id": 506, "user_id": 1999, "score": null, "submission_type": "online_text_entry",
                "body": "<p>test</p>", "user": { "id": 1999, "sortable_name": "Student, Test" }
            },
            // Canvas describing a student who has no stored record.
            { "id": null, "user_id": 1006, "score": null, "user": { "id": 1006, "sortable_name": "Gray, Sam" } },
            // The same student twice.
            { "id": 507, "user_id": 1003, "score": 3, "user": { "id": 1003, "sortable_name": "Diaz, Pat" } }
        ]))
        .unwrap();
        let test_students = HashSet::from(["1999".to_owned()]);

        let students =
            submissions_from(&place(), &assignment(json!({})), listed, &test_students).unwrap();
        let names: Vec<_> = students.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "Avery, Sam",
                "Brook, Kai",
                "Diaz, Pat",
                "Evans, Rey",
                "Ford, Lee"
            ]
        );
        assert_eq!(
            students.iter().map(|s| s.index).collect::<Vec<_>>(),
            [0, 1, 2, 3, 4]
        );

        let sam = &students[0];
        assert_eq!(sam.student_id.as_deref(), Some("1001"));
        assert_eq!(sam.scores.len(), 1);
        assert_eq!(sam.scores[0].field, "canvas:score:7:42:1001");
        assert_eq!(
            sam.scores[0].raw, "8",
            "the entered score, before the late penalty"
        );
        assert_eq!(sam.scores[0].max, Some(10.0));
        assert!(sam.has_nonzero_score());
        let feedback = sam.feedback.as_ref().unwrap();
        assert_eq!(feedback.field, "canvas:comment:7:42:1001");
        assert_eq!(feedback.kind, FeedbackKind::Textarea);
        assert_eq!(feedback.text, "See me.");
        assert_eq!(sam.response, "Done.");

        let kai = &students[1];
        assert_eq!(kai.scores[0].raw, "");
        assert_eq!(kai.response, "Bigger samples have **less** error.");
        assert!(
            !kai.has_feedback(),
            "a student's own comment is not feedback"
        );

        assert_eq!(students[2].response, "", "an upload has no text");
        assert_eq!(students[2].scores[0].raw, "");
        assert_eq!(students[3].response, "", "nothing was handed in");
        assert_eq!(students[3].scores.len(), 1);
        assert!(
            students[4].scores.is_empty(),
            "an excused student has no score box"
        );
    }

    #[test]
    fn a_submission_without_a_student_stops_the_read() {
        let listed: Vec<RawSubmission> =
            serde_json::from_value(json!([{ "id": 1, "anonymous_id": "acJ4Q" }])).unwrap();
        let err = submissions_from(&place(), &assignment(json!({})), listed, &HashSet::new())
            .unwrap_err();
        assert!(matches!(err, Error::Page(_)), "{err:?}");
    }

    #[test]
    fn assignments_without_point_grades_have_no_score_boxes() {
        for kind in ["pass_fail", "not_graded", "something_new"] {
            let listed: Vec<RawSubmission> = serde_json::from_value(json!([
                { "id": 1, "user_id": "1001", "user": { "sortable_name": "Avery, Sam" } }
            ]))
            .unwrap();
            let students = submissions_from(
                &place(),
                &assignment(json!({ "grading_type": kind })),
                listed,
                &HashSet::new(),
            )
            .unwrap();
            assert!(students[0].scores.is_empty(), "{kind}");
        }
    }

    #[test]
    fn refuses_assignments_it_cannot_grade_one_student_at_a_time() {
        assert!(assignment(json!({})).check_gradable().is_ok());
        assert!(
            assignment(
                json!({ "group_category_id": "5", "grade_group_students_individually": true })
            )
            .check_gradable()
            .is_ok()
        );
        // Anonymous, but every grade is posted, so names are shown again.
        assert!(
            assignment(json!({ "anonymous_grading": true, "anonymize_students": false }))
                .check_gradable()
                .is_ok()
        );
        for (extra, word) in [
            (json!({ "anonymize_students": true }), "anonymously"),
            (json!({ "anonymous_grading": true }), "anonymously"),
            (json!({ "moderated_grading": true }), "moderated"),
            (
                json!({ "group_category_id": 5, "grade_group_students_individually": false }),
                "group",
            ),
        ] {
            let err = assignment(extra).check_gradable().unwrap_err();
            assert!(
                matches!(&err, Error::Page(m) if m.contains(word)),
                "{err:?}"
            );
        }
    }

    #[test]
    fn maps_the_assignment_to_a_rubric() {
        let raw = assignment(json!({
            "rubric": [
                {
                    "id": "c1", "points": 6, "description": "Thesis",
                    "long_description": "States a clear,\n arguable claim.",
                    "ratings": [
                        { "id": "r1", "points": 6, "description": "Full Marks", "long_description": "Claim is specific and contestable." },
                        { "id": "r2", "points": 0, "description": "No Marks", "long_description": "No claim." }
                    ]
                },
                {
                    "id": "c2", "points": 4, "description": "Evidence", "long_description": "",
                    "ratings": [
                        { "id": "r3", "points": 0, "description": "No Marks", "long_description": "" },
                        { "id": "r4", "points": 4, "description": "Full Marks", "long_description": "" }
                    ]
                },
                { "id": "c3", "points": 3, "description": "Outcome row", "ignore_for_scoring": true, "ratings": [] }
            ]
        }));
        let rubric: Rubric = serde_json::from_value(raw.rubric_json()).unwrap();
        assert_eq!(
            rubric.essay_prompt.as_deref(),
            Some("Explain *sampling error*.")
        );
        assert_eq!(rubric.max_score_value(), 10.0);
        assert_eq!(rubric.checklist_items.len(), 2);
        let thesis = &rubric.checklist_items[0];
        assert_eq!(thesis.category.as_deref(), Some("Thesis"));
        assert_eq!(thesis.points, Some(6.0));
        assert_eq!(
            thesis.items,
            [
                "States a clear, arguable claim.",
                "Full credit: Claim is specific and contestable."
            ]
        );
        let evidence = &rubric.checklist_items[1];
        assert_eq!(evidence.points, Some(4.0));
        assert_eq!(evidence.items, ["Evidence"]);
        assert!(rubric.rubric_items.is_empty());
        assert_eq!(rubric.model_text, None);
    }

    #[test]
    fn an_assignment_without_a_rubric_or_description_still_maps() {
        let raw: RawAssignment = serde_json::from_value(json!({
            "name": "Quick write", "description": null, "points_possible": 25, "grading_type": "points"
        }))
        .unwrap();
        let rubric: Rubric = serde_json::from_value(raw.rubric_json()).unwrap();
        assert_eq!(rubric.essay_prompt, None);
        assert_eq!(rubric.max_score_value(), 25.0);
        assert!(rubric.checklist_items.is_empty());

        let long = assignment(json!({ "description": format!("<p>{}</p>", "word ".repeat(600)) }));
        let rubric: Rubric = serde_json::from_value(long.rubric_json()).unwrap();
        assert_eq!(rubric.essay_prompt.map(|p| p.chars().count()), Some(1500));
    }

    #[test]
    fn scores_compare_as_numbers() {
        assert!(same_score("", ""));
        assert!(same_score(" 8 ", "8"));
        assert!(same_score("8.0", "8"));
        assert!(!same_score("", "0"));
        assert!(!same_score("8", ""));
        assert!(!same_score("8", "8.5"));
    }

    #[test]
    fn an_http_failure_names_the_status_and_what_canvas_said() {
        let unauthenticated = reply(
            401,
            json!({ "status": "unauthenticated", "errors": [{ "message": "user authorization required" }] }),
        );
        let why = unauthenticated.into_data().unwrap_err();
        assert!(
            why.contains("401") && why.contains("user authorization required"),
            "{why}"
        );
        assert!(why.contains("log in"), "{why}");

        let forbidden = reply(
            403,
            json!({ "status": "unauthorized", "errors": [{ "message": "user not authorized to perform that action" }] }),
        );
        let why = forbidden.into_data().unwrap_err();
        assert!(why.contains("403") && why.contains("not allowed"), "{why}");

        let forged = reply(
            422,
            json!({ "errors": [{ "message": "An error occurred.", "error_code": "unprocessable_entity" }] }),
        );
        let why = forged.into_data().unwrap_err();
        assert!(
            why.contains("422") && why.contains("An error occurred. [unprocessable_entity]"),
            "{why}"
        );

        let throttled = Reply {
            json: false,
            text: Some("403 Forbidden (Rate Limit Exceeded)".into()),
            ..reply(403, Value::Null)
        };
        let why = throttled.into_data().unwrap_err();
        assert!(
            why.contains("limiting") && !why.contains("teacher"),
            "{why}"
        );
    }

    #[test]
    fn reads_every_shape_of_canvas_error_body() {
        assert_eq!(
            canvas_message(&json!({ "error": "Student is required" }), None),
            "Student is required"
        );
        assert_eq!(
            canvas_message(&json!({ "message": "invalid rubric_assessment" }), None),
            "invalid rubric_assessment"
        );
        assert_eq!(
            canvas_message(
                &json!({ "errors": { "base": "Unexpected error, ID: 5" } }),
                None
            ),
            "base: Unexpected error, ID: 5"
        );
        assert_eq!(
            canvas_message(
                &json!({ "errors": { "grade": [{ "attribute": "grade", "type": "invalid", "message": "is not a number" }] } }),
                None
            ),
            "grade: is not a number"
        );
        assert_eq!(
            canvas_message(&Value::Null, Some("<!DOCTYPE html><html>...")),
            "a web page, not an error message"
        );
        assert_eq!(
            canvas_message(&Value::Null, Some("  Bad\n Gateway ")),
            "Bad Gateway"
        );
        assert_eq!(canvas_message(&json!({}), None), "no reason given");
    }

    #[test]
    fn a_reply_that_is_not_data_is_an_error() {
        let page = Reply {
            json: false,
            text: Some("<html>Log in</html>".into()),
            ..reply(200, Value::Null)
        };
        assert!(page.into_data().unwrap_err().contains("web page"));

        let no_cookie = Reply {
            problem: Some("no_csrf_cookie".into()),
            ..reply(0, Value::Null)
        };
        assert!(no_cookie.into_data().unwrap_err().contains("_csrf_token"));

        assert_eq!(
            reply(200, json!({ "id": "1" })).into_data(),
            Ok(json!({ "id": "1" }))
        );
    }
}
