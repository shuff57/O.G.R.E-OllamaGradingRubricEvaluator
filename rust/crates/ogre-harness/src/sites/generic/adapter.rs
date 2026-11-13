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
use super::walk::{Route, Walker, field_of, place_and_field};
use crate::driver::eval_as;
use crate::sites::{SiteAdapter, WriteReceipt};
use crate::{Error, PageDriver, Result, feedback};

const WRITE_SCRIPT: &str = include_str!("write.js");
const SAVE_SCRIPT: &str = include_str!("save.js");

/// How long to wait for the site to confirm a save.
const SAVE_TIMEOUT: Duration = Duration::from_secs(30);
/// How long another student may take to show on a site that shows one at a
/// time. After the last student this is waited out once, where the site
/// leaves its button to the next one in place.
const SETTLE_TIME: Duration = Duration::from_secs(8);
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
/// student at a time. Where it maps the button to the next student, every
/// student from the one shown to the last is read, and each grade is saved
/// as it is written, because moving on would lose it. Without that button
/// the page is read and written for the student it shows.
pub struct ProfileAdapter {
    profile: SiteProfile,
    name: &'static str,
    save_timeout: Duration,
    settle_time: Duration,
    /// The students of the last read of a site that shows one at a time.
    route: Mutex<Option<Route>>,
}

impl ProfileAdapter {
    pub fn new(profile: ValidatedProfile) -> Self {
        let profile = profile.into_profile();
        Self {
            name: interned(&profile.name),
            profile,
            save_timeout: SAVE_TIMEOUT,
            settle_time: SETTLE_TIME,
            route: Mutex::new(None),
        }
    }

    /// Changes how long another student may take to show.
    pub fn with_settle_time(mut self, time: Duration) -> Self {
        self.settle_time = time;
        self
    }

    fn walker(&self) -> Walker<'_> {
        Walker {
            profile: &self.profile,
            settle: self.settle_time,
        }
    }

    fn route(&self) -> Option<Route> {
        self.route
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn keep_route(&self, route: Option<Route>) {
        *self.route.lock().unwrap_or_else(PoisonError::into_inner) = route;
    }

    /// True if the profile says how a finished save looks.
    fn confirms_saves(&self) -> bool {
        self.profile
            .page
            .save
            .as_ref()
            .is_some_and(|save| save.success.is_some())
    }

    /// Shows the student a write is for, on a site that shows one at a time,
    /// and gives the write with its boxes named as that page names them.
    async fn show_student_of(
        &self,
        page: &dyn PageDriver,
        write: &GradeWrite,
    ) -> Result<GradeWrite> {
        let unknown = || {
            Error::Page(format!(
                "{}: OGRE no longer knows where this student is. Read the students again.",
                write.name
            ))
        };
        let (at, score_field) = place_and_field(&write.score.field).ok_or_else(unknown)?;
        let mut route = self.route().ok_or_else(unknown)?;
        let went = self.walker().go_to(page, &mut route, at).await;
        self.keep_route(Some(route));
        went?;
        let mut here = write.clone();
        here.score.field = score_field.to_owned();
        if let Some(feedback) = &mut here.feedback
            && let Some((_, field)) = place_and_field(&feedback.field)
        {
            feedback.field = field.to_owned();
        }
        Ok(here)
    }

    /// Puts a grade into the page as it stands. Saves nothing.
    async fn fill(&self, page: &dyn PageDriver, write: &GradeWrite) -> Result<WriteReceipt> {
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

    /// Clicks the save button and waits for the site to confirm.
    async fn click_save(&self, page: &dyn PageDriver) -> Result<()> {
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
        if !self.profile.page.steps_through_students() {
            return Ok(GradingPage {
                url: found.url,
                title: found.title,
                position: None,
                submissions: found.students.iter().map(submission).collect(),
            });
        }

        // Reading the same students again starts where the first read did,
        // not at whichever of them was written last.
        let walker = self.walker();
        let found = match self.route() {
            Some(mut route) => walker
                .back_to_first(page, &mut route)
                .await
                .unwrap_or(found),
            None => found,
        };
        let (url, title) = (found.url.clone(), found.title.clone());
        self.keep_route(None);
        let met = walker.everyone(page, found).await?;
        let submissions = met
            .iter()
            .enumerate()
            .filter_map(|(at, (shown, _))| Some(student_at(at, shown.students.first()?)))
            .collect();
        let mut route = Route::new(met.into_iter().map(|(_, stop)| stop).collect());
        // Back to where the teacher was. A site that will not go back is
        // still read; it is a write that then says so.
        let _ = walker.go_to(page, &mut route, 0).await;
        self.keep_route(Some(route));
        Ok(GradingPage {
            url,
            title,
            position: None,
            submissions,
        })
    }

    async fn read_back(
        &self,
        page: &dyn PageDriver,
        written: &[(GradeWrite, WriteReceipt)],
    ) -> Result<GradingPage> {
        if !self.profile.page.steps_through_students() {
            return self.read_page(page).await;
        }
        let mut submissions = Vec::new();
        let mut shown = None;
        for (write, _) in written {
            let Some((at, _)) = place_and_field(&write.score.field) else {
                continue;
            };
            let Some(mut route) = self.route() else {
                continue;
            };
            let went = self.walker().go_to(page, &mut route, at).await;
            self.keep_route(Some(route));
            let found = went?;
            if let Some(student) = found.students.first() {
                submissions.push(student_at(at, student));
            }
            shown = Some((found.url, found.title));
        }
        let (url, title) = shown.unwrap_or_default();
        Ok(GradingPage {
            url,
            title,
            position: None,
            submissions,
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
        if !self.profile.page.steps_through_students() {
            return self.fill(page, write).await;
        }
        // Moving to the next student would lose a grade that is only filled
        // in, so nothing is filled in that cannot then be saved.
        if !self.confirms_saves() {
            return Err(Error::Page(format!(
                "{}: this site shows one student at a time, so a grade has to be saved before \
                 OGRE moves on, and the site profile \"{}\" does not say how a finished save \
                 looks. Nothing was written. Put that right on the Sites screen.",
                write.name, self.profile.name
            )));
        }
        let here = self.show_student_of(page, write).await?;
        let receipt = self.fill(page, &here).await?;
        self.click_save(page).await.map_err(|error| match error {
            Error::Page(reason) => Error::Page(format!("{}: {reason}", write.name)),
            other => other,
        })?;
        Ok(receipt)
    }

    /// True for a site that shows one student at a time: each grade is
    /// saved before the next student is shown.
    fn saves_on_write(&self) -> bool {
        self.profile.page.steps_through_students()
    }

    /// Clicks the profile's save button and waits for the confirmation the
    /// profile describes. A profile that cannot tell a finished save from a
    /// failed one is never used to click anything.
    async fn save(&self, page: &dyn PageDriver) -> Result<()> {
        if self.profile.page.steps_through_students() {
            // Every grade was saved as it was written.
            return Ok(());
        }
        if !self.confirms_saves() {
            return Err(Error::Page(format!(
                "The site profile \"{}\" does not say how a finished save looks, so OGRE has not saved anything. Save in the browser yourself.",
                self.profile.name
            )));
        }
        self.click_save(page).await
    }
}

/// Student number `at` of a site that shows one at a time. Every student
/// has the same boxes there, so each box is named with the student's place.
fn student_at(at: usize, student: &Student) -> Submission {
    let mut read = submission(student);
    read.index = at;
    for score in &mut read.scores {
        score.field = field_of(at, &score.field);
    }
    if let Some(feedback) = &mut read.feedback {
        feedback.field = field_of(at, &feedback.field);
    }
    read
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
