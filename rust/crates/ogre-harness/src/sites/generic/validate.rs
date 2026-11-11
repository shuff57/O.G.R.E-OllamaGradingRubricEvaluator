//! Checking a profile against the page it is about to drive.

use std::fmt;

use ogre_core::FeedbackKind;

use super::inspect::{self, Inspection, Student};
use super::profile::{MaxScoreRule, PageMap, SaveButton, SiteProfile};
use crate::{PageDriver, Result};

/// How many students a report shows in full.
const SAMPLE_SIZE: usize = 3;

/// A part of the page that a profile points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Element {
    StudentSection,
    StudentName,
    ScoreInput,
    MaxScore,
    Feedback,
    FeedbackHiddenField,
    Response,
    Prompt,
    SaveButton,
    SaveConfirmation,
}

impl Element {
    pub fn label(self) -> &'static str {
        match self {
            Self::StudentSection => "student section",
            Self::StudentName => "student name",
            Self::ScoreInput => "score box",
            Self::MaxScore => "maximum score",
            Self::Feedback => "feedback box",
            Self::FeedbackHiddenField => "hidden feedback field",
            Self::Response => "student response",
            Self::Prompt => "question prompt",
            Self::SaveButton => "save button",
            Self::SaveConfirmation => "save confirmation",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    /// The profile must not be used on this page.
    Error,
    /// The profile works, with a limit the teacher should know about.
    Warning,
}

/// Something wrong with how a profile fits the page. The message never
/// contains text from the page, so it is safe to show to an AI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub element: Element,
    pub severity: Severity,
    pub message: String,
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.element.label(), self.message)
    }
}

/// How one mapped element matched across the students on the page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ElementCheck {
    pub element: Element,
    /// The selector, or a description of the rule for elements found another way.
    pub rule: String,
    /// Students for whom it matched nothing, exactly one element, or several.
    /// For the student section and the save button, which are looked up once
    /// for the page, exactly one of these is 1.
    pub none: usize,
    pub one: usize,
    pub several: usize,
}

/// What was read for one student, for the teacher to check by eye.
#[derive(Debug, Clone, PartialEq)]
pub struct StudentSample {
    pub name: String,
    /// The score box's contents.
    pub score: String,
    pub max: Option<f64>,
    /// Length of the response once converted to markdown.
    pub response_chars: usize,
    pub has_feedback_box: bool,
}

/// The result of trying a profile on a live page.
#[derive(Debug, Clone)]
pub struct ValidationReport {
    profile: SiteProfile,
    problems: Vec<Problem>,
    pub url: String,
    /// Student sections shown on the page.
    pub students: usize,
    /// Sections the selector matches that are not shown; they are ignored.
    pub hidden_sections: usize,
    pub elements: Vec<ElementCheck>,
    /// The first few students as read.
    pub samples: Vec<StudentSample>,
    /// What the feedback boxes turned out to be, when they all agree.
    pub feedback_kind_seen: Option<FeedbackKind>,
}

impl ValidationReport {
    pub fn profile(&self) -> &SiteProfile {
        &self.profile
    }

    pub fn problems(&self) -> &[Problem] {
        &self.problems
    }

    /// The problems that make the profile unusable.
    pub fn errors(&self) -> impl Iterator<Item = &Problem> {
        self.problems
            .iter()
            .filter(|p| p.severity == Severity::Error)
    }

    pub fn has_error(&self, element: Element) -> bool {
        self.errors().any(|p| p.element == element)
    }

    pub fn passed(&self) -> bool {
        self.errors().next().is_none()
    }

    /// The profile as one that may drive this page, or the report back if it
    /// did not pass.
    pub fn into_validated(self) -> std::result::Result<ValidatedProfile, Box<Self>> {
        if self.passed() {
            Ok(ValidatedProfile {
                profile: self.profile,
                url: self.url,
            })
        } else {
            Err(Box::new(self))
        }
    }

    /// The errors as one sentence per line.
    pub fn error_summary(&self) -> String {
        let lines: Vec<String> = self.errors().map(Problem::to_string).collect();
        lines.join("\n")
    }
}

/// A profile that passed validation against a live page. The only way to get
/// one is [`ValidationReport::into_validated`], and [`super::ProfileAdapter`]
/// accepts nothing else.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedProfile {
    profile: SiteProfile,
    url: String,
}

impl ValidatedProfile {
    pub fn profile(&self) -> &SiteProfile {
        &self.profile
    }

    /// The address of the page the profile was validated on.
    pub fn validated_on(&self) -> &str {
        &self.url
    }

    pub fn into_profile(self) -> SiteProfile {
        self.profile
    }
}

/// Tries `profile` on the page: looks up every element it maps for every
/// student shown, and reports what was found. Changes nothing on the page.
pub async fn validate_profile(
    page: &dyn PageDriver,
    profile: &SiteProfile,
) -> Result<ValidationReport> {
    let found = inspect::inspect(page, &profile.page).await?;
    Ok(report(profile, &found))
}

pub(super) fn report(profile: &SiteProfile, found: &Inspection) -> ValidationReport {
    let map = &profile.page;
    let students = &found.students;
    let mut checks = Checks {
        students: students.len(),
        single_page: map.student_section.is_none(),
        problems: Vec::new(),
        elements: Vec::new(),
    };

    checks.sections(map, found);
    if !students.is_empty() {
        checks.names(map, students);
        checks.scores(map, students);
        checks.max_scores(map, students);
        checks.feedback(map, students);
        checks.content(Element::Response, &map.response, students, |s| {
            Some(&s.response)
        });
        if let Some(selector) = &map.prompt {
            checks.content(Element::Prompt, selector, students, |s| s.prompt.as_ref());
        }
    }
    checks.save(map, found);

    ValidationReport {
        profile: profile.clone(),
        problems: checks.problems,
        url: found.url.clone(),
        students: students.len(),
        hidden_sections: found.sections.hidden,
        elements: checks.elements,
        samples: students.iter().take(SAMPLE_SIZE).map(sample).collect(),
        feedback_kind_seen: feedback_kind_seen(students),
    }
}

fn sample(student: &Student) -> StudentSample {
    StudentSample {
        name: student.name.text.clone(),
        score: student.score.raw.clone().unwrap_or_default(),
        max: student.max.as_ref().and_then(|max| max.value),
        response_chars: student.response.markdown().chars().count(),
        has_feedback_box: student.feedback.as_ref().is_some_and(|f| f.count == 1),
    }
}

fn feedback_kind_seen(students: &[Student]) -> Option<FeedbackKind> {
    let mut kinds = students
        .iter()
        .filter_map(|s| s.feedback.as_ref())
        .filter(|f| f.count == 1)
        .map(|f| f.kind);
    let first = kinds.next()??;
    kinds.all(|kind| kind == Some(first)).then_some(first)
}

fn kind_name(kind: FeedbackKind) -> &'static str {
    match kind {
        FeedbackKind::Textarea => "a plain text box",
        FeedbackKind::RichText => "a rich text area",
    }
}

/// What to do when an element is missing for some students but not all.
#[derive(Clone, Copy)]
enum SomeMissing {
    /// The profile is wrong.
    Error,
    /// Those students are limited in the way the note says.
    Warning(&'static str),
}

struct Checks {
    students: usize,
    single_page: bool,
    problems: Vec<Problem>,
    elements: Vec<ElementCheck>,
}

impl Checks {
    fn error(&mut self, element: Element, message: impl Into<String>) {
        self.problems.push(Problem {
            element,
            severity: Severity::Error,
            message: message.into(),
        });
    }

    fn warning(&mut self, element: Element, message: impl Into<String>) {
        self.problems.push(Problem {
            element,
            severity: Severity::Warning,
            message: message.into(),
        });
    }

    /// "every student" or "2 of 5 students".
    fn share(&self, count: usize) -> String {
        if count == self.students {
            if self.students == 1 {
                "the student".to_owned()
            } else {
                "every student".to_owned()
            }
        } else {
            format!("{count} of {} students", self.students)
        }
    }

    fn sections(&mut self, map: &PageMap, found: &Inspection) {
        let Some(selector) = &map.student_section else {
            return;
        };
        let element = Element::StudentSection;
        let sections = &found.sections;
        let shown = found.students.len();
        self.elements.push(ElementCheck {
            element,
            rule: selector.clone(),
            none: usize::from(shown == 0),
            one: usize::from(shown == 1),
            several: usize::from(shown > 1),
        });
        if sections.invalid {
            self.error(element, format!("`{selector}` is not a valid CSS selector"));
        } else if sections.matched == 0 {
            self.error(element, format!("`{selector}` matches nothing on the page"));
        } else if shown == 0 {
            self.error(
                element,
                format!(
                    "`{selector}` matches {} elements, all of them hidden",
                    sections.matched
                ),
            );
        } else if sections.hidden > 0 {
            self.warning(
                element,
                format!(
                    "{} hidden elements match `{selector}` and are ignored",
                    sections.hidden
                ),
            );
        }
        if sections.nested > 0 {
            self.error(
                element,
                format!(
                    "`{selector}` matches elements that contain each other; it has to match one element per student"
                ),
            );
        }
    }

    /// Records how a selector matched per student and reports the mismatches.
    /// Returns false if the selector is unusable for every student.
    fn matches(
        &mut self,
        element: Element,
        selector: &str,
        counts: impl Iterator<Item = (usize, bool)>,
        some_missing: SomeMissing,
    ) -> bool {
        let (mut none, mut one, mut several, mut invalid) = (0, 0, 0, false);
        for (count, bad) in counts {
            invalid |= bad;
            match count {
                0 => none += 1,
                1 => one += 1,
                _ => several += 1,
            }
        }
        self.elements.push(ElementCheck {
            element,
            rule: selector.to_owned(),
            none,
            one,
            several,
        });
        if invalid {
            self.error(element, format!("`{selector}` is not a valid CSS selector"));
            return false;
        }
        if several > 0 {
            let share = self.share(several);
            self.error(
                element,
                format!(
                    "`{selector}` matches several elements for {share}; it has to match exactly one"
                ),
            );
        }
        if none == self.students {
            let place = if self.single_page {
                "on the page"
            } else {
                "inside any student section"
            };
            self.error(element, format!("`{selector}` matches nothing {place}"));
        } else if none > 0 {
            let share = self.share(none);
            match some_missing {
                SomeMissing::Error => {
                    self.error(element, format!("`{selector}` matches nothing for {share}"));
                }
                SomeMissing::Warning(effect) => self.warning(
                    element,
                    format!("`{selector}` matches nothing for {share}; {effect}"),
                ),
            }
        }
        one > 0
    }

    fn names(&mut self, map: &PageMap, students: &[Student]) {
        let element = Element::StudentName;
        let counts = students.iter().map(|s| (s.name.count, s.name.invalid));
        if !self.matches(element, &map.student_name, counts, SomeMissing::Error) {
            return;
        }
        let blank = students
            .iter()
            .filter(|s| s.name.count == 1 && s.name.text.trim().is_empty())
            .count();
        if blank > 0 {
            let share = self.share(blank);
            self.error(
                element,
                format!("`{}` holds no text for {share}", map.student_name),
            );
        }
    }

    fn scores(&mut self, map: &PageMap, students: &[Student]) {
        let element = Element::ScoreInput;
        let selector = &map.score_input;
        let counts = students.iter().map(|s| (s.score.count, s.score.invalid));
        let missing = SomeMissing::Warning("they will be skipped");
        if !self.matches(element, selector, counts, missing) {
            return;
        }
        let boxes: Vec<_> = students
            .iter()
            .map(|s| &s.score)
            .filter(|s| s.count == 1)
            .collect();
        if let Some(other) = boxes.iter().find(|s| !s.is_input) {
            let control = other.control.as_deref().unwrap_or("different element");
            self.error(
                element,
                format!("`{selector}` is a {control}, not a text or number box"),
            );
            return;
        }
        let hidden = boxes.iter().filter(|s| !s.shown).count();
        if hidden > 0 {
            let share = self.share(hidden);
            self.error(element, format!("`{selector}` is hidden for {share}"));
        }
        let locked = boxes.iter().filter(|s| !s.writable).count();
        if locked == boxes.len() {
            self.error(element, format!("`{selector}` is read-only"));
        } else if locked > 0 {
            let share = self.share(locked);
            self.warning(
                element,
                format!("`{selector}` is read-only for {share}; they cannot be written"),
            );
        }
    }

    fn max_scores(&mut self, map: &PageMap, students: &[Student]) {
        let element = Element::MaxScore;
        let Some(rule) = &map.max_score else {
            self.warning(
                element,
                "no maximum score is mapped, so scores cannot be checked against one",
            );
            return;
        };
        // Only students with a score box have a maximum to find.
        let maxes: Vec<_> = students.iter().filter_map(|s| s.max.as_ref()).collect();
        let rule_text = match rule {
            MaxScoreRule::Selector { selector, .. } => selector.clone(),
            MaxScoreRule::NearbyText { pattern } => {
                format!("text near the score box matching /{pattern}/")
            }
            MaxScoreRule::Fixed { value } => format!("always {value}"),
        };
        let count_of = |n: usize| {
            maxes
                .iter()
                .filter(|m| m.count.map_or(usize::from(m.value.is_some()), |c| c.min(2)) == n)
                .count()
        };
        self.elements.push(ElementCheck {
            element,
            rule: rule_text.clone(),
            none: count_of(0),
            one: count_of(1),
            several: count_of(2),
        });
        if maxes.iter().any(|m| m.invalid) {
            self.error(
                element,
                format!("{rule_text}: the selector or pattern is not valid"),
            );
            return;
        }
        let several = maxes
            .iter()
            .filter(|m| m.count.is_some_and(|c| c > 1))
            .count();
        if several > 0 {
            let share = self.share(several);
            self.error(
                element,
                format!("`{rule_text}` matches several elements for {share}; it has to match exactly one"),
            );
        }
        let unknown = maxes.iter().filter(|m| m.value.is_none()).count();
        if unknown > 0 {
            let share = self.share(unknown);
            self.error(
                element,
                format!("no maximum score was found for {share} using {rule_text}"),
            );
        }
        if maxes.iter().any(|m| m.value.is_some_and(|v| v <= 0.0)) {
            self.error(
                element,
                format!("{rule_text} gives a maximum score of zero or less"),
            );
        }
    }

    fn feedback(&mut self, map: &PageMap, students: &[Student]) {
        let element = Element::Feedback;
        let Some(rule) = &map.feedback else {
            self.warning(
                element,
                "no feedback box is mapped, so only scores can be written",
            );
            return;
        };
        let selector = &rule.selector;
        let counts = students
            .iter()
            .filter_map(|s| s.feedback.as_ref())
            .map(|f| (f.count, f.invalid));
        let missing = SomeMissing::Warning("only their score can be written");
        if !self.matches(element, selector, counts, missing) {
            return;
        }
        let boxes: Vec<_> = students
            .iter()
            .filter_map(|s| s.feedback.as_ref())
            .filter(|f| f.count == 1)
            .collect();
        if boxes.iter().any(|f| f.kind.is_none()) {
            self.error(
                element,
                format!("`{selector}` is not a text box or an editable area"),
            );
            return;
        }
        if let Some(seen) = boxes
            .iter()
            .filter_map(|f| f.kind)
            .find(|k| *k != rule.kind)
        {
            self.error(
                element,
                format!(
                    "`{selector}` is {} but the profile says {}",
                    kind_name(seen),
                    kind_name(rule.kind)
                ),
            );
        }
        if let Some(editor) = boxes.iter().find_map(|f| f.foreign.as_deref()) {
            self.error(
                element,
                format!("`{selector}` belongs to {editor}, an editor OGRE cannot write through"),
            );
        }
        let locked = boxes.iter().filter(|f| !f.writable).count();
        if locked == boxes.len() {
            self.error(element, format!("`{selector}` is read-only"));
        } else if locked > 0 {
            let share = self.share(locked);
            self.warning(
                element,
                format!("`{selector}` is read-only for {share}; only their score can be written"),
            );
        }

        if let Some(hidden) = &rule.hidden_field {
            let element = Element::FeedbackHiddenField;
            let fields: Vec<_> = boxes.iter().filter_map(|f| f.hidden.as_ref()).collect();
            let count_of = |n: usize| fields.iter().filter(|m| m.count.min(2) == n).count();
            self.elements.push(ElementCheck {
                element,
                rule: hidden.clone(),
                none: count_of(0),
                one: count_of(1),
                several: count_of(2),
            });
            if fields.iter().any(|m| m.invalid) {
                self.error(element, format!("`{hidden}` is not a valid CSS selector"));
            } else if count_of(1) != fields.len() {
                let share = self.share(fields.len() - count_of(1));
                self.error(
                    element,
                    format!("`{hidden}` does not match exactly one field for {share}"),
                );
            }
        }
    }

    fn content<'a>(
        &mut self,
        element: Element,
        selector: &str,
        students: &'a [Student],
        pick: impl Fn(&'a Student) -> Option<&'a inspect::Content>,
    ) {
        let found: Vec<_> = students.iter().filter_map(pick).collect();
        let counts = found.iter().map(|c| (c.count, c.invalid));
        let missing = SomeMissing::Warning(match element {
            Element::Response => "they have no answer to grade",
            _ => "they are graded without it",
        });
        if !self.matches(element, selector, counts, missing) {
            return;
        }
        let read: Vec<_> = found.iter().filter(|c| c.count == 1).collect();
        if read.iter().any(|c| c.blocked) {
            self.error(
                element,
                format!("`{selector}` is a frame from another site, which cannot be read"),
            );
            return;
        }
        if read.iter().all(|c| c.markdown().is_empty()) {
            let share = self.share(read.len());
            self.error(element, format!("`{selector}` is empty for {share}"));
        }
    }

    fn save(&mut self, map: &PageMap, found: &Inspection) {
        let (Some(rule), Some(seen)) = (&map.save, &found.save) else {
            self.warning(
                Element::SaveButton,
                "no save button is mapped; the teacher saves in the browser",
            );
            return;
        };
        let element = Element::SaveButton;
        let rule_text = match &rule.button {
            SaveButton::Selector { selector } => format!("`{selector}`"),
            SaveButton::Text { text } => format!("a button labelled \"{text}\""),
        };
        self.elements.push(ElementCheck {
            element,
            rule: rule_text.clone(),
            none: usize::from(seen.count == 0),
            one: usize::from(seen.count == 1),
            several: usize::from(seen.count > 1),
        });
        if seen.invalid {
            self.error(element, format!("{rule_text} is not a valid CSS selector"));
        } else if seen.count == 0 {
            self.error(element, format!("{rule_text} was not found on the page"));
        } else if seen.count > 1 {
            self.error(
                element,
                format!(
                    "{rule_text} matches {} buttons; it has to be the page's one save button",
                    seen.count
                ),
            );
        }

        let element = Element::SaveConfirmation;
        match &rule.success {
            None => self.warning(
                element,
                "nothing says how a finished save looks, so OGRE will not click the button; the teacher saves in the browser",
            ),
            Some(success) => {
                if seen.success_invalid {
                    self.error(
                        element,
                        format!("`{}` is not a valid CSS selector", success.selector),
                    );
                }
                if seen.pattern_invalid {
                    self.error(element, "the pattern is not a valid regular expression");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::super::inspect::testing::{decode, inspection, student};
    use super::super::profile::{FeedbackBox, SaveRule, SaveSuccess, UrlRule};
    use super::*;

    fn profile() -> SiteProfile {
        SiteProfile::new(
            "example",
            "Example",
            UrlRule::new("lms.example.edu", "/grade"),
            PageMap {
                student_section: Some("div.row".into()),
                student_name: ".name".into(),
                score_input: "input.score".into(),
                max_score: Some(MaxScoreRule::usual()),
                feedback: Some(FeedbackBox {
                    selector: "textarea".into(),
                    kind: FeedbackKind::Textarea,
                    hidden_field: None,
                }),
                response: ".answer".into(),
                prompt: None,
                save: None,
            },
        )
    }

    fn three() -> Vec<Value> {
        vec![
            student(0, "Alice Johnson"),
            student(1, "Bob Smith"),
            student(2, "Carol Davis"),
        ]
    }

    fn errors(report: &ValidationReport) -> Vec<String> {
        report.errors().map(Problem::to_string).collect()
    }

    fn check(report: &ValidationReport, element: Element) -> (usize, usize, usize) {
        let found = report
            .elements
            .iter()
            .find(|c| c.element == element)
            .unwrap_or_else(|| panic!("{element:?} was not checked"));
        (found.none, found.one, found.several)
    }

    #[test]
    fn a_profile_that_fits_passes_and_becomes_usable() {
        let report = report(&profile(), &decode(inspection(three())));
        assert_eq!(errors(&report), Vec::<String>::new());
        assert!(report.passed());
        assert_eq!(report.students, 3);
        assert_eq!(check(&report, Element::StudentSection), (0, 0, 1));
        assert_eq!(check(&report, Element::StudentName), (0, 3, 0));
        assert_eq!(check(&report, Element::ScoreInput), (0, 3, 0));
        assert_eq!(check(&report, Element::MaxScore), (0, 3, 0));
        assert_eq!(check(&report, Element::Response), (0, 3, 0));
        assert_eq!(report.feedback_kind_seen, Some(FeedbackKind::Textarea));
        assert_eq!(
            report.samples[1],
            StudentSample {
                name: "Bob Smith".into(),
                score: String::new(),
                max: Some(10.0),
                response_chars: "An answer.".len(),
                has_feedback_box: true,
            }
        );
        // The only remark is that nothing is mapped for saving.
        assert_eq!(report.problems().len(), 1);
        assert_eq!(report.problems()[0].element, Element::SaveButton);
        assert_eq!(report.problems()[0].severity, Severity::Warning);

        let validated = report.into_validated().expect("passed");
        assert_eq!(validated.profile(), &profile());
        assert_eq!(validated.validated_on(), "https://lms.example.edu/grade");
    }

    #[test]
    fn a_section_selector_that_matches_nothing_is_the_only_complaint() {
        let mut page = inspection(vec![]);
        page["sections"]["matched"] = json!(0);
        let report = report(&profile(), &decode(page));
        assert_eq!(
            errors(&report),
            ["student section: `div.row` matches nothing on the page"]
        );
        let unusable = report.into_validated().expect_err("did not pass");
        assert_eq!(unusable.students, 0);
    }

    #[test]
    fn invalid_hidden_and_nested_sections_are_told_apart() {
        let mut invalid = inspection(vec![]);
        invalid["sections"]["invalid"] = json!(true);
        assert_eq!(
            errors(&report(&profile(), &decode(invalid))),
            ["student section: `div.row` is not a valid CSS selector"]
        );

        let mut all_hidden = inspection(vec![]);
        all_hidden["sections"] =
            json!({ "invalid": false, "matched": 4, "hidden": 4, "nested": 0 });
        assert_eq!(
            errors(&report(&profile(), &decode(all_hidden))),
            ["student section: `div.row` matches 4 elements, all of them hidden"]
        );

        let mut some_hidden = inspection(three());
        some_hidden["sections"] =
            json!({ "invalid": false, "matched": 5, "hidden": 2, "nested": 0 });
        let found = report(&profile(), &decode(some_hidden));
        assert!(found.passed());
        assert_eq!(found.hidden_sections, 2);
        assert!(found.problems().iter().any(|p| p.to_string()
            == "student section: 2 hidden elements match `div.row` and are ignored"));

        let mut nested = inspection(three());
        nested["sections"]["nested"] = json!(1);
        assert_eq!(
            errors(&report(&profile(), &decode(nested))),
            [
                "student section: `div.row` matches elements that contain each other; it has to match one element per student"
            ]
        );
    }

    #[test]
    fn selectors_that_match_nothing_or_several_per_student_are_errors() {
        let mut students = three();
        for s in &mut students {
            s["name"] = json!({ "count": 0, "invalid": false, "text": "" });
        }
        students[1]["score"] = json!({ "count": 2, "invalid": false });
        students[1]["max"] = Value::Null;
        students[2]["response"] = json!({ "count": 3, "invalid": false });
        let report = report(&profile(), &decode(inspection(students)));
        assert_eq!(
            errors(&report),
            [
                "student name: `.name` matches nothing inside any student section",
                "score box: `input.score` matches several elements for 1 of 3 students; it has to match exactly one",
                "student response: `.answer` matches several elements for 1 of 3 students; it has to match exactly one",
            ]
        );
        assert_eq!(check(&report, Element::StudentName), (3, 0, 0));
        assert_eq!(check(&report, Element::ScoreInput), (0, 2, 1));
        assert_eq!(check(&report, Element::Response), (0, 2, 1));
    }

    #[test]
    fn a_name_missing_for_one_student_is_an_error_but_a_missing_score_box_is_not() {
        let mut students = three();
        students[0]["name"] = json!({ "count": 0, "invalid": false, "text": "" });
        students[2]["name"]["text"] = json!("  ");
        students[1]["score"] = json!({ "count": 0, "invalid": false });
        students[1]["max"] = Value::Null;
        students[1]["response"] = json!({ "count": 0, "invalid": false });
        let report = report(&profile(), &decode(inspection(students)));
        assert_eq!(
            errors(&report),
            [
                "student name: `.name` matches nothing for 1 of 3 students",
                "student name: `.name` holds no text for 1 of 3 students",
            ]
        );
        let warnings: Vec<_> = report
            .problems()
            .iter()
            .filter(|p| p.severity == Severity::Warning)
            .map(Problem::to_string)
            .collect();
        assert_eq!(
            warnings[..2],
            [
                "score box: `input.score` matches nothing for 1 of 3 students; they will be skipped",
                "student response: `.answer` matches nothing for 1 of 3 students; they have no answer to grade",
            ]
        );
        assert_eq!(check(&report, Element::MaxScore), (0, 2, 0));
    }

    #[test]
    fn a_score_box_must_be_a_visible_writable_input() {
        let mut students = three();
        for s in &mut students {
            s["score"]["control"] = json!("select");
            s["score"]["is_input"] = json!(false);
            s["score"]["writable"] = json!(false);
        }
        assert_eq!(
            errors(&report(&profile(), &decode(inspection(students)))),
            ["score box: `input.score` is a select, not a text or number box"]
        );

        let mut students = three();
        for s in &mut students {
            s["score"]["writable"] = json!(false);
        }
        students[0]["score"]["shown"] = json!(false);
        assert_eq!(
            errors(&report(&profile(), &decode(inspection(students)))),
            [
                "score box: `input.score` is hidden for 1 of 3 students",
                "score box: `input.score` is read-only",
            ]
        );

        let mut students = three();
        students[2]["score"]["writable"] = json!(false);
        let found = report(&profile(), &decode(inspection(students)));
        assert!(found.passed());
        assert!(found.problems().iter().any(|p| p.to_string()
            == "score box: `input.score` is read-only for 1 of 3 students; they cannot be written"));
    }

    #[test]
    fn a_maximum_that_cannot_be_found_is_an_error_and_an_unmapped_one_a_warning() {
        let mut students = three();
        students[0]["max"] = json!({ "value": null });
        students[1]["max"] = json!({ "value": 0.0 });
        let found = report(&profile(), &decode(inspection(students)));
        let pattern = MaxScoreRule::USUAL_PATTERN;
        assert_eq!(
            errors(&found),
            [
                format!(
                    "maximum score: no maximum score was found for 1 of 3 students using text near the score box matching /{pattern}/"
                ),
                format!(
                    "maximum score: text near the score box matching /{pattern}/ gives a maximum score of zero or less"
                ),
            ]
        );
        assert_eq!(check(&found, Element::MaxScore), (1, 2, 0));

        let mut unmapped = profile();
        unmapped.page.max_score = None;
        let found = report(&unmapped, &decode(inspection(three())));
        assert!(found.passed());
        assert!(
            found
                .problems()
                .iter()
                .any(|p| { p.element == Element::MaxScore && p.severity == Severity::Warning })
        );

        let mut by_selector = profile();
        by_selector.page.max_score = Some(MaxScoreRule::Selector {
            selector: ".max".into(),
            pattern: None,
        });
        let mut students = three();
        students[0]["max"] = json!({ "value": null, "count": 2 });
        students[1]["max"] = json!({ "value": null, "count": 0 });
        students[2]["max"] = json!({ "value": 10.0, "count": 1 });
        let found = report(&by_selector, &decode(inspection(students)));
        assert_eq!(check(&found, Element::MaxScore), (1, 1, 1));
        assert_eq!(
            errors(&found),
            [
                "maximum score: `.max` matches several elements for 1 of 3 students; it has to match exactly one",
                "maximum score: no maximum score was found for 2 of 3 students using .max",
            ]
        );
    }

    #[test]
    fn feedback_boxes_must_be_editable_and_of_the_kind_the_profile_says() {
        let mut students = three();
        for s in &mut students {
            s["feedback"]["kind"] = Value::Null;
            s["feedback"]["writable"] = json!(false);
        }
        let found = report(&profile(), &decode(inspection(students)));
        assert_eq!(
            errors(&found),
            ["feedback box: `textarea` is not a text box or an editable area"]
        );
        assert_eq!(found.feedback_kind_seen, None);

        let mut students = three();
        for s in &mut students {
            s["feedback"]["kind"] = json!("rich_text");
            s["feedback"]["foreign"] = json!("Quill");
        }
        let found = report(&profile(), &decode(inspection(students)));
        assert_eq!(
            errors(&found),
            [
                "feedback box: `textarea` is a rich text area but the profile says a plain text box",
                "feedback box: `textarea` belongs to Quill, an editor OGRE cannot write through",
            ]
        );
        assert_eq!(found.feedback_kind_seen, Some(FeedbackKind::RichText));

        let mut students = three();
        students[1]["feedback"] = json!({ "count": 0, "invalid": false });
        let found = report(&profile(), &decode(inspection(students)));
        assert!(found.passed());
        assert!(!found.samples[1].has_feedback_box);
        assert!(found.problems().iter().any(|p| p.to_string()
            == "feedback box: `textarea` matches nothing for 1 of 3 students; only their score can be written"));
    }

    #[test]
    fn a_hidden_feedback_field_has_to_match_once_per_student() {
        let mut rich = profile();
        rich.page.feedback = Some(FeedbackBox {
            selector: "div.editor".into(),
            kind: FeedbackKind::RichText,
            hidden_field: Some("input[type=hidden]".into()),
        });
        let mut students = three();
        for s in &mut students {
            s["feedback"]["kind"] = json!("rich_text");
            s["feedback"]["hidden"] = json!({ "count": 1, "invalid": false });
        }
        assert!(report(&rich, &decode(inspection(students.clone()))).passed());

        students[0]["feedback"]["hidden"] = json!({ "count": 2, "invalid": false });
        let found = report(&rich, &decode(inspection(students)));
        assert_eq!(
            errors(&found),
            [
                "hidden feedback field: `input[type=hidden]` does not match exactly one field for 1 of 3 students"
            ]
        );
        assert_eq!(check(&found, Element::FeedbackHiddenField), (0, 2, 1));
    }

    #[test]
    fn a_response_in_a_foreign_frame_or_empty_for_everyone_is_an_error() {
        let mut students = three();
        students[0]["response"] = json!({ "count": 1, "invalid": false, "blocked": true });
        assert_eq!(
            errors(&report(&profile(), &decode(inspection(students)))),
            ["student response: `.answer` is a frame from another site, which cannot be read"]
        );

        let mut students = three();
        for s in &mut students {
            s["response"]["html"] = json!("<p> </p>");
        }
        assert_eq!(
            errors(&report(&profile(), &decode(inspection(students)))),
            ["student response: `.answer` is empty for every student"]
        );

        // One student who has not answered is not a mapping problem.
        let mut students = three();
        students[0]["response"]["html"] = json!("");
        assert!(report(&profile(), &decode(inspection(students))).passed());
    }

    #[test]
    fn a_page_showing_one_student_is_checked_without_a_section() {
        let mut single = profile();
        single.page.student_section = None;
        let mut students = vec![student(0, "Carol Davis")];
        students[0]["score"] = json!({ "count": 0, "invalid": false });
        students[0]["max"] = Value::Null;
        let found = report(&single, &decode(inspection(students)));
        assert_eq!(
            errors(&found),
            ["score box: `input.score` matches nothing on the page"]
        );
        assert!(
            found
                .elements
                .iter()
                .all(|c| c.element != Element::StudentSection)
        );
    }

    #[test]
    fn the_save_button_must_be_the_only_one_and_its_confirmation_well_formed() {
        let mut saving = profile();
        saving.page.save = Some(SaveRule {
            button: SaveButton::Text {
                text: "Save".into(),
            },
            success: None,
        });
        let mut page = inspection(three());
        page["save"] = json!({ "count": 3, "invalid": false, "success_invalid": false, "pattern_invalid": false });
        let found = report(&saving, &decode(page.clone()));
        assert_eq!(
            errors(&found),
            [
                "save button: a button labelled \"Save\" matches 3 buttons; it has to be the page's one save button"
            ]
        );
        assert_eq!(check(&found, Element::SaveButton), (0, 0, 1));
        assert!(found.problems().iter().any(|p| {
            p.element == Element::SaveConfirmation && p.severity == Severity::Warning
        }));

        saving.page.save = Some(SaveRule {
            button: SaveButton::Selector {
                selector: "#save".into(),
            },
            success: Some(SaveSuccess {
                selector: "#status".into(),
                pattern: Some("(".into()),
            }),
        });
        page["save"] = json!({ "count": 0, "invalid": false, "success_invalid": true, "pattern_invalid": true });
        assert_eq!(
            errors(&report(&saving, &decode(page.clone()))),
            [
                "save button: `#save` was not found on the page",
                "save confirmation: `#status` is not a valid CSS selector",
                "save confirmation: the pattern is not a valid regular expression",
            ]
        );

        page["save"] = json!({ "count": 1, "invalid": false, "success_invalid": false, "pattern_invalid": false });
        let found = report(&saving, &decode(page));
        assert!(found.problems().is_empty(), "{:?}", found.problems());
        assert!(!found.has_error(Element::SaveButton) && found.passed());
    }

    #[test]
    fn problems_never_quote_what_students_wrote() {
        let mut students = three();
        students[0]["response"]["html"] = json!("<p>SECRET-ANSWER</p>");
        students[1]["score"] = json!({ "count": 2, "invalid": false });
        students[1]["max"] = Value::Null;
        students[2]["feedback"]["kind"] = Value::Null;
        let found = report(&profile(), &decode(inspection(students)));
        assert!(!found.passed());
        let text = found
            .problems()
            .iter()
            .map(Problem::to_string)
            .collect::<String>();
        for private in ["Alice", "Bob", "Carol", "SECRET", "An answer"] {
            assert!(!text.contains(private), "{text}");
        }
    }
}
