//! Reading and filling a grading page that is described by a profile.

use std::collections::BTreeSet;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use async_trait::async_trait;
use ogre_core::{
    FeedbackField, GradeWrite, GradingPage, MaxScore, Rubric, ScoreField, Submission, format_score,
};
use serde::Deserialize;
use serde_json::json;

use super::inspect::{self, Inspection, Student, call};
use super::profile::SiteProfile;
use super::validate::{self, ValidatedProfile};
use crate::driver::eval_as;
use crate::sites::{SiteAdapter, WriteReceipt};
use crate::{Error, PageDriver, Result, feedback};

const WRITE_SCRIPT: &str = include_str!("write.js");
const SAVE_SCRIPT: &str = include_str!("save.js");

/// How long to wait for the site to confirm a save.
const SAVE_TIMEOUT: Duration = Duration::from_secs(30);
/// Prompts longer than this are cut, as the grading prompts expect.
const PROMPT_LIMIT: usize = 1500;

/// A [`SiteAdapter`] for a site OGRE was taught by a [`SiteProfile`].
///
/// It can only be made from a profile that passed validation, and it checks
/// the profile against the page again on every read: sites change, and a
/// profile that no longer fits must stop the run rather than read the wrong
/// boxes.
///
/// A profile without a student section describes a page that shows one
/// student at a time. Such a page is read and written for the student it
/// shows; moving to the next student is not done here.
pub struct ProfileAdapter {
    profile: SiteProfile,
    name: &'static str,
    save_timeout: Duration,
}

impl ProfileAdapter {
    pub fn new(profile: ValidatedProfile) -> Self {
        let profile = profile.into_profile();
        Self {
            name: interned(&profile.name),
            profile,
            save_timeout: SAVE_TIMEOUT,
        }
    }

    /// Changes how long [`SiteAdapter::save`] waits for the site's confirmation.
    pub fn with_save_timeout(mut self, timeout: Duration) -> Self {
        self.save_timeout = timeout;
        self
    }

    pub fn profile(&self) -> &SiteProfile {
        &self.profile
    }

    /// Looks the profile up on the page and refuses a page it does not fit.
    async fn inspect(&self, page: &dyn PageDriver) -> Result<Inspection> {
        let found = inspect::inspect(page, &self.profile.page).await?;
        let report = validate::report(&self.profile, &found);
        if report.passed() {
            Ok(found)
        } else {
            Err(Error::Page(format!(
                "The page at {} does not fit the site profile \"{}\":\n{}",
                found.url,
                self.profile.name,
                report.error_summary()
            )))
        }
    }
}

/// [`SiteAdapter::name`] hands out a `&'static str`, but a profile's name is
/// only known at run time. Each distinct name is kept for the life of the
/// program, once.
fn interned(name: &str) -> &'static str {
    static NAMES: Mutex<BTreeSet<&'static str>> = Mutex::new(BTreeSet::new());
    let mut names = NAMES.lock().unwrap_or_else(PoisonError::into_inner);
    match names.get(name) {
        Some(known) => known,
        None => {
            let kept: &'static str = Box::leak(name.to_owned().into_boxed_str());
            names.insert(kept);
            kept
        }
    }
}

#[async_trait]
impl SiteAdapter for ProfileAdapter {
    fn name(&self) -> &'static str {
        self.name
    }

    fn matches(&self, url: &str) -> bool {
        self.profile.url.matches(url)
    }

    async fn read_page(&self, page: &dyn PageDriver) -> Result<GradingPage> {
        let found = self.inspect(page).await?;
        Ok(GradingPage {
            url: found.url,
            title: found.title,
            position: None,
            submissions: found.students.iter().map(submission).collect(),
        })
    }

    /// The question's prompt, where the profile maps one, and what it is out
    /// of, both as shown to the first student. A profile cannot describe a
    /// checklist, so the rubric has none.
    async fn read_rubric(&self, page: &dyn PageDriver) -> Result<Rubric> {
        let found = self.inspect(page).await?;
        let first = found.students.first();
        let prompt = first
            .and_then(|s| s.prompt.as_ref())
            .map(|prompt| prompt.markdown())
            .filter(|text| !text.is_empty())
            .map(|text| text.chars().take(PROMPT_LIMIT).collect());
        let max = first.and_then(|s| s.max.as_ref()).and_then(|max| max.value);
        Ok(Rubric {
            essay_prompt: prompt,
            max_score: max.map(MaxScore::Number),
            ..Rubric::default()
        })
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
            "name": write.name,
            "score": {
                "field": write.score.field,
                "expected": write.score.expected,
                "value": format_score(write.score.value),
            },
            "feedback": feedback,
        });
        let outcome: WriteOutcome =
            eval_as(page, &call(WRITE_SCRIPT, &self.profile.page, &args)?).await?;
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

    /// Clicks the profile's save button and waits for the confirmation the
    /// profile describes. A profile that cannot tell a finished save from a
    /// failed one is never used to click anything.
    async fn save(&self, page: &dyn PageDriver) -> Result<()> {
        let recognizable = self
            .profile
            .page
            .save
            .as_ref()
            .is_some_and(|save| save.success.is_some());
        if !recognizable {
            return Err(Error::Page(format!(
                "The site profile \"{}\" does not say how a finished save looks, so OGRE has not saved anything. Save in the browser yourself.",
                self.profile.name
            )));
        }
        let timeout = u64::try_from(self.save_timeout.as_millis()).unwrap_or(u64::MAX);
        let outcome: SaveOutcome = eval_as(
            page,
            &call(SAVE_SCRIPT, &self.profile.page, &json!(timeout))?,
        )
        .await?;
        if outcome.ok {
            Ok(())
        } else {
            Err(Error::Page(format!(
                "Saving failed: {}. Check the page and save in the browser yourself.",
                outcome.error.unwrap_or_else(|| "no reason given".into())
            )))
        }
    }
}

fn submission(student: &Student) -> Submission {
    let score = &student.score;
    let scores = match (&score.field, score.count) {
        (Some(field), 1) => vec![ScoreField {
            field: field.clone(),
            label: score.label.clone().unwrap_or_default(),
            raw: score.raw.clone().unwrap_or_default(),
            max: student.max.as_ref().and_then(|max| max.value),
        }],
        _ => Vec::new(),
    };
    let feedback = student.feedback.as_ref().and_then(|found| {
        Some(FeedbackField {
            field: found.field.clone()?,
            kind: found.kind?,
            text: found.text.clone().unwrap_or_default(),
        })
    });
    Submission {
        index: student.index,
        student_id: student.student_id.clone(),
        name: student.name.text.clone(),
        scores,
        feedback,
        response: student.response.markdown(),
        prompt: student
            .prompt
            .as_ref()
            .map(|prompt| prompt.markdown())
            .filter(|text| !text.is_empty()),
    }
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

#[cfg(test)]
mod tests {
    use ogre_core::FeedbackKind;
    use serde_json::json;

    use super::super::inspect::testing::{decode, inspection, student};
    use super::*;

    #[test]
    fn a_student_becomes_a_submission_with_the_boxes_to_write() {
        let mut raw = student(4, "Brook, Kai");
        raw["score"]["raw"] = json!("3.5");
        raw["feedback"]["text"] = json!("See me.");
        raw["response"]["html"] = json!("<p>Larger samples shrink the <strong>error</strong>.</p>");
        raw["prompt"] = json!({ "count": 1, "invalid": false, "html": "<p>Explain.</p>" });
        let page = decode(inspection(vec![raw]));

        let read = submission(&page.students[0]);
        assert_eq!(read.index, 4);
        assert_eq!(read.student_id.as_deref(), Some("s4"));
        assert_eq!(read.name, "Brook, Kai");
        assert_eq!(read.score(), Some(3.5));
        assert_eq!(read.max_score(), Some(10.0));
        assert_eq!(read.scores[0].field, "name:score_4");
        let feedback = read.feedback.expect("feedback box");
        assert_eq!(feedback.field, "name:fb_4");
        assert_eq!(feedback.kind, FeedbackKind::Textarea);
        assert_eq!(feedback.text, "See me.");
        assert_eq!(read.response, "Larger samples shrink the **error**.");
        assert_eq!(read.prompt.as_deref(), Some("Explain."));
    }

    #[test]
    fn a_student_without_boxes_has_nothing_to_write() {
        let mut raw = student(0, "Avery, Sam");
        raw["score"] = json!({ "count": 0, "invalid": false });
        raw["max"] = serde_json::Value::Null;
        raw["feedback"] = json!({ "count": 0, "invalid": false });
        raw["response"] = json!({ "count": 0, "invalid": false });
        let page = decode(inspection(vec![raw]));

        let read = submission(&page.students[0]);
        assert!(read.scores.is_empty());
        assert_eq!(read.feedback, None);
        assert_eq!(read.response, "");
        assert_eq!(read.prompt, None);
    }

    #[test]
    fn a_name_is_kept_once_however_often_it_is_asked_for() {
        let first = interned("Example LMS (interning test)");
        let second = interned(&String::from("Example LMS (interning test)"));
        assert_eq!(first, "Example LMS (interning test)");
        assert!(std::ptr::eq(first, second));
    }
}
