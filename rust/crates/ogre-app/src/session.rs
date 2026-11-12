//! One grading page as the window works on it: what was read, what the AI
//! proposed, what the teacher changed, and what has been written back.
//!
//! No widgets and no I/O here, so every rule about what gets graded and
//! written can be tested directly.

use ogre_core::{
    DEFAULT_WEIGHT_MODE, GradeWrite, GradingPage, Rubric, SkipReason, StudentWork, Submission,
    WritePolicy, editable_rubric_text, format_score, plan_write, rubric_from_edited_text,
    skip_reason, unread_rubric_lines,
};
use ogre_harness::feedback;

use crate::grading::GradeReport;
use crate::worker::{ReadReport, WriteReport};

pub struct Session {
    pub page: GradingPage,
    pub site: &'static str,
    pub saves_on_write: bool,
    /// OGRE cannot confirm a save on this site; the teacher saves in the browser.
    pub manual_save: bool,
    /// The rubric as read from the page.
    pub rubric: Rubric,
    /// Why the rubric could not be read from the page, if it could not.
    pub rubric_problem: Option<String>,
    /// The requirements and exemplar answer as text, which the teacher may
    /// edit. Tell [`Session::rubric_text_changed`] after changing it.
    pub rubric_text: String,
    rubric_text_as_read: String,
    outline: RubricOutline,
    /// The teacher's own instructions to the grader for this question.
    pub instructions: String,
    /// One per student, in page order.
    pub rows: Vec<Row>,
    pub policy: WritePolicy,
    /// Also grade students who already have points or feedback.
    pub include_graded: bool,
    pub warnings: Vec<String>,
    /// Grades are in the page's form but the site has not stored them yet.
    pub unsaved: bool,
    /// The last write left the page in a state that must not be saved.
    pub blocked: bool,
}

/// What the rubric text holds, as the grader will read it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RubricOutline {
    pub categories: usize,
    pub requirements: usize,
    pub exemplar: bool,
    /// Lines the teacher wrote that grading will not use.
    pub unread: Vec<String>,
}

impl RubricOutline {
    fn of(scraped: &Rubric, text: &str) -> Self {
        let rubric = rubric_from_edited_text(scraped, text, DEFAULT_WEIGHT_MODE);
        let checklist = rubric.checklist_items.iter().map(|item| item.items.len());
        let targets = rubric.rubric_items.iter().map(|item| item.items.len());
        Self {
            categories: rubric.checklist_items.len() + rubric.rubric_items.len(),
            requirements: checklist.chain(targets).sum(),
            exemplar: rubric.model_text.is_some(),
            unread: unread_rubric_lines(text),
        }
    }
}

#[derive(Default)]
pub struct Row {
    pub proposal: Option<Proposal>,
    pub note: Option<Note>,
}

/// A score and feedback waiting for the teacher's decision.
pub struct Proposal {
    pub score: f64,
    /// Feedback as the AI wrote it.
    original_html: String,
    /// Feedback as plain text, which the teacher may edit.
    pub text: String,
    edited: bool,
    /// A reason to look at this grade before accepting it.
    pub flag: Option<String>,
    /// Unticked proposals are not written.
    pub accepted: bool,
}

impl Proposal {
    fn new(score: f64, html: String, flag: Option<String>) -> Self {
        Self {
            score,
            text: feedback::plain_text(&html),
            original_html: html,
            edited: false,
            flag,
            accepted: true,
        }
    }

    /// Call after the teacher changes [`Self::text`].
    pub fn mark_edited(&mut self) {
        self.edited = true;
    }

    /// The feedback to write. The AI's formatting is kept until the teacher
    /// edits the text; after that, the text is what counts.
    pub fn html(&self) -> String {
        if self.edited {
            text_to_html(&self.text)
        } else {
            self.original_html.clone()
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Note {
    /// The AI gave no usable result for this student.
    NotGraded(String),
    /// The page refused the write.
    WriteFailed(String),
    /// The grade is in the page's form, waiting to be saved.
    Written,
    /// A fresh read of the page did not show what was written.
    Mismatch(String),
}

/// Where a student stands, for the status column.
#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    NoResponse,
    HasPoints,
    /// No points, but feedback is there: graded, at zero.
    HasFeedback,
    Ungraded,
    Ready,
    Held,
    Skipped(SkipReason),
    Note(Note),
}

impl Status {
    pub fn text(&self) -> String {
        match self {
            Self::NoResponse => "No response".into(),
            Self::HasPoints => "Has points".into(),
            Self::HasFeedback => "Has feedback".into(),
            Self::Ungraded => "Ungraded".into(),
            Self::Ready => "Ready to write".into(),
            Self::Held => "Held back".into(),
            Self::Skipped(reason) => format!("Skipped: {}", reason.explain()),
            Self::Note(Note::NotGraded(why)) => format!("Not graded: {why}"),
            Self::Note(Note::WriteFailed(why)) => format!("Not written: {why}"),
            Self::Note(Note::Written) => "Filled in".into(),
            Self::Note(Note::Mismatch(why)) => format!("Check this: {why}"),
        }
    }

    /// True for states the teacher has to look at.
    pub fn is_problem(&self) -> bool {
        matches!(
            self,
            Self::Note(Note::NotGraded(_) | Note::WriteFailed(_) | Note::Mismatch(_))
        )
    }
}

impl Session {
    pub fn new(read: ReadReport) -> Self {
        let (rubric, rubric_problem) = match read.rubric {
            Ok(rubric) => (rubric, None),
            Err(problem) => (Rubric::default(), Some(problem)),
        };
        let rubric_text = editable_rubric_text(&rubric);
        Self {
            rows: read
                .page
                .submissions
                .iter()
                .map(|_| Row::default())
                .collect(),
            instructions: rubric.custom_instructions.clone().unwrap_or_default(),
            outline: RubricOutline::of(&rubric, &rubric_text),
            rubric_text_as_read: rubric_text.clone(),
            rubric_text,
            page: read.page,
            site: read.site,
            saves_on_write: read.saves_on_write,
            manual_save: read.manual_save,
            rubric,
            rubric_problem,
            policy: WritePolicy::default(),
            include_graded: false,
            warnings: Vec::new(),
            unsaved: false,
            blocked: false,
        }
    }

    /// The rubric to grade with, including the teacher's instructions.
    pub fn rubric_for_grading(&self) -> Rubric {
        let mut rubric = self.rubric.clone();
        let instructions = self.instructions.trim();
        rubric.custom_instructions = (!instructions.is_empty()).then(|| instructions.to_owned());
        rubric
    }

    /// True when the teacher has changed the rubric text.
    pub fn rubric_edited(&self) -> bool {
        self.rubric_text != self.rubric_text_as_read
    }

    /// The rubric text to grade against in place of the page's, if the
    /// teacher changed it.
    pub fn edited_rubric_text(&self) -> Option<String> {
        self.rubric_edited().then(|| self.rubric_text.clone())
    }

    /// Call after the rubric text was changed.
    pub fn rubric_text_changed(&mut self) {
        self.outline = RubricOutline::of(&self.rubric, &self.rubric_text);
    }

    /// Puts the rubric text back to what the page gave.
    pub fn restore_rubric_text(&mut self) {
        self.rubric_text.clone_from(&self.rubric_text_as_read);
        self.rubric_text_changed();
    }

    /// What the grader will find in the rubric text.
    pub fn rubric_outline(&self) -> &RubricOutline {
        &self.outline
    }

    /// A zero with feedback is a grade someone gave, not a blank.
    fn already_graded(submission: &Submission) -> bool {
        submission.has_nonzero_score() || submission.has_feedback()
    }

    fn gradable(&self, submission: &Submission) -> bool {
        !submission.response.trim().is_empty()
            && (self.include_graded || !Self::already_graded(submission))
    }

    /// The students a grading run would send to the AI.
    /// How many students [`Self::to_grade`] would send.
    pub fn grade_count(&self) -> usize {
        self.page
            .submissions
            .iter()
            .filter(|s| self.gradable(s))
            .count()
    }

    pub fn to_grade(&self) -> Vec<StudentWork> {
        self.page
            .submissions
            .iter()
            .filter(|s| self.gradable(s))
            .map(StudentWork::from)
            .collect()
    }

    pub fn status(&self, index: usize) -> Status {
        let submission = &self.page.submissions[index];
        let row = &self.rows[index];
        if let Some(note) = &row.note {
            return Status::Note(note.clone());
        }
        match &row.proposal {
            Some(proposal) if !proposal.accepted => Status::Held,
            Some(proposal) => match skip_reason(submission, proposal.score, self.policy) {
                None => Status::Ready,
                Some(reason) => Status::Skipped(reason),
            },
            None if submission.has_nonzero_score() => Status::HasPoints,
            None if submission.has_feedback() => Status::HasFeedback,
            None if submission.response.trim().is_empty() => Status::NoResponse,
            None => Status::Ungraded,
        }
    }

    fn plan(&self, submission: &Submission, proposal: &Proposal) -> Result<GradeWrite, SkipReason> {
        plan_write(submission, proposal.score, &proposal.html(), self.policy)
    }

    /// How many grades [`Self::to_write`] would write.
    pub fn write_count(&self) -> usize {
        self.page
            .submissions
            .iter()
            .zip(&self.rows)
            .filter(|(_, row)| row.note.is_none())
            .filter(|(submission, row)| {
                row.proposal.as_ref().is_some_and(|proposal| {
                    proposal.accepted
                        && skip_reason(submission, proposal.score, self.policy).is_none()
                })
            })
            .count()
    }

    /// The writes the teacher has approved and the rules allow.
    pub fn to_write(&self) -> Vec<GradeWrite> {
        self.page
            .submissions
            .iter()
            .zip(&self.rows)
            .filter(|(_, row)| row.note.is_none())
            .filter_map(|(submission, row)| {
                let proposal = row.proposal.as_ref().filter(|p| p.accepted)?;
                self.plan(submission, proposal).ok()
            })
            .collect()
    }

    pub fn apply_grades(&mut self, report: GradeReport) {
        self.warnings = report.warnings;
        if report.cancelled {
            self.warnings
                .insert(0, "Grading was stopped before it finished.".into());
        }
        for graded in report.rows {
            let Some(row) = self.rows.get_mut(graded.index) else {
                continue;
            };
            match graded.outcome {
                Ok(grade) => {
                    row.proposal =
                        Some(Proposal::new(grade.score, grade.feedback_html, grade.flag));
                    row.note = None;
                }
                Err(reason) => {
                    row.proposal = None;
                    row.note = Some(Note::NotGraded(reason));
                }
            }
        }
    }

    /// Records what a write did. Returns a message for the teacher if
    /// anything went wrong.
    pub fn apply_write(&mut self, report: WriteReport) -> Option<String> {
        if let Some(page) = report.page {
            self.replace_page(page);
        }
        for index in &report.written {
            if let Some(row) = self.rows.get_mut(*index) {
                // A site that stores on write has nothing left to save, so the
                // row simply shows the student's new score.
                *row = if self.saves_on_write {
                    Row::default()
                } else {
                    Row {
                        proposal: row.proposal.take(),
                        note: Some(Note::Written),
                    }
                };
            }
        }
        for (index, reason) in &report.failed {
            if let Some(row) = self.rows.get_mut(*index) {
                row.note = Some(Note::WriteFailed(reason.clone()));
            }
        }
        for mismatch in &report.mismatches {
            let row = self
                .page
                .submissions
                .iter()
                .position(|s| s.name == mismatch.name)
                .and_then(|index| self.rows.get_mut(index));
            if let Some(row) = row {
                row.note = Some(Note::Mismatch(mismatch.problem.clone()));
            }
        }
        self.unsaved |= !report.written.is_empty() && !self.saves_on_write;
        self.blocked = !report.mismatches.is_empty();

        if self.blocked {
            Some(format!(
                "Stopped: the page does not show what was written for {}. Nothing was saved. \
                 Check the page, then read the students again.",
                names(report.mismatches.iter().map(|m| m.name.as_str()))
            ))
        } else if !report.failed.is_empty() {
            Some(format!(
                "{} could not be written; see the status column.",
                count(report.failed.len(), "grade")
            ))
        } else {
            None
        }
    }

    /// Call when the site has confirmed the save.
    pub fn apply_saved(&mut self, page: Option<GradingPage>) {
        self.unsaved = false;
        for row in &mut self.rows {
            if row.note == Some(Note::Written) {
                *row = Row::default();
            }
        }
        if let Some(page) = page {
            self.replace_page(page);
        }
    }

    /// Takes a fresh read of the same page. Rows keep their place as long as
    /// the students are the same.
    fn replace_page(&mut self, page: GradingPage) {
        let same_students = page.submissions.len() == self.page.submissions.len()
            && page
                .submissions
                .iter()
                .zip(&self.page.submissions)
                .all(|(new, old)| new.student_id == old.student_id && new.name == old.name);
        if !same_students {
            self.rows = page.submissions.iter().map(|_| Row::default()).collect();
        }
        self.page = page;
    }
}

/// "3.5/5 · N/A/5" for a two-part question; "–/10" for a blank box.
pub fn score_text(submission: &Submission) -> String {
    let parts: Vec<String> = submission
        .scores
        .iter()
        .map(|score| {
            let raw = score.raw.trim();
            let given = if raw.is_empty() { "–" } else { raw };
            match score.max {
                Some(max) => format!("{given}/{}", format_score(max)),
                None => given.to_owned(),
            }
        })
        .collect();
    if parts.is_empty() {
        "–".to_owned()
    } else {
        parts.join(" · ")
    }
}

/// "1 grade", "3 grades".
pub fn count(n: usize, noun: &str) -> String {
    format!("{n} {noun}{}", if n == 1 { "" } else { "s" })
}

fn names<'a>(names: impl Iterator<Item = &'a str>) -> String {
    names.collect::<Vec<_>>().join("; ")
}

/// Paragraphs for blank-line-separated text, with everything escaped.
fn text_to_html(text: &str) -> String {
    text.split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| format!("<p>{}</p>", escape(paragraph).replace('\n', "<br>")))
        .collect()
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use ogre_core::{FeedbackField, FeedbackKind, ScoreField};
    use ogre_harness::sites::Mismatch;

    use super::*;
    use crate::grading::{Grade, GradedRow};

    fn submission(
        index: usize,
        name: &str,
        raw: &str,
        feedback: &str,
        response: &str,
    ) -> Submission {
        Submission {
            index,
            student_id: Some(format!("{}", 1000 + index)),
            name: name.into(),
            scores: vec![ScoreField {
                field: format!("ud-{}-0-2-0", 1000 + index),
                label: "Score".into(),
                raw: raw.into(),
                max: Some(10.0),
            }],
            feedback: Some(FeedbackField {
                field: format!("fb-0-2-{}", 1000 + index),
                kind: FeedbackKind::RichText,
                text: feedback.into(),
            }),
            response: response.into(),
            prompt: None,
        }
    }

    fn page() -> GradingPage {
        GradingPage {
            url: "https://www.myopenmath.com/course/gradeallq2.php?cid=1".into(),
            title: "Unit 4 FRQ".into(),
            position: None,
            submissions: vec![
                submission(0, "Avery, Sam", "10", "Nice work.", "A full answer."),
                submission(1, "Brook, Kai", "0", "", "A short answer."),
                submission(2, "Cruz, Jo", "", "", ""),
                submission(3, "Diaz, Remy", "0", "", "Another answer."),
            ],
        }
    }

    fn session() -> Session {
        Session::new(ReadReport {
            page: page(),
            rubric: Ok(Rubric::default()),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
        })
    }

    fn graded(index: usize, score: f64, html: &str) -> GradedRow {
        GradedRow {
            index,
            outcome: Ok(Grade {
                score,
                feedback_html: html.into(),
                flag: None,
            }),
        }
    }

    fn report(rows: Vec<GradedRow>) -> GradeReport {
        GradeReport {
            rows,
            ..GradeReport::default()
        }
    }

    #[test]
    fn rubric_edits_are_sent_only_while_they_differ_from_the_page() {
        let rubric: Rubric = serde_json::from_value(serde_json::json!({
            "checklistItems": [{ "category": "Concept", "items": ["Names the theorem"] }],
            "modelText": "The Central Limit Theorem.",
        }))
        .unwrap();
        let mut s = Session::new(ReadReport {
            page: page(),
            rubric: Ok(rubric),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
        });
        assert_eq!(s.edited_rubric_text(), None);
        let as_read = s.rubric_outline().clone();
        assert_eq!((as_read.categories, as_read.requirements), (1, 1));
        assert!(as_read.exemplar && as_read.unread.is_empty());

        s.rubric_text.push_str("\nand a stray thought");
        s.rubric_text_changed();
        assert!(s.rubric_edited());
        assert!(s.edited_rubric_text().unwrap().ends_with("a stray thought"));
        // The stray line became part of the exemplar answer, which is fine.
        assert!(s.rubric_outline().unread.is_empty());

        assert_eq!(s.rubric_text.lines().nth(1), Some("Names the theorem"));
        s.rubric_text = "Names the theorem\nSays when it applies".into();
        s.rubric_text_changed();
        assert_eq!(s.rubric_outline().requirements, 2);
        assert!(!s.rubric_outline().exemplar);

        // The older bracketed layout can have a line outside any category.
        s.rubric_text = "a stray line\n[Concept]\n- Names the theorem".into();
        s.rubric_text_changed();
        assert_eq!(s.rubric_outline().requirements, 1);
        assert_eq!(s.rubric_outline().unread, ["a stray line"]);

        s.restore_rubric_text();
        assert_eq!(s.edited_rubric_text(), None);
        assert_eq!(*s.rubric_outline(), as_read);
    }

    #[test]
    fn a_page_without_a_rubric_offers_an_empty_editor() {
        let s = session();
        assert_eq!(s.rubric_text, "");
        assert!(!s.rubric_edited());
        assert_eq!(*s.rubric_outline(), RubricOutline::default());
    }

    #[test]
    fn only_ungraded_students_with_a_response_are_sent_for_grading() {
        let mut s = session();
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Brook, Kai", "Diaz, Remy"]);
        assert_eq!(s.status(0), Status::HasPoints);
        assert_eq!(s.status(1), Status::Ungraded);
        assert_eq!(s.status(2), Status::NoResponse);

        s.include_graded = true;
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Avery, Sam", "Brook, Kai", "Diaz, Remy"]);
    }

    #[test]
    fn a_zero_with_feedback_counts_as_graded() {
        let mut graded_zero = page();
        graded_zero.submissions[1].feedback.as_mut().unwrap().text = "Off topic.".into();
        let mut s = Session::new(ReadReport {
            page: graded_zero,
            rubric: Ok(Rubric::default()),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
        });
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Diaz, Remy"], "Kai was given a zero on purpose");
        assert_eq!(s.status(1), Status::HasFeedback);

        s.include_graded = true;
        assert_eq!(s.to_grade().len(), 3);
    }

    #[test]
    fn the_teachers_instructions_travel_with_the_rubric() {
        let mut s = session();
        assert_eq!(s.rubric_for_grading().custom_instructions, None);
        s.instructions = "  Accept answers in words.  ".into();
        assert_eq!(
            s.rubric_for_grading().custom_instructions.as_deref(),
            Some("Accept answers in words.")
        );
    }

    #[test]
    fn proposals_are_written_unless_held_back_or_against_the_rules() {
        let mut s = session();
        s.include_graded = true;
        s.apply_grades(report(vec![
            graded(0, 9.0, "<p>Re-graded.</p>"),
            graded(1, 7.5, "<p>Good <strong>start</strong>.</p>"),
            GradedRow {
                index: 3,
                outcome: Err("the AI's reply could not be read".into()),
            },
        ]));

        // Sam already has points, so the proposal is skipped, not written.
        assert_eq!(s.status(0), Status::Skipped(SkipReason::HasPoints));
        assert_eq!(s.status(1), Status::Ready);
        assert!(s.status(3).is_problem());
        let writes = s.to_write();
        assert_eq!(writes.len(), 1);
        assert_eq!((s.write_count(), s.grade_count()), (1, s.to_grade().len()));
        assert_eq!(writes[0].name, "Brook, Kai");
        assert_eq!(writes[0].score.value, 7.5);
        assert_eq!(
            writes[0].feedback.as_ref().unwrap().html,
            "<p>Good <strong>start</strong>.</p>"
        );

        // The teacher allows overwriting: Sam's score goes, his feedback stays.
        s.policy.overwrite_scores = true;
        let writes = s.to_write();
        assert_eq!(writes.len(), 2);
        assert_eq!(writes[0].name, "Avery, Sam");
        assert_eq!(writes[0].feedback, None);

        // The teacher holds Kai back.
        s.rows[1].proposal.as_mut().unwrap().accepted = false;
        assert_eq!(s.status(1), Status::Held);
        assert_eq!(s.to_write().len(), 1);
    }

    #[test]
    fn edited_feedback_replaces_the_ai_text_and_is_escaped() {
        let mut s = session();
        s.apply_grades(report(vec![graded(
            1,
            7.0,
            "<p>Good <strong>start</strong>.</p>",
        )]));
        let proposal = s.rows[1].proposal.as_mut().unwrap();
        assert_eq!(proposal.text, "Good start.");

        proposal.text = "Good start, Kai.\nCheck x < 3.\n\n<script>alert(1)</script>".into();
        proposal.mark_edited();
        assert_eq!(
            proposal.html(),
            "<p>Good start, Kai.<br>Check x &lt; 3.</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
        );
    }

    #[test]
    fn a_write_marks_rows_and_a_save_clears_them() {
        let mut s = session();
        s.apply_grades(report(vec![
            graded(1, 7.0, "<p>a</p>"),
            graded(3, 4.0, "<p>b</p>"),
        ]));

        let mut after_write = page();
        after_write.submissions[1].scores[0].raw = "7".into();
        let message = s.apply_write(WriteReport {
            written: vec![1],
            failed: vec![(3, "the score changed on the page".into())],
            mismatches: vec![],
            page: Some(after_write),
        });
        assert_eq!(
            message.as_deref(),
            Some("1 grade could not be written; see the status column.")
        );
        assert_eq!(s.status(1), Status::Note(Note::Written));
        assert!(s.status(3).is_problem());
        assert!(s.unsaved && !s.blocked);
        assert_eq!(s.to_write(), [], "nothing is written twice");

        s.apply_saved(None);
        assert!(!s.unsaved);
        assert_eq!(s.status(1), Status::HasPoints);
        assert!(s.rows[1].proposal.is_none());
    }

    #[test]
    fn a_site_that_stores_on_write_has_nothing_left_to_save() {
        let mut s = session();
        s.saves_on_write = true;
        s.apply_grades(report(vec![graded(1, 7.0, "<p>a</p>")]));
        let mut after_write = page();
        after_write.submissions[1].scores[0].raw = "7".into();
        let message = s.apply_write(WriteReport {
            written: vec![1],
            failed: vec![],
            mismatches: vec![],
            page: Some(after_write),
        });
        assert_eq!(message, None);
        assert!(!s.unsaved);
        assert_eq!(s.status(1), Status::HasPoints);
    }

    #[test]
    fn a_mismatch_blocks_saving() {
        let mut s = session();
        s.apply_grades(report(vec![graded(1, 7.0, "<p>a</p>")]));
        let message = s
            .apply_write(WriteReport {
                written: vec![1],
                failed: vec![],
                mismatches: vec![Mismatch {
                    name: "Brook, Kai".into(),
                    problem: "score should be 7 but the page shows 2".into(),
                }],
                page: None,
            })
            .unwrap();
        assert!(
            message.starts_with("Stopped: the page does not show what was written for Brook, Kai.")
        );
        assert!(s.blocked);
        assert!(s.status(1).is_problem());
    }

    #[test]
    fn a_cancelled_run_keeps_what_was_graded_and_says_so() {
        let mut s = session();
        s.apply_grades(GradeReport {
            rubric_text: None,
            rows: vec![graded(1, 7.0, "<p>a</p>")],
            warnings: vec!["Chunk 2 was not graded.".into()],
            cancelled: true,
        });
        assert_eq!(s.warnings[0], "Grading was stopped before it finished.");
        assert_eq!(s.warnings.len(), 2);
        assert_eq!(s.status(1), Status::Ready);
        assert_eq!(s.status(3), Status::Ungraded);
    }

    #[test]
    fn score_text_reads_naturally() {
        let mut two = submission(0, "x", "3.5", "", "");
        two.scores.push(ScoreField {
            field: "f".into(),
            label: "Score for part 2".into(),
            raw: "N/A".into(),
            max: Some(2.5),
        });
        assert_eq!(score_text(&two), "3.5/10 · N/A/2.5");
        assert_eq!(score_text(&submission(0, "x", "", "", "")), "–/10");
    }
}
