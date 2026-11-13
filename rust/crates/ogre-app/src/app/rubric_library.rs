//! The Rubrics screen: the teacher's saved rubrics, to write, change, copy
//! and delete with no grading page open.

use eframe::egui::{self, Frame};

use super::rubric_card::{RUBRIC_HINT, rubric_summary};
use super::{Action, CONTENT_MARGIN, OgreApp};
use crate::kit;
use crate::rubrics::SavedRubric;
use crate::session::RubricOutline;
use crate::theme::{self, ty};

/// The Rubrics screen's state.
#[derive(Default)]
pub(super) struct RubricLibrary {
    /// The rubric being written or changed, if one is.
    pub(super) editing: Option<RubricEdit>,
    /// The saved rubric about to be deleted, once confirmed, by name.
    deleting: Option<String>,
    /// The name of the rubric being saved from here right now.
    pub(super) saving: Option<String>,
}

/// The form a saved rubric is written in.
#[derive(Default)]
pub(super) struct RubricEdit {
    /// The name it is saved under now. `None` for one not saved yet.
    pub(super) was: Option<String>,
    name: String,
    text: String,
    instructions: String,
    examples: String,
    /// What the text holds, worked out when the text last changed.
    outline: RubricOutline,
}

impl RubricEdit {
    fn of(saved: &SavedRubric, was: Option<String>, name: String) -> Self {
        Self {
            was,
            name,
            text: saved.text.clone(),
            instructions: saved.instructions.clone(),
            examples: saved.examples.clone(),
            outline: RubricOutline::of_text(&saved.text),
        }
    }

    /// The rubric as it would be saved.
    pub(super) fn rubric(&self) -> SavedRubric {
        SavedRubric {
            name: self.name.trim().to_owned(),
            text: self.text.trim().to_owned(),
            instructions: self.instructions.trim().to_owned(),
            examples: self.examples.trim().to_owned(),
        }
    }
}

/// A name for a copy of `name` that no saved rubric has yet.
fn copy_name(name: &str, taken: &[SavedRubric]) -> String {
    let free = |candidate: &str| !taken.iter().any(|saved| saved.name == candidate);
    let first = format!("{name} (copy)");
    if free(&first) {
        return first;
    }
    (2..)
        .map(|n| format!("{name} (copy {n})"))
        .find(|candidate| free(candidate))
        .unwrap_or(first)
}

impl OgreApp {
    pub(super) fn rubrics_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                kit::page_header(
                    ui,
                    "OGRE  /  Rubrics",
                    "Rubrics",
                    Some(
                        "Rubrics you keep, to use on any grading page. A page\u{2019}s own \
                         rubric is not here unless you saved it.",
                    ),
                );
                self.messages(ui, actions);
                egui::ScrollArea::vertical().show(ui, |ui| {
                    kit::wide_card(ui, |ui| self.rubric_list(ui, actions));
                    if self.library.editing.is_some() {
                        ui.add_space(4.0);
                        kit::wide_card(ui, |ui| self.rubric_form(ui, actions));
                    }
                });
            });
    }

    fn rubric_list(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let free = idle && self.library.editing.is_none();
        let library = &mut self.library;
        if self.shelf.saved.is_empty() && idle {
            ui.label(theme::muted(
                "None yet. Write one here, or save the rubric of a page you are grading \
                 from its rubric card.",
            ));
        }
        for saved in &self.shelf.saved {
            ui.horizontal_wrapped(|ui| {
                ui.label(theme::strong(&saved.name).size(ty::BODY));
                if kit::ghost(ui, "Change", free).clicked() {
                    library.editing = Some(RubricEdit::of(
                        saved,
                        Some(saved.name.clone()),
                        saved.name.clone(),
                    ));
                }
                if kit::ghost(ui, "Copy", free).clicked() {
                    let name = copy_name(&saved.name, &self.shelf.saved);
                    library.editing = Some(RubricEdit::of(saved, None, name));
                }
                if kit::ghost(ui, "Delete", free).clicked() {
                    library.deleting = Some(saved.name.clone());
                }
            });
            let mut about = rubric_summary(&RubricOutline::of_text(&saved.text));
            if !saved.instructions.trim().is_empty() {
                about += " With instructions to the grader.";
            }
            if !saved.examples.trim().is_empty() {
                about += " With scoring examples.";
            }
            ui.label(theme::muted(about));
            if library.deleting.as_deref() == Some(saved.name.as_str()) {
                let question = format!(
                    "Delete the saved rubric \u{201c}{}\u{201d}? It cannot be brought back.",
                    saved.name
                );
                match kit::confirm(
                    ui,
                    &question,
                    "Delete the saved rubric",
                    idle,
                    Some("Keep it"),
                ) {
                    Some(true) => {
                        library.deleting = None;
                        actions.push(Action::DeleteRubric(saved.name.clone()));
                    }
                    Some(false) => library.deleting = None,
                    None => {}
                }
            }
            ui.add_space(4.0);
        }
        if kit::ghost(ui, "Write a rubric", free).clicked() {
            library.editing = Some(RubricEdit::default());
        }
    }

    fn rubric_form(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let Some(edit) = &mut self.library.editing else {
            return;
        };
        kit::panel_title(
            ui,
            if edit.was.is_some() {
                "Change the rubric"
            } else {
                "A new rubric"
            },
        );
        let label = kit::section_label(ui, "Name");
        ui.add(
            egui::TextEdit::singleline(&mut edit.name)
                .hint_text("A name, such as the assignment\u{2019}s")
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);

        let label = kit::section_label(ui, "Requirements and model response");
        let text = ui
            .add(
                egui::TextEdit::multiline(&mut edit.text)
                    .hint_text(RUBRIC_HINT)
                    .desired_rows(8)
                    .desired_width(f32::INFINITY),
            )
            .labelled_by(label.id);
        if text.changed() {
            edit.outline = RubricOutline::of_text(&edit.text);
        }
        ui.label(theme::muted(format!(
            "{} A category\u{2019}s weight goes in its heading, as in \u{201c}## Method [40%]\u{201d}. \
             A model response goes under a line that says \u{201c}--- Model Response ---\u{201d}.",
            rubric_summary(&edit.outline)
        )));
        if let Some(problem) = &edit.outline.weight_problem {
            kit::warning(ui, problem);
        }

        let label = kit::section_label(ui, "Your instructions to the grader");
        ui.add(
            egui::TextEdit::multiline(&mut edit.instructions)
                .hint_text("Optional. For example: accept answers given in words.")
                .desired_rows(2)
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);
        let label = kit::section_label(ui, "Scoring examples");
        ui.add(
            egui::TextEdit::multiline(&mut edit.examples)
                .hint_text(
                    "Optional. Example answers at each level, as the rubric card writes them.",
                )
                .desired_rows(3)
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);

        let complete = !edit.name.trim().is_empty() && edit.outline.requirements > 0;
        let mut cancel = false;
        ui.horizontal(|ui| {
            if kit::primary(ui, "Save the rubric", idle && complete).clicked() {
                actions.push(Action::PutRubric);
            }
            cancel = kit::ghost(ui, "Cancel", true).clicked();
        });
        if cancel {
            self.library.editing = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_copy_gets_a_name_no_rubric_has() {
        let saved = |name: &str| SavedRubric {
            name: name.into(),
            ..SavedRubric::default()
        };
        assert_eq!(copy_name("Essay 2", &[saved("Essay 2")]), "Essay 2 (copy)");
        assert_eq!(
            copy_name(
                "Essay 2",
                &[
                    saved("Essay 2"),
                    saved("Essay 2 (copy)"),
                    saved("Essay 2 (copy 2)")
                ]
            ),
            "Essay 2 (copy 3)"
        );
    }
}
