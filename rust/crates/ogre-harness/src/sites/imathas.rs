//! IMathAS, the software behind MyOpenMath: the "grade all" page for one question.

use async_trait::async_trait;
use ogre_core::{
    FeedbackField, GradeWrite, GradingPage, Position, QuestionLink, Rubric, ScoreField, Submission,
    format_score,
};
use serde::Deserialize;
use serde_json::json;

use super::{SiteAdapter, WriteReceipt};
use crate::driver::eval_as;
use crate::{Error, PageDriver, Result, feedback};

const EXTRACT_SCRIPT: &str = include_str!("imathas_extract.js");
const RUBRIC_SCRIPT: &str = include_str!("imathas_rubric.js");
const WRITE_SCRIPT: &str = include_str!("imathas_write.js");
const SAVE_SCRIPT: &str = include_str!("imathas_save.js");
const QUESTIONS_SCRIPT: &str = include_str!("imathas_questions.js");

/// How long to wait for the site to confirm a save.
const SAVE_TIMEOUT_MS: u32 = 30_000;
/// Prompts longer than this are cut, as the grading prompts expect.
const PROMPT_LIMIT: usize = 1500;

pub struct IMathAs;

#[async_trait]
impl SiteAdapter for IMathAs {
    fn name(&self) -> &'static str {
        "MyOpenMath"
    }

    fn matches(&self, url: &str) -> bool {
        let path = url.split(['?', '#']).next().unwrap_or(url);
        path.ends_with("/gradeallq2.php")
    }

    async fn read_page(&self, page: &dyn PageDriver) -> Result<GradingPage> {
        let raw: RawPage = eval_as(page, EXTRACT_SCRIPT).await?;
        if raw.submissions.is_empty() && raw.sign_in {
            return Err(Error::Page(format!(
                "{} is asking you to sign in. Sign in in the OGRE Chrome window, then read \
                 the students again.",
                self.name()
            )));
        }
        if raw.submissions.is_empty() {
            return Err(Error::Page(format!(
                "No student work found at {}. Open a question's \"Grade all\" page first.",
                raw.url
            )));
        }
        Ok(raw.into())
    }

    /// The rubric is read from the first student's copy of the question.
    async fn read_rubric(&self, page: &dyn PageDriver) -> Result<Rubric> {
        read_rubric_from(page, 0).await
    }

    async fn write_grade(&self, page: &dyn PageDriver, write: &GradeWrite) -> Result<WriteReceipt> {
        let feedback = write.feedback.as_ref().map(|f| {
            json!({
                "field": f.field,
                "html": feedback::safe_html(&f.html),
                "text": feedback::plain_text(&f.html),
            })
        });
        let args = json!({
            "score": {
                "field": write.score.field,
                "expected": write.score.expected,
                "value": format_score(write.score.value),
            },
            "feedback": feedback,
        });
        let outcome: WriteOutcome = eval_as(page, &call(WRITE_SCRIPT, &args)).await?;
        if !outcome.ok {
            return Err(Error::Page(format!(
                "{}: {}",
                write.name,
                outcome.error.unwrap_or_else(|| "the write failed".into())
            )));
        }
        Ok(WriteReceipt {
            score: outcome.score.unwrap_or_default(),
            feedback_text: outcome.feedback_text,
        })
    }

    fn saves_on_write(&self) -> bool {
        false
    }

    async fn save(&self, page: &dyn PageDriver) -> Result<()> {
        let outcome: SaveOutcome =
            eval_as(page, &call(SAVE_SCRIPT, &json!(SAVE_TIMEOUT_MS))).await?;
        if outcome.ok {
            Ok(())
        } else {
            Err(Error::Page(format!(
                "Quick Save failed: {}",
                outcome.error.unwrap_or_else(|| "no reason given".into())
            )))
        }
    }

    async fn questions(&self, page: &dyn PageDriver) -> Result<Vec<QuestionLink>> {
        let questions: Vec<QuestionLink> = eval_as(page, QUESTIONS_SCRIPT).await?;
        // A list that does not hold this page's question cannot say what
        // comes before or after it.
        Ok(if questions.iter().any(|q| q.current) {
            questions
        } else {
            Vec::new()
        })
    }
}

/// Reads the rubric from the copy of the question shown to the student at
/// `student_index`. Questions with randomized versions differ per student.
pub async fn read_rubric_from(page: &dyn PageDriver, student_index: usize) -> Result<Rubric> {
    let raw: Option<RawRubric> = eval_as(page, &call(RUBRIC_SCRIPT, &json!(student_index))).await?;
    let raw = raw.ok_or_else(|| {
        Error::Page(format!(
            "There is no student number {} on this page.",
            student_index + 1
        ))
    })?;

    let prompt: Vec<String> = raw
        .prompt_html
        .iter()
        .map(|html| to_markdown(html))
        .filter(|text| !text.is_empty())
        .collect();
    let prompt: String = prompt.join(" ").chars().take(PROMPT_LIMIT).collect();
    let model_text = raw
        .model_text
        .or_else(|| raw.model_html.as_deref().map(to_markdown))
        .filter(|text| !text.is_empty());

    // Built as JSON so the rubric decodes exactly like one saved by the app.
    Ok(serde_json::from_value(json!({
        "essayPrompt": prompt,
        "checklistItems": raw.checklist_items,
        "rubricItems": raw.rubric_items,
        "modelText": model_text,
        "maxScore": raw.max_score,
    }))?)
}

/// Builds the expression that calls a script's function with `args`.
fn call(function: &str, args: &serde_json::Value) -> String {
    format!("({function})({args})")
}

#[derive(Deserialize)]
struct RawPage {
    url: String,
    title: String,
    position: Option<Position>,
    /// The page holds a password box: the site wants a sign-in.
    #[serde(default)]
    sign_in: bool,
    submissions: Vec<RawSubmission>,
}

#[derive(Deserialize)]
struct RawSubmission {
    index: usize,
    student_id: Option<String>,
    name: String,
    scores: Vec<ScoreField>,
    feedback: Option<FeedbackField>,
    response_html: String,
    prompt_html: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRubric {
    prompt_html: Vec<String>,
    checklist_items: serde_json::Value,
    rubric_items: serde_json::Value,
    model_text: Option<String>,
    model_html: Option<String>,
    max_score: Option<f64>,
}

#[derive(Deserialize)]
struct WriteOutcome {
    ok: bool,
    error: Option<String>,
    score: Option<String>,
    feedback_text: Option<String>,
}

#[derive(Deserialize)]
struct SaveOutcome {
    ok: bool,
    error: Option<String>,
}

impl From<RawPage> for GradingPage {
    fn from(raw: RawPage) -> Self {
        Self {
            url: raw.url,
            title: raw.title,
            position: raw.position,
            submissions: raw.submissions.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<RawSubmission> for Submission {
    fn from(raw: RawSubmission) -> Self {
        Self {
            index: raw.index,
            student_id: raw.student_id,
            name: raw.name,
            scores: raw.scores,
            feedback: raw.feedback,
            response: to_markdown(&raw.response_html),
            prompt: raw
                .prompt_html
                .map(|html| to_markdown(&html))
                .filter(|md| !md.is_empty()),
        }
    }
}

/// Converts page HTML to markdown, falling back to the raw HTML if it cannot be parsed.
fn to_markdown(html: &str) -> String {
    htmd::convert(html)
        .map(|md| md.trim().to_string())
        .unwrap_or_else(|_| html.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_only_the_grade_all_page() {
        let site = IMathAs;
        assert!(
            site.matches(
                "https://www.myopenmath.com/course/gradeallq2.php?stu=0&cid=1&aid=2&qid=3"
            )
        );
        assert!(site.matches("https://imathas.example.edu/course/gradeallq2.php"));
        assert!(!site.matches("https://www.myopenmath.com/course/gradebook.php?cid=1"));
        assert!(!site.matches("https://example.com/?next=/course/gradeallq2.php"));
    }

    #[test]
    fn html_becomes_markdown() {
        assert_eq!(
            to_markdown("<p>Larger samples shrink the <strong>standard error</strong>.</p>"),
            "Larger samples shrink the **standard error**."
        );
        assert_eq!(to_markdown(""), "");
    }

    #[test]
    fn a_call_passes_its_arguments_as_json() {
        assert_eq!(
            call("(a) => a", &json!({"name": "O'Brien \"x\" </script>"})),
            r#"((a) => a)({"name":"O'Brien \"x\" </script>"})"#
        );
    }
}
