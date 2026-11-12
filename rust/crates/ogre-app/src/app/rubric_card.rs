//! The rubric card of the Grade screen: the rubric text, how much each
//! category counts, saved rubrics, rubrics from elsewhere than the page's
//! own, and the scoring examples.

use eframe::egui;
use ogre_core::format_score;

use super::{Action, OgreApp};
use crate::kit;
use crate::rubrics::SavedRubric;
use crate::session::{RubricOutline, Session, count};
use crate::theme::{self, ty};

/// How much of the window's height an open rubric may take before it scrolls.
const RUBRIC_SHARE_OF_WINDOW: f32 = 0.42;

/// The teacher's saved rubrics, and what the rubric card is doing with them.
#[derive(Default)]
pub(super) struct RubricShelf {
    pub(super) saved: Vec<SavedRubric>,
    /// The saved rubric chosen in the rubric card, by name.
    pub(super) pick: Option<String>,
    /// The name the rubric in hand would be saved under.
    pub(super) name: String,
    /// The chosen saved rubric is about to be deleted, once confirmed.
    pub(super) deleting: bool,
    /// The name of the rubric being saved right now.
    pub(super) saving: Option<String>,
}

impl RubricShelf {
    /// Takes the saved rubrics as the worker now has them.
    pub(super) fn set_saved(&mut self, rubrics: Vec<SavedRubric>) {
        self.saved = rubrics;
        let still_there = |name: &String| self.saved.iter().any(|r| r.name == *name);
        if !self.pick.as_ref().is_some_and(still_there) {
            self.pick = None;
            self.deleting = false;
        }
    }
}

impl OgreApp {
    /// How much each category counts, for the teacher to set. Nothing is
    /// drawn for a rubric with fewer than two categories.
    fn weights(ui: &mut egui::Ui, session: &mut Session) {
        let outline = session.rubric_outline();
        if outline.shares.len() < 2 && !outline.weights_written {
            return;
        }
        kit::section_label(ui, "Category weights");
        if !outline.weights_written {
            let mut set = false;
            ui.horizontal_wrapped(|ui| {
                ui.label(theme::muted("None are set, so the categories count alike."));
                set = kit::ghost(ui, "Set category weights", true).clicked();
            });
            if let Some(problem) = &outline.weight_problem {
                kit::warning(ui, problem);
            }
            if set {
                session.share_weights_equally();
            }
            return;
        }

        let mut change = None;
        egui::Grid::new("category-weights")
            .num_columns(2)
            .spacing([22.0, 6.0])
            .show(ui, |ui| {
                for share in &outline.shares {
                    let name = ui.label(theme::body(&share.category));
                    let mut weight = share.weight;
                    let field = ui
                        .add(
                            egui::DragValue::new(&mut weight)
                                .range(0.0..=100.0)
                                .speed(0.5)
                                .max_decimals(1)
                                // "50%", not "50.0%".
                                .custom_formatter(|weight, _| format_score(weight))
                                .suffix("%"),
                        )
                        .labelled_by(name.id);
                    if field.changed() {
                        change = Some((share.category.clone(), weight));
                    }
                    ui.end_row();
                }
            });
        match &outline.weight_problem {
            Some(problem) => kit::warning(ui, problem),
            None => {
                ui.label(theme::muted(
                    "They add up to 100%. Each category counts for its share of the student\u{2019}s score.",
                ));
            }
        }
        let (mut equal, mut remove) = (false, false);
        ui.horizontal_wrapped(|ui| {
            equal = kit::ghost(ui, "Share equally", true).clicked();
            remove = kit::ghost(ui, "Remove the weights", true).clicked();
        });
        if let Some((category, weight)) = change {
            session.set_category_weight(&category, weight);
        }
        if equal {
            session.share_weights_equally();
        }
        if remove {
            session.remove_weights();
        }
    }

    /// Example answers at four levels that the grader is shown: written by
    /// the AI when the teacher asks, and theirs to edit.
    fn examples(&self, ui: &mut egui::Ui, session: &mut Session, actions: &mut Vec<Action>) {
        let can_ask = self.busy.is_none()
            && self.provider_problem().is_none()
            && session.rubric_outline().requirements > 0;
        let label = kit::section_label(ui, "Scoring examples");
        if session.examples.trim().is_empty() {
            ui.label(theme::muted(
                "Optional. The AI writes a short example answer at four levels for this \
                 question, and the grader is shown them so it knows what each level looks \
                 like. You can edit them before grading.",
            ));
            if kit::ghost(ui, "Write scoring examples", can_ask).clicked() {
                actions.push(Action::WriteExamples);
            }
            return;
        }
        ui.add(
            egui::TextEdit::multiline(&mut session.examples)
                .desired_rows(6)
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);
        if session.examples_out_of_date(self.settings.leniency) {
            kit::warning(
                ui,
                "The rubric or the leniency has changed since these were written.",
            );
        }
        let mut remove = false;
        ui.horizontal_wrapped(|ui| {
            if kit::ghost(ui, "Write them again", can_ask).clicked() {
                actions.push(Action::WriteExamples);
            }
            remove = kit::ghost(ui, "Remove the examples", true).clicked();
        });
        if remove {
            session.remove_examples();
        }
    }

    /// Rubrics that do not come from the page's own rubric: the teacher's
    /// saved ones, and one read from a picture of the page.
    fn other_rubrics(
        &mut self,
        ui: &mut egui::Ui,
        session: &mut Session,
        actions: &mut Vec<Action>,
    ) {
        let idle = self.busy.is_none();
        let section = kit::section_label(ui, "Saved rubrics");
        let mut use_it = false;
        ui.horizontal_wrapped(|ui| {
            if self.shelf.saved.is_empty() {
                ui.label(theme::muted(
                    "None yet. Save this one under a name to use it on another page.",
                ));
                return;
            }
            let shown = self.shelf.pick.as_deref().unwrap_or("Choose one");
            let mut pick = None;
            egui::ComboBox::from_id_salt("saved-rubrics")
                .selected_text(theme::body(shown))
                .width(240.0)
                .show_ui(ui, |ui| {
                    for saved in &self.shelf.saved {
                        let chosen = self.shelf.pick.as_deref() == Some(saved.name.as_str());
                        if ui.selectable_label(chosen, &saved.name).clicked() {
                            pick = Some(saved.name.clone());
                        }
                    }
                })
                .response
                .labelled_by(section.id);
            if let Some(pick) = pick {
                self.shelf.pick = Some(pick);
                self.shelf.deleting = false;
            }
            let picked = self.shelf.pick.is_some();
            use_it = kit::ghost(ui, "Use it", picked).clicked();
            if kit::ghost(ui, "Delete it", picked && idle).clicked() {
                self.shelf.deleting = true;
            }
        });
        let picked = self
            .shelf
            .pick
            .as_ref()
            .and_then(|name| self.shelf.saved.iter().find(|saved| saved.name == *name));
        if use_it && let Some(saved) = picked {
            session.use_saved(saved);
        }
        if self.shelf.deleting
            && let Some(name) = self.shelf.pick.clone()
        {
            let question = format!(
                "Delete the saved rubric \u{201c}{name}\u{201d}? It cannot be brought back."
            );
            match kit::confirm(
                ui,
                &question,
                "Delete the saved rubric",
                idle,
                Some("Keep it"),
            ) {
                Some(true) => actions.push(Action::DeleteRubric(name)),
                Some(false) => self.shelf.deleting = false,
                None => {}
            }
        }

        ui.horizontal_wrapped(|ui| {
            let label = ui.label(theme::muted("Save this rubric as"));
            ui.add(
                egui::TextEdit::singleline(&mut self.shelf.name)
                    .hint_text("A name, such as the assignment\u{2019}s")
                    .desired_width(240.0),
            )
            .labelled_by(label.id);
            let name = self.shelf.name.trim();
            let replaces = self.shelf.saved.iter().any(|saved| saved.name == name);
            let label = if replaces {
                "Replace the saved rubric"
            } else {
                "Save the rubric"
            };
            let worth_saving = session.rubric_outline().requirements > 0;
            if kit::ghost(ui, label, idle && !name.is_empty() && worth_saving).clicked() {
                actions.push(Action::SaveRubric);
            }
        });

        kit::section_label(ui, "When the page gives no rubric");
        let service = self.settings.provider.service;
        let can_use_ai = idle && self.provider_problem().is_none();
        let can_ask = can_use_ai && self.chrome_running;
        ui.horizontal_wrapped(|ui| {
            if kit::ghost(ui, "Read the rubric from a picture of the page", can_ask).clicked() {
                actions.push(Action::RubricFromPicture);
            }
            ui.label(theme::muted(if service.is_remote() {
                format!(
                    "For a rubric OGRE could not read. Scroll it into view in Chrome first. \
                     A picture of what the tab shows goes to {}, with any student work in view.",
                    service.label()
                )
            } else {
                "For a rubric OGRE could not read. Scroll it into view in Chrome first. \
                 The model has to be one that can look at pictures."
                    .to_owned()
            }));
        });
        let question = session.question_text().is_some();
        let can_draft = can_use_ai && question;
        ui.horizontal_wrapped(|ui| {
            if kit::ghost(ui, "Draft a rubric from the question", can_draft).clicked() {
                actions.push(Action::DraftRubric);
            }
            ui.label(theme::muted(if question {
                "For a question that has none. The AI writes one worth the question\u{2019}s \
                 points. It is a starting point: read it and change it before grading."
            } else {
                "OGRE read no question on this page to draft a rubric from."
            }));
        });
    }

    pub(super) fn rubric(
        &mut self,
        ui: &mut egui::Ui,
        session: &mut Session,
        actions: &mut Vec<Action>,
    ) {
        let heading = theme::strong("Rubric").size(ty::BODY);
        // An open rubric is as tall as the window allows and scrolls beyond
        // that, so the steps below it never leave the screen.
        let room = (ui.ctx().content_rect().height() * RUBRIC_SHARE_OF_WINDOW).max(160.0);
        egui::CollapsingHeader::new(heading)
            .id_salt("rubric")
            .show(ui, |ui| {
                egui::ScrollArea::vertical()
                    .id_salt("rubric-body")
                    .max_height(room)
                    .auto_shrink([false, true])
                    .show(ui, |ui| {
                        if let Some(problem) = &session.rubric_problem {
                            kit::warning(
                                ui,
                                &format!("The rubric could not be read from the page: {problem}"),
                            );
                        }
                        ui.label(theme::meta(format!(
                            "Out of {}",
                            format_score(session.rubric.max_score_value())
                        )));
                        if let Some(prompt) = session
                            .rubric
                            .essay_prompt
                            .as_deref()
                            .filter(|p| !p.is_empty())
                        {
                            kit::section_label(ui, "Question");
                            ui.label(theme::body(prompt));
                        }

                        let label = kit::section_label(ui, "Requirements and model response");
                        let editor = ui
                            .add(
                                egui::TextEdit::multiline(&mut session.rubric_text)
                                    .hint_text(RUBRIC_HINT)
                                    .desired_rows(6)
                                    .desired_width(f32::INFINITY),
                            )
                            .labelled_by(label.id);
                        if editor.changed() {
                            session.rubric_text_changed();
                        }
                        let mut restore = false;
                        ui.horizontal_wrapped(|ui| {
                            if session.rubric_edited() {
                                kit::marker_pill(ui, "Edited");
                            }
                            ui.label(theme::muted(rubric_summary(session.rubric_outline())));
                            if session.rubric_edited() {
                                restore =
                                    kit::ghost(ui, "Use the page\u{2019}s rubric", true).clicked();
                            }
                        });
                        if restore {
                            session.restore_rubric_text();
                        }
                        if let Some(warning) = unread_warning(&session.rubric_outline().unread) {
                            kit::warning(ui, &warning);
                        }
                        Self::weights(ui, session);
                        self.other_rubrics(ui, session, actions);
                        let label = kit::section_label(ui, "Your instructions to the grader");
                        ui.add(
                            egui::TextEdit::multiline(&mut session.instructions)
                                .hint_text("Optional. For example: accept answers given in words.")
                                .desired_rows(2)
                                .desired_width(f32::INFINITY),
                        )
                        .labelled_by(label.id);
                        self.examples(ui, session, actions);
                    });
            });
    }
}

/// Shown in the empty rubric editor.
const RUBRIC_HINT: &str = "One requirement per line. A line that starts with ## \
is a heading for the requirements under it:\n\
## Method\n\
Sets up the equation with the rate given in the question";

/// One line saying what the grader will find in the rubric text.
fn rubric_summary(outline: &RubricOutline) -> String {
    let exemplar = if outline.exemplar {
        "a model response"
    } else {
        "no model response"
    };
    if outline.requirements == 0 {
        return format!(
            "No requirements, {exemplar}. The AI grades against the question and your instructions."
        );
    }
    format!(
        "{} in {}, {exemplar}.",
        count(outline.requirements, "requirement"),
        count_of(outline.categories, "category", "categories"),
    )
}

fn count_of(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

/// Tells the teacher which lines of their rubric will be left out, if any.
fn unread_warning(unread: &[String]) -> Option<String> {
    let first: String = unread.first()?.chars().take(60).collect();
    let ellipsis = if unread[0].chars().count() > 60 {
        "…"
    } else {
        ""
    };
    Some(match unread.len() {
        1 => format!("This line will not be used for grading: “{first}{ellipsis}”."),
        n => {
            format!("{n} lines will not be used for grading, the first being “{first}{ellipsis}”.")
        }
    })
}
