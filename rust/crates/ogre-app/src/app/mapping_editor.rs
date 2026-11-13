//! Putting a saved site mapping right by hand, on the Sites screen: each
//! thing the mapping points at as a selector the teacher can change or pick
//! by clicking the page, checked against the open page before it is saved.

use eframe::egui;
use ogre_core::FeedbackKind;
use ogre_harness::sites::generic::{Element, FeedbackBox, PickFor, Severity, SiteProfile};

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
}

impl Field {
    const ALL: [Self; 6] = [
        Self::Section,
        Self::Name,
        Self::Score,
        Self::Response,
        Self::Prompt,
        Self::Feedback,
    ];

    fn label(self) -> &'static str {
        match self {
            Self::Section => "Each student\u{2019}s block",
            Self::Name => "Student name",
            Self::Score => "Score box",
            Self::Response => "Student response",
            Self::Prompt => "Question, where each student has their own",
            Self::Feedback => "Feedback box",
        }
    }

    fn hint(self) -> &'static str {
        match self {
            Self::Section => "Empty for a page that shows one student",
            Self::Prompt | Self::Feedback => "Empty if the page has none",
            Self::Name | Self::Score | Self::Response => "A selector, looked up in each block",
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
        }
    }
}

/// The form a saved mapping is changed in.
pub(super) struct MappingEdit {
    /// The mapping as it was loaded. What the form does not show, such as
    /// how the maximum score and the save button are found, stays as here.
    base: SiteProfile,
    name: String,
    /// One selector per [`Field`], in the order of [`Field::ALL`].
    selectors: [String; 6],
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
        Self {
            name: profile.name.clone(),
            selectors: [
                page.student_section.clone().unwrap_or_default(),
                page.student_name.clone(),
                page.score_input.clone(),
                page.response.clone(),
                page.prompt.clone().unwrap_or_default(),
                feedback.unwrap_or_default(),
            ],
            base: profile,
            checked: None,
            picking: None,
        }
    }

    fn selector(&self, field: Field) -> &str {
        self.selectors[field as usize].trim()
    }

    /// The mapping as the form has it now.
    pub(super) fn profile(&self) -> SiteProfile {
        let filled = |field: Field| Some(self.selector(field).to_owned()).filter(|s| !s.is_empty());
        let mut profile = self.base.clone();
        profile.name = self.name.trim().to_owned();
        let page = &mut profile.page;
        page.student_section = filled(Field::Section);
        page.student_name = self.selector(Field::Name).to_owned();
        page.score_input = self.selector(Field::Score).to_owned();
        page.response = self.selector(Field::Response).to_owned();
        page.prompt = filled(Field::Prompt);
        page.feedback = filled(Field::Feedback).map(|selector| match page.feedback.take() {
            Some(known) => FeedbackBox { selector, ..known },
            // The check says which kind of box it is.
            None => FeedbackBox {
                selector,
                kind: FeedbackKind::Textarea,
                hidden_field: None,
            },
        });
        profile
    }

    /// What to look for when the teacher points at `field` on the page.
    pub(super) fn pick_for(&mut self, field: Field) -> PickFor {
        self.picking = Some(field);
        match field {
            Field::Section => PickFor::StudentSection,
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
            _ if found.one == students => format!("Found for all {}.", count(students, "student")),
            _ => format!(
                "Found for {} of {}: missing for {}, more than one for {}.",
                found.one, students, found.none, found.several
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

        let check = edit.current_check().cloned();
        for field in Field::ALL {
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
            let Some(check) = &check else { continue };
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

        match &check {
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
            if kit::ghost(ui, "Check against the open page", on_a_page).clicked() {
                actions.push(Action::CheckMapping);
            }
            if kit::primary(ui, "Save the mapping", idle && named && proven).clicked() {
                actions.push(Action::SaveEditedMapping);
            }
            cancel = kit::ghost(ui, "Cancel", idle).clicked();
        });
        if cancel {
            self.mapping_edit = None;
        }
    }
}
