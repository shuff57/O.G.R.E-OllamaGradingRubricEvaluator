//! One grading page as the window works on it: what was read, what the AI
//! proposed, what the teacher changed, and what has been written back.
//!
//! No widgets and no I/O here, so every rule about what gets graded and
//! written can be tested directly.

use ogre_core::{
    CategoryShare, DEFAULT_WEIGHT_MODE, GradeWrite, GradingPage, QuestionLink, Rubric, SkipReason,
    StudentResult, StudentWork, Submission, WritePolicy, category_shares, category_weight_problem,
    editable_rubric_text, format_score, names_category_weights, plan_write,
    rubric_from_edited_text, skip_reason, unread_rubric_lines, with_category_weight,
    with_equal_category_weights, with_requirements, without_category_weights,
};
use ogre_harness::feedback;

use crate::grading::{Grade, GradeReport, GradedRow, Suggestion};
use crate::rubrics::SavedRubric;
use crate::settings::AS_WRITTEN_LENIENCY;
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
    /// The assignment's questions, where the site lists them.
    pub questions: Vec<QuestionLink>,
    /// The teacher's own instructions to the grader for this question.
    pub instructions: String,
    /// Example answers at four levels, shown to the grader beside the
    /// rubric. Written by the AI when asked, and the teacher's to edit.
    pub examples: String,
    /// What the examples in hand were written for.
    examples_basis: Option<ExamplesBasis>,
    /// What the examples being written now are for.
    examples_asked: Option<ExamplesBasis>,
    /// The leniency setting the AI reworded the text in the editor for.
    /// Such text is graded as it stands.
    reworded_at: Option<u8>,
    /// The leniency setting a rewording now being made was asked at.
    reword_asked: Option<u8>,
    /// One per student, in page order.
    pub rows: Vec<Row>,
    pub policy: WritePolicy,
    /// Which students a grading run takes. Use [`Session::set_who`].
    who: Who,
    /// Students with no response and no grade are proposed a zero.
    zero_blank: bool,
    pub warnings: Vec<String>,
    /// Grades are in the page's form but the site has not stored them yet.
    pub unsaved: bool,
    /// The last write left the page in a state that must not be saved.
    pub blocked: bool,
}

/// Which of the students with a response a grading run takes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Who {
    /// Those with no points and no feedback.
    #[default]
    Ungraded,
    /// Those at zero or blank, whatever feedback they have: work handed in
    /// after the class was graded.
    Late,
    Everyone,
    /// The student at this place on the page.
    One(usize),
}

/// A question's place in its assignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Place<'a> {
    /// From 1.
    pub number: usize,
    pub total: usize,
    pub current: &'a QuestionLink,
    pub previous: Option<&'a QuestionLink>,
    pub next: Option<&'a QuestionLink>,
}

/// The rubric and leniency a set of scoring examples was written for.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ExamplesBasis {
    rubric_text: String,
    leniency: u8,
}

/// What the rubric text holds, as the grader will read it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct RubricOutline {
    pub categories: usize,
    pub requirements: usize,
    pub exemplar: bool,
    /// Lines the teacher wrote that grading will not use.
    pub unread: Vec<String>,
    /// The named categories and how much of the grade each is.
    pub shares: Vec<CategoryShare>,
    /// True when the text itself gives the weights. They then decide how
    /// the scores for the categories add up.
    pub weights_written: bool,
    /// Why the weights would give wrong scores, if they would. Grading
    /// waits until this is put right.
    pub weight_problem: Option<String>,
}

impl RubricOutline {
    /// The outline of rubric text that belongs to no page, such as a saved
    /// rubric's.
    pub fn of_text(text: &str) -> Self {
        Self::of(&Rubric::default(), text)
    }

    fn of(scraped: &Rubric, text: &str) -> Self {
        let rubric = rubric_from_edited_text(scraped, text, DEFAULT_WEIGHT_MODE);
        let checklist = rubric.checklist_items.iter().map(|item| item.items.len());
        let targets = rubric.rubric_items.iter().map(|item| item.items.len());
        Self {
            categories: rubric.checklist_items.len() + rubric.rubric_items.len(),
            requirements: checklist.chain(targets).sum(),
            exemplar: rubric.model_text.is_some(),
            unread: unread_rubric_lines(text),
            shares: category_shares(text),
            weights_written: names_category_weights(text),
            weight_problem: category_weight_problem(text),
        }
    }
}

#[derive(Default)]
pub struct Row {
    pub proposal: Option<Proposal>,
    pub note: Option<Note>,
    /// The proposal arrived while the run that made it is still going.
    early: bool,
}

/// A score and feedback waiting for the teacher's decision.
pub struct Proposal {
    pub score: f64,
    /// Feedback as the AI wrote it.
    original_html: String,
    /// Feedback as text the teacher may edit: paragraphs, `- ` lists,
    /// `**bold**` and `*emphasis*`, as [`feedback::editable_text`] writes it.
    pub text: String,
    edited: bool,
    /// A reason to look at this grade before accepting it.
    pub flag: Option<String>,
    /// What the consistency check would give instead, until the teacher
    /// takes it or sets it aside.
    pub suggestion: Option<Suggestion>,
    /// Unticked proposals are not written.
    pub accepted: bool,
    /// A zero for a student who gave no response, proposed without the AI.
    pub for_no_response: bool,
    /// What the proposal was before a suggestion was taken, to go back to.
    before_suggestion: Option<BeforeSuggestion>,
}

/// A proposal as it stood when the teacher took the consistency check's
/// suggestion.
struct BeforeSuggestion {
    score: f64,
    /// The feedback that the suggestion's replaced, where it replaced any.
    feedback: Option<(String, String)>,
    suggestion: Suggestion,
}

impl Proposal {
    fn new(grade: Grade) -> Self {
        Self {
            score: grade.score,
            text: feedback::editable_text(&grade.feedback_html),
            original_html: grade.feedback_html,
            edited: false,
            flag: grade.flag,
            // A suggestion of the same score and no new feedback says nothing.
            suggestion: grade
                .suggestion
                .filter(|s| s.score != grade.score || s.feedback_html.is_some()),
            accepted: true,
            for_no_response: false,
            before_suggestion: None,
        }
    }

    /// A zero with no feedback, for a student who gave no response.
    fn zero_for_no_response() -> Self {
        Self {
            score: 0.0,
            original_html: String::new(),
            text: String::new(),
            edited: false,
            flag: None,
            suggestion: None,
            accepted: true,
            for_no_response: true,
            before_suggestion: None,
        }
    }

    /// Replaces the proposal with what the consistency check suggested: its
    /// score, and its feedback where it wrote any. Feedback the teacher has
    /// already edited is theirs and is kept.
    pub fn use_suggestion(&mut self) {
        let Some(suggestion) = self.suggestion.take() else {
            return;
        };
        let mut before = BeforeSuggestion {
            score: self.score,
            feedback: None,
            suggestion: suggestion.clone(),
        };
        self.score = suggestion.score;
        if let Some(html) = suggestion.feedback_html.filter(|_| !self.edited) {
            let text = std::mem::replace(&mut self.text, feedback::editable_text(&html));
            let original = std::mem::replace(&mut self.original_html, html);
            before.feedback = Some((original, text));
        }
        self.before_suggestion = Some(before);
    }

    /// True when a suggestion was taken and can still be given back.
    pub fn suggestion_taken(&self) -> bool {
        self.before_suggestion.is_some()
    }

    /// Goes back on [`Self::use_suggestion`]: the proposal's own score
    /// returns, and its feedback unless the teacher has edited the feedback
    /// since. The suggestion is open again.
    pub fn undo_suggestion(&mut self) {
        let Some(before) = self.before_suggestion.take() else {
            return;
        };
        self.score = before.score;
        if let Some((html, text)) = before.feedback.filter(|_| !self.edited) {
            self.original_html = html;
            self.text = text;
        }
        self.suggestion = Some(before.suggestion);
    }

    /// The feedback the suggestion would put in place of the proposal's, as
    /// plain text. `None` where it has none, or where the teacher's own
    /// edits would be kept instead.
    pub fn suggested_feedback(&self) -> Option<String> {
        let html = self.suggestion.as_ref()?.feedback_html.as_deref()?;
        (!self.edited).then(|| feedback::editable_text(html))
    }

    /// Sets the suggestion aside; the proposal stands as it is.
    pub fn keep_proposal(&mut self) {
        self.suggestion = None;
        self.before_suggestion = None;
    }

    /// Call after the teacher changes [`Self::text`].
    pub fn mark_edited(&mut self) {
        self.edited = true;
    }

    /// The feedback to write: the AI's own until the teacher edits the
    /// text, and after that the text, with the shape it is written in.
    pub fn html(&self) -> String {
        if self.edited {
            feedback::html_from_text(&self.text)
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
    /// Ready, with a suggestion from the consistency check not yet decided.
    Suggested,
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
            Self::Suggested => "Has a suggestion".into(),
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
            examples: String::new(),
            examples_basis: None,
            examples_asked: None,
            reworded_at: None,
            reword_asked: None,
            questions: read.questions,
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
            who: Who::default(),
            zero_blank: false,
            warnings: Vec::new(),
            unsaved: false,
            blocked: false,
        }
    }

    /// Takes over what the teacher set up in `earlier`, a session on the same
    /// page: their rubric edits, instructions and scoring examples. Reading
    /// a page again, for the students' new state, must not cost them that.
    ///
    /// Nothing is taken from another page, or when the page's own question
    /// or rubric has changed since: the edits were made for what is no longer
    /// there.
    pub fn keep_setup_from(&mut self, earlier: &Session) {
        let same_page = earlier.page.url == self.page.url
            && earlier.page.title == self.page.title
            && earlier.rubric.essay_prompt == self.rubric.essay_prompt
            && earlier.rubric_text_as_read == self.rubric_text_as_read;
        if !same_page {
            return;
        }
        self.set_rubric_text(earlier.rubric_text.clone());
        self.instructions.clone_from(&earlier.instructions);
        self.examples.clone_from(&earlier.examples);
        self.examples_basis.clone_from(&earlier.examples_basis);
        self.reworded_at = earlier.reworded_at;
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

    fn set_rubric_text(&mut self, text: String) {
        self.rubric_text = text;
        self.rubric_text_changed();
    }

    /// Puts the rubric text back to what the page gave.
    pub fn restore_rubric_text(&mut self) {
        self.set_rubric_text(self.rubric_text_as_read.clone());
        self.reworded_at = None;
    }

    /// Call when the AI is asked to reword the rubric, with the leniency
    /// setting it is asked at.
    pub fn reword_asked_for(&mut self, leniency: u8) {
        self.reword_asked = Some(leniency);
    }

    /// Takes the AI's rewording of the requirements into the editor. From
    /// here it is the teacher's text, and is graded as it stands.
    pub fn rubric_reworded(&mut self, requirements: &str) {
        let Some(leniency) = self.reword_asked.take() else {
            return;
        };
        self.set_requirements(requirements);
        self.reworded_at = Some(leniency);
    }

    /// The leniency setting the text in the editor was reworded for, if the
    /// AI has reworded it.
    pub fn reworded_at(&self) -> Option<u8> {
        self.reworded_at
    }

    /// The leniency setting to grade at, given the teacher's: a rubric that
    /// is already reworded is not reworded again.
    pub fn leniency_for_grading(&self, setting: u8) -> u8 {
        match self.reworded_at {
            Some(_) => AS_WRITTEN_LENIENCY,
            None => setting,
        }
    }

    /// What the grader will find in the rubric text.
    pub fn rubric_outline(&self) -> &RubricOutline {
        &self.outline
    }

    /// Puts a saved rubric in place of the one in hand. Its instructions and
    /// scoring examples come with it where it has any.
    pub fn use_saved(&mut self, saved: &SavedRubric) {
        self.set_rubric_text(saved.text.clone());
        self.reworded_at = None;
        if !saved.instructions.trim().is_empty() {
            self.instructions.clone_from(&saved.instructions);
        }
        if !saved.examples.trim().is_empty() {
            self.examples.clone_from(&saved.examples);
            // Written for that rubric, whenever that was.
            self.examples_basis = None;
        }
    }

    /// The question the students answered, where the page gave one: the
    /// rubric's, or failing that the first student's own.
    pub fn question_text(&self) -> Option<&str> {
        let filled = |text: &&str| !text.trim().is_empty();
        self.rubric
            .essay_prompt
            .as_deref()
            .filter(filled)
            .or_else(|| {
                self.page
                    .submissions
                    .iter()
                    .find_map(|submission| submission.prompt.as_deref().filter(filled))
            })
    }

    /// The rubric in hand, to keep under `name`.
    pub fn as_saved(&self, name: &str) -> SavedRubric {
        SavedRubric {
            name: name.trim().to_owned(),
            text: self.rubric_text.clone(),
            instructions: self.instructions.trim().to_owned(),
            examples: self.examples.trim().to_owned(),
        }
    }

    /// Replaces the requirements with ones that came from elsewhere, such
    /// as a picture of the page. The exemplar answer stays.
    pub fn set_requirements(&mut self, requirements: &str) {
        self.set_rubric_text(with_requirements(&self.rubric_text, requirements));
        self.reworded_at = None;
    }

    /// Makes `category` count for `weight` percent of the grade. Every
    /// category's weight is then written in the rubric text.
    pub fn set_category_weight(&mut self, category: &str, weight: f64) {
        self.set_rubric_text(with_category_weight(&self.rubric_text, category, weight));
    }

    /// Writes the same weight for every category into the rubric text.
    pub fn share_weights_equally(&mut self) {
        self.set_rubric_text(with_equal_category_weights(&self.rubric_text));
    }

    /// Takes the weights out of the rubric text.
    pub fn remove_weights(&mut self) {
        self.set_rubric_text(without_category_weights(&self.rubric_text));
    }

    /// Call when the AI is asked to write scoring examples, with the
    /// leniency setting it is asked at.
    pub fn examples_asked_for(&mut self, leniency: u8) {
        self.examples_asked = Some(ExamplesBasis {
            rubric_text: self.rubric_text.clone(),
            leniency,
        });
    }

    /// Takes the scoring examples the AI wrote.
    pub fn examples_arrived(&mut self, examples: String) {
        self.examples = examples;
        self.examples_basis = self.examples_asked.take();
    }

    pub fn remove_examples(&mut self) {
        self.examples.clear();
        self.examples_basis = None;
    }

    /// True when the examples were written for a rubric or a leniency that
    /// has since changed, so they may no longer show what the levels are.
    pub fn examples_out_of_date(&self, leniency: u8) -> bool {
        !self.examples.trim().is_empty()
            && self.examples_basis.as_ref().is_some_and(|basis| {
                basis.rubric_text != self.rubric_text || basis.leniency != leniency
            })
    }

    /// The scoring examples to show the grader, if there are any.
    pub fn examples_for_grading(&self) -> Option<String> {
        let examples = self.examples.trim();
        (!examples.is_empty()).then(|| examples.to_owned())
    }

    /// A zero with feedback is a grade someone gave, not a blank.
    fn already_graded(submission: &Submission) -> bool {
        submission.has_nonzero_score() || submission.has_feedback()
    }

    fn gradable(&self, at: usize, submission: &Submission) -> bool {
        !submission.response.trim().is_empty()
            && match self.who {
                Who::Ungraded => !Self::already_graded(submission),
                Who::Late => !submission.has_nonzero_score(),
                Who::Everyone => true,
                Who::One(only) => at == only,
            }
    }

    /// Which students a grading run takes.
    pub fn who(&self) -> Who {
        self.who
    }

    /// Chooses which students a grading run takes. One student has to be
    /// one with a response; asking for another leaves the choice as it was.
    pub fn set_who(&mut self, who: Who) {
        if let Who::One(at) = who
            && !self.answered().any(|(index, _)| index == at)
        {
            return;
        }
        self.who = who;
    }

    /// The students who gave a response, with their place on the page.
    pub fn answered(&self) -> impl Iterator<Item = (usize, &Submission)> {
        self.page
            .submissions
            .iter()
            .enumerate()
            .filter(|(_, submission)| !submission.response.trim().is_empty())
    }

    /// Of the students a run of late work would take, how many already have
    /// feedback on the page.
    pub fn late_with_feedback(&self) -> usize {
        self.answered()
            .filter(|(_, s)| !s.has_nonzero_score() && s.has_feedback())
            .count()
    }

    /// True for a student who gave no response and has no grade: no points,
    /// no feedback, and a score box that does not already say zero.
    fn blank_and_ungraded(submission: &Submission) -> bool {
        submission.response.trim().is_empty()
            && !Self::already_graded(submission)
            && submission
                .scores
                .iter()
                .all(|score| score.value().is_none())
    }

    /// How many students a zero for no response is for.
    pub fn blank_count(&self) -> usize {
        self.page
            .submissions
            .iter()
            .filter(|s| Self::blank_and_ungraded(s))
            .count()
    }

    /// True while students with no response are proposed a zero.
    pub fn zero_blank(&self) -> bool {
        self.zero_blank
    }

    /// Proposes a zero, with no feedback, for every student with no response
    /// and no grade, or takes those proposals back. They are proposals like
    /// any other: shown in the table, and written only when the teacher
    /// fills the grades in.
    pub fn set_zero_blank(&mut self, on: bool) {
        self.zero_blank = on;
        for (submission, row) in self.page.submissions.iter().zip(&mut self.rows) {
            if row.note.is_some() {
                continue;
            }
            let proposed = row.proposal.as_ref().is_some_and(|p| p.for_no_response);
            if on && row.proposal.is_none() && Self::blank_and_ungraded(submission) {
                row.proposal = Some(Proposal::zero_for_no_response());
            } else if proposed && !(on && Self::blank_and_ungraded(submission)) {
                row.proposal = None;
            }
        }
    }

    /// True when the only grades waiting to be written are zeros for no
    /// response, so that grading is still the step to take.
    pub fn only_zeros_waiting(&self) -> bool {
        self.rows
            .iter()
            .filter(|row| row.note.is_none())
            .filter_map(|row| row.proposal.as_ref())
            .all(|proposal| proposal.for_no_response)
    }

    /// The students a grading run would send to the AI.
    /// How many students [`Self::to_grade`] would send.
    pub fn grade_count(&self) -> usize {
        self.page
            .submissions
            .iter()
            .enumerate()
            .filter(|(at, s)| self.gradable(*at, s))
            .count()
    }

    pub fn to_grade(&self) -> Vec<StudentWork> {
        self.page
            .submissions
            .iter()
            .enumerate()
            .filter(|(at, s)| self.gradable(*at, s))
            .map(|(_, s)| StudentWork::from(s))
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
                None if proposal.suggestion.is_some() => Status::Suggested,
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

    /// Where this question sits among the assignment's questions: its place
    /// from 1, how many there are, and the questions before and after it.
    /// `None` where the site gave no list.
    pub fn place(&self) -> Option<Place<'_>> {
        let at = self.questions.iter().position(|q| q.current)?;
        Some(Place {
            number: at + 1,
            total: self.questions.len(),
            current: &self.questions[at],
            previous: at.checked_sub(1).map(|i| &self.questions[i]),
            next: self.questions.get(at + 1),
        })
    }

    /// What would be lost by leaving this page now, if anything.
    pub fn at_stake(&self) -> Option<String> {
        if self.unsaved {
            return Some(
                "Grades are filled in on the page but not saved. Leaving loses them.".into(),
            );
        }
        let waiting = self
            .rows
            .iter()
            .filter(|row| row.note.is_none() && row.proposal.is_some())
            .count();
        (waiting > 0).then(|| {
            format!(
                "{} not been written. Leaving drops {}.",
                if waiting == 1 {
                    "1 proposed grade has".to_owned()
                } else {
                    format!("{waiting} proposed grades have")
                },
                if waiting == 1 { "it" } else { "them" }
            )
        })
    }

    /// The grades the consistency check would look at, as they now stand:
    /// every proposal that came from grading and is not yet on the page,
    /// with the student it is for.
    pub fn to_sweep(&self) -> (Vec<StudentWork>, Vec<StudentResult>) {
        self.page
            .submissions
            .iter()
            .zip(&self.rows)
            .filter(|(_, row)| row.note.is_none())
            .filter_map(|(submission, row)| {
                let proposal = row.proposal.as_ref().filter(|p| !p.for_no_response)?;
                let grade = StudentResult {
                    student_index: submission.index,
                    score: proposal.score,
                    feedback: proposal.html(),
                };
                Some((StudentWork::from(submission), grade))
            })
            .unzip()
    }

    /// Takes what a fresh consistency check suggests, in place of whatever
    /// was suggested before. Returns how many students it has a suggestion
    /// for.
    pub fn apply_sweep(&mut self, suggestions: Vec<(usize, Suggestion)>) -> usize {
        for row in &mut self.rows {
            if let Some(proposal) = row.proposal.as_mut().filter(|_| row.note.is_none()) {
                proposal.suggestion = None;
                proposal.before_suggestion = None;
            }
        }
        for (index, suggestion) in suggestions {
            let at = self.page.submissions.iter().position(|s| s.index == index);
            let proposal = at
                .and_then(|at| self.rows.get_mut(at))
                .filter(|row| row.note.is_none())
                .and_then(|row| row.proposal.as_mut());
            if let Some(proposal) = proposal
                && (suggestion.score != proposal.score || suggestion.feedback_html.is_some())
            {
                proposal.suggestion = Some(suggestion);
            }
        }
        self.open_suggestions()
    }

    /// How many proposals have a suggestion the teacher has not decided on.
    pub fn open_suggestions(&self) -> usize {
        self.rows
            .iter()
            .filter(|row| row.note.is_none())
            .filter_map(|row| row.proposal.as_ref())
            .filter(|proposal| proposal.suggestion.is_some())
            .count()
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

    /// Takes one student's grade as it arrives, while the rest of the class
    /// is still being graded. Why a student was not graded waits for the
    /// end of the run, which may yet ask about them again.
    pub fn grade_arrived(&mut self, graded: GradedRow) {
        let Some(row) = self.rows.get_mut(graded.index) else {
            return;
        };
        if let Ok(grade) = graded.outcome {
            *row = Row {
                proposal: Some(Proposal::new(grade)),
                note: None,
                early: true,
            };
        }
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
                    // A grade that was already shown may have been changed
                    // or held back by the teacher since. That stands; what
                    // the end of the run adds is the flag and the suggestion.
                    match row
                        .proposal
                        .as_mut()
                        .filter(|shown| row.early && shown.original_html == grade.feedback_html)
                    {
                        Some(shown) => {
                            shown.flag = grade.flag;
                            shown.suggestion = grade
                                .suggestion
                                .filter(|s| s.score != shown.score || s.feedback_html.is_some());
                        }
                        None => row.proposal = Some(Proposal::new(grade)),
                    }
                    row.note = None;
                }
                Err(reason) => {
                    row.proposal = None;
                    row.note = Some(Note::NotGraded(reason));
                }
            }
        }
        // The run is over: nothing is early any more.
        for row in &mut self.rows {
            row.early = false;
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
                        early: false,
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
            if matches!(self.who, Who::One(_)) {
                self.who = Who::default();
            }
        }
        self.page = page;
        // A zero that is now on the page needs no proposing again, and a
        // student who is new to the page may need one.
        self.set_zero_blank(self.zero_blank);
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
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        })
    }

    fn graded(index: usize, score: f64, html: &str) -> GradedRow {
        GradedRow {
            index,
            outcome: Ok(Grade {
                score,
                feedback_html: html.into(),
                flag: None,
                suggestion: None,
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
    fn a_rubric_the_ai_reworded_is_graded_as_it_stands() {
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
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        });
        assert_eq!(s.leniency_for_grading(50), 50);
        // A rewording nobody asked for is not taken.
        s.rubric_reworded("## Concept\nNames the theorem, in any words");
        assert_eq!(s.reworded_at(), None);
        assert!(!s.rubric_edited());

        s.reword_asked_for(50);
        s.rubric_reworded("## Concept\nNames the theorem, in any words");
        assert_eq!(s.reworded_at(), Some(50));
        // The exemplar answer is the teacher's and stays.
        assert_eq!(
            s.rubric_text,
            "## Concept\nNames the theorem, in any words\n\n--- Model Response ---\nThe Central Limit Theorem."
        );
        // Whatever the slider says, the wording is not reworded again.
        assert_eq!(s.leniency_for_grading(50), AS_WRITTEN_LENIENCY);
        assert_eq!(s.leniency_for_grading(10), AS_WRITTEN_LENIENCY);

        // Back to the page's rubric, and leniency rewords at grading again.
        s.restore_rubric_text();
        assert_eq!(s.reworded_at(), None);
        assert_eq!(s.leniency_for_grading(50), 50);
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
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
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

    fn suggested(index: usize, score: f64, to: f64, feedback: Option<&str>) -> GradedRow {
        GradedRow {
            index,
            outcome: Ok(Grade {
                score,
                feedback_html: "<p>First thoughts.</p>".into(),
                flag: None,
                suggestion: Some(Suggestion {
                    score: to,
                    feedback_html: feedback.map(Into::into),
                    reason: None,
                }),
            }),
        }
    }

    #[test]
    fn a_suggestion_changes_nothing_until_it_is_taken() {
        let mut s = session();
        s.apply_grades(report(vec![
            suggested(1, 7.0, 5.5, Some("<p>Second thoughts.</p>")),
            suggested(3, 9.0, 8.0, None),
        ]));
        assert_eq!(s.open_suggestions(), 2);
        assert_eq!(s.status(1), Status::Suggested);
        let writes = s.to_write();
        assert_eq!(writes[0].score.value, 7.0);
        assert_eq!(
            writes[0].feedback.as_ref().unwrap().html,
            "<p>First thoughts.</p>"
        );

        // Taken: the score, and the feedback that goes with it.
        s.rows[1].proposal.as_mut().unwrap().use_suggestion();
        // With no feedback of its own, only the score changes.
        s.rows[3].proposal.as_mut().unwrap().use_suggestion();
        assert_eq!(s.open_suggestions(), 0);
        assert_eq!(s.status(1), Status::Ready);
        let writes = s.to_write();
        assert_eq!(writes[0].score.value, 5.5);
        assert_eq!(
            writes[0].feedback.as_ref().unwrap().html,
            "<p>Second thoughts.</p>"
        );
        assert_eq!(writes[1].score.value, 8.0);
        assert_eq!(
            writes[1].feedback.as_ref().unwrap().html,
            "<p>First thoughts.</p>"
        );
    }

    #[test]
    fn taking_a_suggestion_can_be_gone_back_on() {
        let mut s = session();
        s.apply_grades(report(vec![suggested(
            1,
            7.0,
            5.5,
            Some("<p>Second thoughts.</p>"),
        )]));
        fn proposal(s: &mut Session) -> &mut Proposal {
            s.rows[1].proposal.as_mut().unwrap()
        }
        assert_eq!(
            proposal(&mut s).suggested_feedback().as_deref(),
            Some("Second thoughts.")
        );
        assert!(!proposal(&mut s).suggestion_taken());

        proposal(&mut s).use_suggestion();
        assert!(proposal(&mut s).suggestion_taken());
        proposal(&mut s).undo_suggestion();
        assert!(!proposal(&mut s).suggestion_taken());
        assert_eq!(
            s.status(1),
            Status::Suggested,
            "the suggestion is open again"
        );
        let writes = s.to_write();
        assert_eq!(writes[0].score.value, 7.0);
        assert_eq!(
            writes[0].feedback.as_ref().unwrap().html,
            "<p>First thoughts.</p>"
        );

        // Feedback the teacher wrote after taking it is theirs to keep: only
        // the score goes back.
        proposal(&mut s).use_suggestion();
        proposal(&mut s).text = "My own words.".into();
        proposal(&mut s).mark_edited();
        proposal(&mut s).undo_suggestion();
        let writes = s.to_write();
        assert_eq!(writes[0].score.value, 7.0);
        assert_eq!(
            writes[0].feedback.as_ref().unwrap().html,
            "<p>My own words.</p>"
        );
        // And the suggestion no longer offers to replace them.
        assert_eq!(proposal(&mut s).suggested_feedback(), None);
    }

    #[test]
    fn a_fresh_consistency_check_replaces_what_was_suggested_before() {
        let mut s = session();
        s.set_zero_blank(true);
        s.apply_grades(report(vec![
            suggested(1, 7.0, 5.5, None),
            graded(3, 9.0, "<p>Fine.</p>"),
        ]));
        // The teacher changes a score; the check then looks at that.
        s.rows[3].proposal.as_mut().unwrap().score = 4.0;
        let (students, grades) = s.to_sweep();
        let names: Vec<&str> = students.iter().map(|s| s.name.as_str()).collect();
        // Not the zero for no response: there is nothing to compare.
        assert_eq!(names, ["Brook, Kai", "Diaz, Remy"]);
        assert_eq!(
            grades
                .iter()
                .map(|g| (g.student_index, g.score))
                .collect::<Vec<_>>(),
            [(1, 7.0), (3, 4.0)]
        );
        assert_eq!(grades[1].feedback, "<p>Fine.</p>");

        let found = s.apply_sweep(vec![(
            3,
            Suggestion {
                score: 8.0,
                feedback_html: None,
                reason: Some("Kai said less and got more.".into()),
            },
        )]);
        assert_eq!(found, 1);
        assert_eq!(s.status(1), Status::Ready, "the earlier suggestion is gone");
        assert_eq!(s.status(3), Status::Suggested);
        // A suggestion of the score already there says nothing.
        assert_eq!(
            s.apply_sweep(vec![(
                3,
                Suggestion {
                    score: 4.0,
                    feedback_html: None,
                    reason: None
                }
            )]),
            0
        );
    }

    #[test]
    fn a_grade_that_arrived_early_keeps_what_the_teacher_did_to_it() {
        let mut s = session();
        s.grade_arrived(graded(1, 7.0, "<p>First thoughts.</p>"));
        assert_eq!(s.status(1), Status::Ready);
        assert_eq!(s.status(3), Status::Ungraded, "still being graded");
        // A student the run could not grade yet is not marked so until the
        // run is over: it may ask about them again.
        s.grade_arrived(GradedRow {
            index: 3,
            outcome: Err("the AI gave no score".into()),
        });
        assert_eq!(s.status(3), Status::Ungraded);

        // The teacher lowers the score and holds it back while the rest of
        // the class is graded.
        let kai = s.rows[1].proposal.as_mut().unwrap();
        kai.score = 6.0;
        kai.accepted = false;
        s.apply_grades(report(vec![
            suggested(1, 7.0, 5.5, None),
            graded(3, 9.0, "<p>Fine.</p>"),
        ]));
        let kai = s.rows[1].proposal.as_ref().unwrap();
        assert_eq!((kai.score, kai.accepted), (6.0, false));
        assert!(
            kai.suggestion.is_some(),
            "the end of the run adds its suggestion"
        );
        assert_eq!(s.status(3), Status::Ready);

        // A later run starts afresh.
        s.apply_grades(report(vec![graded(1, 8.0, "<p>First thoughts.</p>")]));
        let kai = s.rows[1].proposal.as_ref().unwrap();
        assert_eq!((kai.score, kai.accepted), (8.0, true));
    }

    #[test]
    fn a_suggestion_set_aside_leaves_the_proposal_as_it_was() {
        let mut s = session();
        s.apply_grades(report(vec![suggested(1, 7.0, 5.5, Some("<p>Other.</p>"))]));
        s.rows[1].proposal.as_mut().unwrap().keep_proposal();
        assert_eq!(s.open_suggestions(), 0);
        assert_eq!(s.to_write()[0].score.value, 7.0);
        // Nothing is left to take.
        s.rows[1].proposal.as_mut().unwrap().use_suggestion();
        assert_eq!(s.to_write()[0].score.value, 7.0);
    }

    #[test]
    fn feedback_the_teacher_wrote_survives_taking_a_suggestion() {
        let mut s = session();
        s.apply_grades(report(vec![suggested(1, 7.0, 5.5, Some("<p>Other.</p>"))]));
        let proposal = s.rows[1].proposal.as_mut().unwrap();
        proposal.text = "My own words.".into();
        proposal.mark_edited();
        proposal.use_suggestion();
        let write = &s.to_write()[0];
        assert_eq!(write.score.value, 5.5);
        assert_eq!(
            write.feedback.as_ref().unwrap().html,
            "<p>My own words.</p>"
        );
    }

    #[test]
    fn a_suggestion_that_changes_nothing_is_not_shown() {
        let mut s = session();
        s.apply_grades(report(vec![suggested(1, 7.0, 7.0, None)]));
        assert_eq!(s.open_suggestions(), 0);
        assert_eq!(s.status(1), Status::Ready);
    }

    #[test]
    fn a_page_without_a_rubric_offers_an_empty_editor() {
        let s = session();
        assert_eq!(s.rubric_text, "");
        assert!(!s.rubric_edited());
        assert_eq!(*s.rubric_outline(), RubricOutline::default());
    }

    fn two_categories() -> Session {
        let rubric: Rubric = serde_json::from_value(serde_json::json!({
            "checklistItems": [
                { "category": "Concept(4 pts)", "items": ["Names the theorem"] },
                { "category": "Writing(2 pts)", "items": ["Uses sentences"] },
            ],
        }))
        .unwrap();
        Session::new(ReadReport {
            page: page(),
            rubric: Ok(rubric),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        })
    }

    #[test]
    fn weights_are_written_into_the_rubric_only_when_the_teacher_sets_them() {
        let mut s = two_categories();
        let outline = s.rubric_outline();
        assert!(!outline.weights_written && outline.weight_problem.is_none());
        assert_eq!(outline.shares.len(), 2);
        assert!(!s.rubric_edited());

        s.share_weights_equally();
        assert!(s.rubric_edited());
        assert!(s.rubric_outline().weights_written);
        assert!(s.rubric_text.starts_with("## Concept(4 pts) [50%]\n"));

        s.set_category_weight("Concept(4 pts)", 70.0);
        assert_eq!(
            s.rubric_outline().weight_problem.as_deref(),
            Some("The category weights add up to 120%. They must add up to 100%.")
        );
        s.set_category_weight("Writing(2 pts)", 30.0);
        assert_eq!(s.rubric_outline().weight_problem, None);
        let weights: Vec<f64> = s.rubric_outline().shares.iter().map(|c| c.weight).collect();
        assert_eq!(weights, [70.0, 30.0]);

        s.remove_weights();
        assert!(!s.rubric_outline().weights_written);
        assert!(!s.rubric_edited(), "the text is the page's again");
    }

    #[test]
    fn reading_the_same_page_again_keeps_what_the_teacher_set_up() {
        let mut first = two_categories();
        first.share_weights_equally();
        first.instructions = "Accept answers in words.".into();
        first.examples_asked_for(50);
        first.examples_arrived("Excellent: all of it.".into());

        let mut again = two_categories();
        again.keep_setup_from(&first);
        assert!(again.rubric_edited() && again.rubric_outline().weights_written);
        assert_eq!(again.instructions, "Accept answers in words.");
        assert_eq!(
            again.examples_for_grading().as_deref(),
            Some("Excellent: all of it.")
        );
        assert!(!again.examples_out_of_date(50));

        // Another question starts clean.
        let mut other = two_categories();
        other.page.url.push_str("&qid=2");
        other.keep_setup_from(&first);
        assert!(!other.rubric_edited());
        assert_eq!(other.examples_for_grading(), None);

        // So does the same page once its own rubric has changed.
        let mut changed = session();
        changed.keep_setup_from(&first);
        assert_eq!(changed.rubric_text, "");
        assert_eq!(changed.instructions, "");
    }

    #[test]
    fn a_rubric_is_saved_as_it_stands_and_put_back_whole() {
        let mut s = two_categories();
        s.share_weights_equally();
        s.instructions = " Accept answers in words. ".into();
        s.examples_asked_for(50);
        s.examples_arrived("Excellent: all of it.".into());
        let saved = s.as_saved("  Unit 4 FRQ ");
        assert_eq!(saved.name, "Unit 4 FRQ");
        assert_eq!(saved.text, s.rubric_text);
        assert_eq!(saved.instructions, "Accept answers in words.");

        // On a page with no rubric of its own.
        let mut bare = session();
        bare.instructions = "Mine.".into();
        bare.use_saved(&saved);
        assert!(bare.rubric_edited());
        assert_eq!(bare.rubric_outline().categories, 2);
        assert!(bare.rubric_outline().weights_written);
        assert_eq!(bare.instructions, "Accept answers in words.");
        assert_eq!(
            bare.examples_for_grading().as_deref(),
            Some("Excellent: all of it.")
        );
        assert!(
            !bare.examples_out_of_date(80),
            "nothing known to compare with"
        );

        // A saved rubric without instructions leaves the teacher's alone.
        let plain = SavedRubric {
            name: "Plain".into(),
            text: "Names the theorem".into(),
            ..SavedRubric::default()
        };
        bare.use_saved(&plain);
        assert_eq!(bare.rubric_text, "Names the theorem");
        assert_eq!(bare.instructions, "Accept answers in words.");
    }

    #[test]
    fn requirements_from_elsewhere_keep_the_exemplar_answer() {
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
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        });
        s.set_requirements("## Thesis [40%]\nStates a position\n## Evidence [60%]\nCites sources");
        assert!(s.rubric_edited());
        let outline = s.rubric_outline();
        assert_eq!((outline.categories, outline.requirements), (2, 2));
        assert!(outline.exemplar && outline.weights_written);
        assert!(s.rubric_text.ends_with("The Central Limit Theorem."));
    }

    #[test]
    fn scoring_examples_go_stale_when_what_they_were_written_for_changes() {
        let mut s = two_categories();
        assert_eq!(s.examples_for_grading(), None);
        assert!(!s.examples_out_of_date(50));

        s.examples_asked_for(50);
        s.examples_arrived("Excellent: all of it.\n\nMinimal: a guess.\n".into());
        assert_eq!(
            s.examples_for_grading().as_deref(),
            Some("Excellent: all of it.\n\nMinimal: a guess.")
        );
        assert!(!s.examples_out_of_date(50));
        // The teacher's own edits to the examples do not make them stale.
        s.examples.push_str("Adequate: most of it.");
        assert!(!s.examples_out_of_date(50));

        assert!(s.examples_out_of_date(80), "another leniency");
        s.rubric_text.push_str("\nNames the units");
        s.rubric_text_changed();
        assert!(s.examples_out_of_date(50), "another rubric");

        s.remove_examples();
        assert_eq!(s.examples_for_grading(), None);
        assert!(!s.examples_out_of_date(50));
    }

    #[test]
    fn only_ungraded_students_with_a_response_are_sent_for_grading() {
        let mut s = session();
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Brook, Kai", "Diaz, Remy"]);
        assert_eq!(s.status(0), Status::HasPoints);
        assert_eq!(s.status(1), Status::Ungraded);
        assert_eq!(s.status(2), Status::NoResponse);

        s.set_who(Who::Everyone);
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Avery, Sam", "Brook, Kai", "Diaz, Remy"]);
    }

    fn session_on(page: GradingPage) -> Session {
        Session::new(ReadReport {
            page,
            rubric: Ok(Rubric::default()),
            site: "MyOpenMath",
            saves_on_write: false,
            manual_save: false,
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        })
    }

    #[test]
    fn a_run_can_take_late_work_or_one_student() {
        let mut graded_zero = page();
        graded_zero.submissions[1].feedback.as_mut().unwrap().text = "Nothing handed in.".into();
        let mut s = session_on(graded_zero);
        let names =
            |s: &Session| -> Vec<String> { s.to_grade().into_iter().map(|w| w.name).collect() };
        assert_eq!(names(&s), ["Diaz, Remy"]);

        // Late work: at zero, whatever the feedback says, and answered now.
        s.set_who(Who::Late);
        assert_eq!(names(&s), ["Brook, Kai", "Diaz, Remy"]);
        assert_eq!(s.late_with_feedback(), 1);

        // One student, graded already or not.
        s.set_who(Who::One(0));
        assert_eq!(names(&s), ["Avery, Sam"]);
        assert_eq!(s.grade_count(), 1);
        // Not one with nothing to grade.
        s.set_who(Who::One(2));
        assert_eq!(s.who(), Who::One(0));
    }

    #[test]
    fn a_zero_for_no_response_is_a_proposal_the_teacher_can_take_back() {
        let mut s = session();
        assert_eq!(s.blank_count(), 1);
        assert!(s.to_write().is_empty());

        s.set_zero_blank(true);
        assert_eq!(s.status(2), Status::Ready);
        assert!(s.only_zeros_waiting());
        let writes = s.to_write();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].name, "Cruz, Jo");
        assert_eq!(writes[0].score.value, 0.0);
        assert_eq!(writes[0].feedback, None);
        // Students who answered are the AI's to grade, whatever their score.
        assert_eq!(s.status(1), Status::Ungraded);

        s.set_zero_blank(false);
        assert_eq!(s.status(2), Status::NoResponse);
        assert!(s.to_write().is_empty());
    }

    #[test]
    fn no_zero_is_proposed_where_there_is_already_a_grade() {
        let mut already = page();
        // A zero in the box, and a blank box with feedback beside it.
        already.submissions[2].scores[0].raw = "0".into();
        already
            .submissions
            .push(submission(4, "Ellis, Pat", "", "Excused.", ""));
        let mut s = session_on(already);
        assert_eq!(s.blank_count(), 0);
        s.set_zero_blank(true);
        assert!(s.to_write().is_empty());
        assert_eq!(s.status(4), Status::HasFeedback);
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
            questions: Vec::new(),
            saved_rubrics: Vec::new(),
            skills: Vec::new(),
        });
        let names: Vec<_> = s.to_grade().into_iter().map(|w| w.name).collect();
        assert_eq!(names, ["Diaz, Remy"], "Kai was given a zero on purpose");
        assert_eq!(s.status(1), Status::HasFeedback);

        s.set_who(Who::Everyone);
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
        s.set_who(Who::Everyone);
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
    fn edited_feedback_keeps_its_formatting_and_is_escaped() {
        let mut s = session();
        s.apply_grades(report(vec![graded(
            1,
            7.0,
            "<p>Good <strong>start</strong>.</p>",
        )]));
        let proposal = s.rows[1].proposal.as_mut().unwrap();
        // The editor shows the AI's formatting as marks the teacher can keep.
        assert_eq!(proposal.text, "Good **start**.");

        proposal.text = "Good **start**, Kai.\nCheck x_1 < 3.\n\n<script>alert(1)</script>".into();
        proposal.mark_edited();
        assert_eq!(
            proposal.html(),
            "<p>Good <strong>start</strong>, Kai.<br>Check x_1 &lt; 3.</p>\
             <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
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
            examples: None,
            skills: Vec::new(),
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
