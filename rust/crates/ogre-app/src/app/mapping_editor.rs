//! Putting a saved site mapping right by hand, on the Sites screen: each
//! thing the mapping points at as a selector the teacher can change or pick
//! by clicking the page, checked against the open page before it is saved.

use eframe::egui;
use ogre_core::FeedbackKind;
use ogre_harness::sites::generic::{
    ButtonRule, Element, FeedbackBox, MaxScoreRule, PickFor, SaveRule, SaveSuccess, Severity,
    SiteProfile,
};

use super::{Action, OgreApp};
use crate::kit;
use crate::session::count;
use crate::theme;
use crate::worker::ProfileCheck;

/// One thing a mapping points at that the form lets the teacher change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Field {
    Section,
    Name,
    Score,
    Response,
    Prompt,
    Feedback,
    /// The three below have a line only for the ways of finding the maximum
    /// score and the save button that go by a selector.
    MaxScore,
    SaveButton,
    SaveConfirmation,
    NextStudent,
    PreviousStudent,
}

impl Field {
    /// The lines every mapping has.
    const ALWAYS: [Self; 6] = [
        Self::Section,
        Self::Name,
        Self::Score,
        Self::Response,
        Self::Prompt,
        Self::Feedback,
    ];
    const COUNT: usize = 11;

    fn label(self) -> &'static str {
        match self {
            Self::Section => "Each student\u{2019}s block",
            Self::Name => "Student name",
            Self::Score => "Score box",
            Self::Response => "Student response",
            Self::Prompt => "Question, where each student has their own",
            Self::Feedback => "Feedback box",
            Self::MaxScore => "Where the maximum score is shown",
            Self::SaveButton => "Save button",
            Self::SaveConfirmation => "What the page shows once it has saved",
            Self::NextStudent => "Button to the next student",
            Self::PreviousStudent => "Button to the previous student",
        }
    }

    fn hint(self) -> &'static str {
        match self {
            Self::Section => "Empty for a page that shows one student",
            Self::Prompt | Self::Feedback => "Empty if the page has none",
            Self::Name | Self::Score | Self::Response | Self::MaxScore => {
                "A selector, looked up in each block"
            }
            Self::SaveButton => "A selector for the page\u{2019}s one save button",
            Self::NextStudent | Self::PreviousStudent => "A selector for that one button",
            Self::SaveConfirmation => "Empty, and OGRE leaves the saving to you",
        }
    }

    /// What the check calls it.
    fn element(self) -> Element {
        match self {
            Self::Section => Element::StudentSection,
            Self::Name => Element::StudentName,
            Self::Score => Element::ScoreInput,
            Self::Response => Element::Response,
            Self::Prompt => Element::Prompt,
            Self::Feedback => Element::Feedback,
            Self::MaxScore => Element::MaxScore,
            Self::SaveButton => Element::SaveButton,
            Self::SaveConfirmation => Element::SaveConfirmation,
            Self::NextStudent => Element::NextStudent,
            Self::PreviousStudent => Element::PreviousStudent,
        }
    }
}

/// How the maximum score is found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MaxFrom {
    NotShown,
    NearBox,
    OwnPlace,
    Same,
}

impl MaxFrom {
    const ALL: [Self; 4] = [Self::NotShown, Self::NearBox, Self::OwnPlace, Self::Same];

    fn label(self) -> &'static str {
        match self {
            Self::NotShown => "The page does not show it",
            Self::NearBox => "From the text beside the score box",
            Self::OwnPlace => "From its own place in each block",
            Self::Same => "The same for every student",
        }
    }
}

/// How one of the page's buttons is found, if the mapping has it at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ButtonBy {
    Unmapped,
    Label,
    Selector,
}

impl ButtonBy {
    const ALL: [Self; 3] = [Self::Unmapped, Self::Label, Self::Selector];

    /// `unmapped` says what going without the button means.
    fn label(self, unmapped: &'static str) -> &'static str {
        match self {
            Self::Unmapped => unmapped,
            Self::Label => "The button with this label",
            Self::Selector => "The button at this selector",
        }
    }
}

/// One button of the page as the form holds it. Its selector, when it is
/// found by one, is in the form's selectors under `field`.
struct ButtonForm {
    field: Field,
    by: ButtonBy,
    label: String,
}

impl ButtonForm {
    fn of(field: Field, rule: Option<&ButtonRule>, selectors: &mut [String]) -> Self {
        let mut form = Self {
            field,
            by: ButtonBy::Unmapped,
            label: String::new(),
        };
        match rule {
            None => {}
            Some(ButtonRule::Text { text }) => {
                form.by = ButtonBy::Label;
                form.label.clone_from(text);
            }
            Some(ButtonRule::Selector { selector }) => {
                form.by = ButtonBy::Selector;
                selectors[field as usize].clone_from(selector);
            }
        }
        form
    }

    fn rule(&self, selectors: &[String]) -> Option<ButtonRule> {
        match self.by {
            ButtonBy::Unmapped => None,
            ButtonBy::Label => Some(ButtonRule::Text {
                text: self.label.trim().to_owned(),
            }),
            ButtonBy::Selector => Some(ButtonRule::Selector {
                selector: selectors[self.field as usize].trim().to_owned(),
            }),
        }
    }

    /// True if the way chosen still needs its label or selector.
    fn unfinished(&self, selectors: &[String]) -> bool {
        match self.by {
            ButtonBy::Unmapped => false,
            ButtonBy::Label => self.label.trim().is_empty(),
            ButtonBy::Selector => selectors[self.field as usize].trim().is_empty(),
        }
    }
}

/// `text` without the space around it, or nothing if that leaves nothing.
fn filled(text: &str) -> Option<String> {
    Some(text.trim().to_owned()).filter(|text| !text.is_empty())
}

/// The form a saved mapping is changed in.
pub(super) struct MappingEdit {
    /// The mapping as it was loaded. What the form does not show, such as
    /// the pages it is for, stays as here.
    base: SiteProfile,
    name: String,
    /// One selector per [`Field`], in the order they are declared.
    selectors: [String; Field::COUNT],
    max_from: MaxFrom,
    /// The pattern for the number in the text beside the score box.
    near_pattern: String,
    /// The pattern for the number in its own place, where the first number
    /// there is not it.
    own_pattern: String,
    /// The maximum where it is the same for every student.
    max_value: String,
    save: ButtonForm,
    next: ButtonForm,
    previous: ButtonForm,
    /// What the confirmation has to say, where its being shown is not enough.
    saved_pattern: String,
    /// A selector for the frame the grading page is in, where it is in one.
    frame: String,
    /// What the last check against the page found.
    checked: Option<ProfileCheck>,
    /// The field waiting for the teacher to click it on the page.
    picking: Option<Field>,
}

impl MappingEdit {
    pub(super) fn of(profile: SiteProfile) -> Self {
        let page = &profile.page;
        let feedback = page
            .feedback
            .as_ref()
            .map(|feedback| feedback.selector.clone());
        let mut selectors = [
            page.student_section.clone().unwrap_or_default(),
            page.student_name.clone(),
            page.score_input.clone(),
            page.response.clone(),
            page.prompt.clone().unwrap_or_default(),
            feedback.unwrap_or_default(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        ];
        let button = |field, rule: &Option<ButtonRule>, selectors: &mut [String]| {
            ButtonForm::of(field, rule.as_ref(), selectors)
        };
        let save = page.save.as_ref().map(|save| save.button.clone());
        let mut edit = Self {
            name: profile.name.clone(),
            save: button(Field::SaveButton, &save, &mut selectors),
            next: button(Field::NextStudent, &page.next_student, &mut selectors),
            previous: button(
                Field::PreviousStudent,
                &page.previous_student,
                &mut selectors,
            ),
            selectors,
            max_from: MaxFrom::NotShown,
            near_pattern: MaxScoreRule::USUAL_PATTERN.to_owned(),
            own_pattern: String::new(),
            max_value: String::new(),
            saved_pattern: String::new(),
            frame: page.frame.clone().unwrap_or_default(),
            checked: None,
            picking: None,
            base: profile,
        };
        match edit.base.page.max_score.clone() {
            None => {}
            Some(MaxScoreRule::NearbyText { pattern }) => {
                edit.max_from = MaxFrom::NearBox;
                edit.near_pattern = pattern;
            }
            Some(MaxScoreRule::Selector { selector, pattern }) => {
                edit.max_from = MaxFrom::OwnPlace;
                edit.selectors[Field::MaxScore as usize] = selector;
                edit.own_pattern = pattern.unwrap_or_default();
            }
            Some(MaxScoreRule::Fixed { value }) => {
                edit.max_from = MaxFrom::Same;
                edit.max_value = value.to_string();
            }
        }
        if let Some(success) = edit.base.page.save.clone().and_then(|save| save.success) {
            edit.selectors[Field::SaveConfirmation as usize] = success.selector;
            edit.saved_pattern = success.pattern.unwrap_or_default();
        }
        edit
    }

    fn selector(&self, field: Field) -> &str {
        self.selectors[field as usize].trim()
    }

    /// The mapping as the form has it now.
    pub(super) fn profile(&self) -> SiteProfile {
        let at = |field: Field| filled(self.selector(field));
        let mut profile = self.base.clone();
        profile.name = self.name.trim().to_owned();
        let page = &mut profile.page;
        page.student_section = at(Field::Section);
        page.student_name = self.selector(Field::Name).to_owned();
        page.score_input = self.selector(Field::Score).to_owned();
        page.response = self.selector(Field::Response).to_owned();
        page.prompt = at(Field::Prompt);
        page.feedback = at(Field::Feedback).map(|selector| match page.feedback.take() {
            Some(known) => FeedbackBox { selector, ..known },
            // The check says which kind of box it is.
            None => FeedbackBox {
                selector,
                kind: FeedbackKind::Textarea,
                hidden_field: None,
            },
        });
        page.max_score = match self.max_from {
            MaxFrom::NotShown => None,
            MaxFrom::NearBox => Some(MaxScoreRule::NearbyText {
                pattern: filled(&self.near_pattern)
                    .unwrap_or_else(|| MaxScoreRule::USUAL_PATTERN.to_owned()),
            }),
            MaxFrom::OwnPlace => Some(MaxScoreRule::Selector {
                selector: self.selector(Field::MaxScore).to_owned(),
                pattern: filled(&self.own_pattern),
            }),
            MaxFrom::Same => self.same_max().map(|value| MaxScoreRule::Fixed { value }),
        };
        page.frame = self.frame();
        page.next_student = self.next.rule(&self.selectors);
        page.previous_student = self.previous.rule(&self.selectors);
        page.save = self.save.rule(&self.selectors).map(|button| SaveRule {
            button,
            success: at(Field::SaveConfirmation).map(|selector| SaveSuccess {
                selector,
                pattern: filled(&self.saved_pattern),
            }),
        });
        profile
    }

    /// The frame the grading page is in, if the mapping says it is in one.
    pub(super) fn frame(&self) -> Option<String> {
        filled(&self.frame)
    }

    /// The maximum typed for every student, if it is a score.
    fn same_max(&self) -> Option<f64> {
        let value: f64 = self.max_value.trim().parse().ok()?;
        (value.is_finite() && value > 0.0).then_some(value)
    }

    /// What the form still needs before it says a whole mapping.
    fn missing(&self) -> Option<&'static str> {
        match self.max_from {
            MaxFrom::Same if self.same_max().is_none() => {
                return Some("Give the maximum score as a number above zero.");
            }
            MaxFrom::OwnPlace if self.selector(Field::MaxScore).is_empty() => {
                return Some(
                    "Say where the maximum score is shown, or choose another way of finding it.",
                );
            }
            _ => {}
        }
        if self.save.unfinished(&self.selectors) {
            return Some("Say which button saves, or choose to save in the browser.");
        }
        if self.next.unfinished(&self.selectors) || self.previous.unfinished(&self.selectors) {
            return Some("Say which button goes to the other student, or choose to go without it.");
        }
        None
    }

    /// What to look for when the teacher points at `field` on the page.
    pub(super) fn pick_for(&mut self, field: Field) -> PickFor {
        self.picking = Some(field);
        match field {
            Field::Section => PickFor::StudentSection,
            Field::SaveButton
            | Field::SaveConfirmation
            | Field::NextStudent
            | Field::PreviousStudent => PickFor::WholePage,
            _ => PickFor::InsideSection(
                Some(self.selector(Field::Section).to_owned()).filter(|s| !s.is_empty()),
            ),
        }
    }

    /// Takes what the teacher pointed at. True if it gave a selector.
    pub(super) fn picked(&mut self, selector: Option<String>) -> bool {
        let (Some(field), Some(selector)) = (self.picking.take(), selector) else {
            return false;
        };
        self.selectors[field as usize] = selector;
        true
    }

    /// Takes what a check against the page found. The check may have put
    /// the kind of feedback box right; that is kept.
    pub(super) fn checked(&mut self, check: ProfileCheck) {
        self.base
            .page
            .feedback
            .clone_from(&check.profile.page.feedback);
        self.checked = Some(check);
    }

    /// The last check, if the form still says what was checked.
    fn current_check(&self) -> Option<&ProfileCheck> {
        self.checked
            .as_ref()
            .filter(|check| check.profile == self.profile())
    }

    /// True when the mapping as it stands has been proven on the page.
    pub(super) fn proven(&self) -> bool {
        self.current_check().is_some_and(|check| check.passed)
    }
}

/// How `field` did in `check`, in a line, and what was wrong with it.
fn finding(check: &ProfileCheck, field: Field) -> (Option<String>, Vec<(Severity, &str)>) {
    let element = field.element();
    let students = check.students;
    let line = check
        .checks
        .iter()
        .find(|found| found.element == element)
        .map(|found| match field {
            Field::Section if found.one == 1 => format!("Finds {}.", count(students, "student")),
            Field::Section => "Finds no student.".to_owned(),
            Field::SaveButton | Field::NextStudent | Field::PreviousStudent if found.one == 1 => {
                "Found on the page.".to_owned()
            }
            Field::SaveButton => "Not found as the page\u{2019}s one save button.".to_owned(),
            Field::NextStudent | Field::PreviousStudent => "Not on this page.".to_owned(),
            // A maximum is only looked for where there is a score box.
            _ if found.none == 0 && found.several == 0 => {
                format!("Found for all {}.", count(found.one, "student"))
            }
            _ => format!(
                "Found for {} of {}: missing for {}, more than one for {}.",
                found.one,
                found.none + found.one + found.several,
                found.none,
                found.several
            ),
        });
    let problems = check
        .problems
        .iter()
        .filter(|problem| problem.element == element)
        .map(|problem| (problem.severity, problem.message.as_str()))
        .collect();
    (line, problems)
}

/// One selector of the mapping: a box to type it in and a button to pick it
/// on the page instead.
fn selector_line(
    ui: &mut egui::Ui,
    edit: &mut MappingEdit,
    field: Field,
    on_a_page: bool,
    actions: &mut Vec<Action>,
) {
    let label = kit::section_label(ui, field.label());
    ui.horizontal(|ui| {
        let pick = format!("Pick the {} on the page", field.label().to_lowercase());
        if kit::ghost(ui, "Pick on the page", on_a_page)
            .on_hover_text(&pick)
            .clicked()
        {
            actions.push(Action::PickOnPage(field));
        }
        ui.add(
            egui::TextEdit::singleline(&mut edit.selectors[field as usize])
                .hint_text(field.hint())
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);
    });
}

/// Which of the form's buttons.
#[derive(Clone, Copy)]
enum Button {
    Save,
    Next,
    Previous,
}

/// One of the page's buttons: whether the mapping has it, and its label or
/// its selector. `picking` is whether a page is open to pick on, and where
/// a pick is asked for.
fn button_lines(
    ui: &mut egui::Ui,
    edit: &mut MappingEdit,
    which: Button,
    title: &str,
    unmapped: &'static str,
    label_title: &str,
    picking: (bool, &mut Vec<Action>),
) {
    fn form(edit: &mut MappingEdit, which: Button) -> &mut ButtonForm {
        match which {
            Button::Save => &mut edit.save,
            Button::Next => &mut edit.next,
            Button::Previous => &mut edit.previous,
        }
    }
    let title_label = kit::section_label(ui, title);
    let (by, field) = (form(edit, which).by, form(edit, which).field);
    let mut chosen = by;
    egui::ComboBox::from_id_salt(("mapping-button", field as usize))
        .selected_text(theme::body(by.label(unmapped)))
        .width(320.0)
        .show_ui(ui, |ui| {
            for way in ButtonBy::ALL {
                ui.selectable_value(&mut chosen, way, way.label(unmapped));
            }
        })
        .response
        .labelled_by(title_label.id);
    form(edit, which).by = chosen;
    match chosen {
        ButtonBy::Unmapped => {}
        ButtonBy::Label => text_line(
            ui,
            label_title,
            &mut form(edit, which).label,
            "The whole label, as the button shows it. Capitals do not matter.",
        ),
        ButtonBy::Selector => selector_line(ui, edit, field, picking.0, picking.1),
    }
}

/// Something of the mapping that is typed and cannot be picked.
fn text_line(ui: &mut egui::Ui, label: &str, text: &mut String, hint: &str) {
    let label = kit::section_label(ui, label);
    ui.add(egui::TextEdit::singleline(text).desired_width(f32::INFINITY))
        .labelled_by(label.id);
    ui.label(theme::muted(hint));
}

/// What the last check found for `field`, if the form still says what was
/// checked.
fn show_finding(ui: &mut egui::Ui, check: Option<&ProfileCheck>, field: Field) {
    let Some(check) = check else { return };
    let (line, problems) = finding(check, field);
    if let Some(line) = line.filter(|_| problems.is_empty()) {
        ui.label(theme::muted(line));
    }
    for (severity, message) in problems {
        match severity {
            Severity::Error => kit::warning(ui, message),
            Severity::Warning => {
                ui.label(theme::muted(message));
            }
        }
    }
}

impl OgreApp {
    /// The form a saved mapping is put right in.
    pub(super) fn mapping_editor(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let on_a_page = idle && self.chrome_running;
        let Some(edit) = &mut self.mapping_edit else {
            return;
        };
        kit::panel_title(ui, "Change the mapping");
        ui.label(theme::muted(
            "Each line says where on the page something is, as a CSS selector. Change one \
             by hand, or have OGRE work it out from where you click on the page. Open one \
             of the site\u{2019}s grading pages in Chrome first.",
        ));
        let label = kit::section_label(ui, "Name");
        ui.add(egui::TextEdit::singleline(&mut edit.name).desired_width(f32::INFINITY))
            .labelled_by(label.id);

        text_line(
            ui,
            "Frame the grading page is in",
            &mut edit.frame,
            "Empty, unless the grading page is shown inside a frame of the page you have \
             open. Then a selector for that frame; everything below is looked up inside it.",
        );

        let check = edit.current_check().cloned();
        let check = check.as_ref();
        for field in Field::ALWAYS {
            selector_line(ui, edit, field, on_a_page, actions);
            show_finding(ui, check, field);
        }

        let label = kit::section_label(ui, "Maximum score");
        egui::ComboBox::from_id_salt("mapping-max-score")
            .selected_text(theme::body(edit.max_from.label()))
            .width(320.0)
            .show_ui(ui, |ui| {
                for way in MaxFrom::ALL {
                    ui.selectable_value(&mut edit.max_from, way, way.label());
                }
            })
            .response
            .labelled_by(label.id);
        match edit.max_from {
            MaxFrom::NotShown => {}
            MaxFrom::NearBox => text_line(
                ui,
                "Pattern for the number beside the score box",
                &mut edit.near_pattern,
                "A regular expression whose first group is the number. The one given \
                 reads \u{201c}/ 10\u{201d} and \u{201c}out of 10\u{201d}.",
            ),
            MaxFrom::OwnPlace => {
                selector_line(ui, edit, Field::MaxScore, on_a_page, actions);
                text_line(
                    ui,
                    "Pattern for the number there",
                    &mut edit.own_pattern,
                    "Empty for the first number there. Otherwise a regular expression \
                     whose first group is the number.",
                );
            }
            MaxFrom::Same => text_line(
                ui,
                "Maximum score for every student",
                &mut edit.max_value,
                "A number, such as 10.",
            ),
        }
        show_finding(ui, check, Field::MaxScore);

        button_lines(
            ui,
            edit,
            Button::Save,
            "Saving",
            "No button: I save in the browser",
            "Label of the save button",
            (on_a_page, &mut *actions),
        );
        show_finding(ui, check, Field::SaveButton);
        if edit.save.by != ButtonBy::Unmapped {
            selector_line(ui, edit, Field::SaveConfirmation, on_a_page, actions);
            text_line(
                ui,
                "What it has to say",
                &mut edit.saved_pattern,
                "Empty if its being shown is enough. Otherwise a regular expression its \
                 text has to match.",
            );
            show_finding(ui, check, Field::SaveConfirmation);
        }

        // Only a page that shows one student has others to go to.
        if edit.selector(Field::Section).is_empty() {
            ui.label(theme::muted(
                "This page shows one student. With the button to the next student mapped, \
                 OGRE reads every student from the one shown to the last, and saves each \
                 grade as it writes it.",
            ));
            button_lines(
                ui,
                edit,
                Button::Next,
                "Next student",
                "None: only the student shown is read",
                "Label of the button to the next student",
                (on_a_page, &mut *actions),
            );
            show_finding(ui, check, Field::NextStudent);
            if edit.next.by != ButtonBy::Unmapped {
                button_lines(
                    ui,
                    edit,
                    Button::Previous,
                    "Previous student",
                    "None: each student has their own address",
                    "Label of the button to the previous student",
                    (on_a_page, &mut *actions),
                );
                show_finding(ui, check, Field::PreviousStudent);
            }
        }

        let missing = edit.missing();
        if let Some(missing) = missing {
            kit::warning(ui, missing);
        }
        match check {
            Some(check) if check.passed => {
                let names: Vec<&str> = check.samples.iter().map(|s| s.name.as_str()).collect();
                ui.label(theme::body(format!(
                    "This mapping reads the open page: {}, starting with {}.",
                    count(check.students, "student"),
                    names.join("; ")
                )));
            }
            Some(_) => kit::warning(
                ui,
                "This mapping does not fit the open page yet. It cannot be saved until it does.",
            ),
            None if edit.checked.is_some() => {
                ui.label(theme::muted(
                    "Changed since it was checked. Check it again.",
                ));
            }
            None => {}
        }
        let named = !edit.name.trim().is_empty();
        let proven = edit.proven();
        let mut cancel = false;
        ui.horizontal(|ui| {
            let whole = missing.is_none();
            if kit::ghost(ui, "Check against the open page", on_a_page && whole).clicked() {
                actions.push(Action::CheckMapping);
            }
            if kit::primary(ui, "Save the mapping", idle && named && proven && whole).clicked() {
                actions.push(Action::SaveEditedMapping);
            }
            cancel = kit::ghost(ui, "Cancel", idle).clicked();
        });
        if cancel {
            self.mapping_edit = None;
        }
    }
}
