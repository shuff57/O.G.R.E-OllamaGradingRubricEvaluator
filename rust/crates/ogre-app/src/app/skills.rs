//! What the agent knows, on the Agent screen: the list of skills with a
//! switch each, and the form a skill of the teacher's is written in.

use eframe::egui;

use super::{Action, OgreApp};
use crate::agent_run::SkillSummary;
use crate::kit;
use crate::theme::{self, ty};

/// The form a skill is written in.
#[derive(Default)]
pub(super) struct SkillEdit {
    /// The skill being changed. `None` for a new one.
    pub(super) id: Option<String>,
    name: String,
    description: String,
    /// The sites it guides the agent on, separated by commas.
    sites: String,
    body: String,
}

impl SkillEdit {
    fn of(skill: &SkillSummary) -> Option<Self> {
        let draft = skill.draft.as_ref()?;
        Some(Self {
            id: Some(skill.id.clone()),
            name: draft.name.clone(),
            description: draft.description.clone(),
            sites: draft.sites.join(", "),
            body: draft.body.clone(),
        })
    }

    pub(super) fn draft(&self) -> ogre_agent::SkillDraft {
        ogre_agent::SkillDraft {
            name: self.name.trim().to_owned(),
            description: self.description.trim().to_owned(),
            sites: self
                .sites
                .split(',')
                .map(|site| site.trim().to_owned())
                .filter(|site| !site.is_empty())
                .collect(),
            body: self.body.trim().to_owned(),
        }
    }
}

impl OgreApp {
    /// What the agent is given beside the task: OGRE's guides to the sites
    /// it knows, and the teacher's own skill files with a switch each.
    pub(super) fn skills_card(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        kit::section_label(ui, "What the agent knows");
        let (mut change, mut delete, mut keep) = (None, None, false);
        for skill in &self.agent.skills {
            ui.horizontal_wrapped(|ui| {
                if skill.sites.is_empty() {
                    let mut on = self
                        .settings
                        .skills
                        .get(&skill.id)
                        .copied()
                        .unwrap_or(skill.on_in_file);
                    let switch = ui.add_enabled(
                        !self.agent.running,
                        egui::Checkbox::new(&mut on, theme::strong(&skill.name).size(ty::BODY)),
                    );
                    if switch.changed() {
                        self.settings.skills.insert(skill.id.clone(), on);
                    }
                } else {
                    ui.label(theme::strong(&skill.name).size(ty::BODY));
                    kit::calm_pill(ui, &format!("Guide to {}", skill.sites.join(", ")));
                }
                if skill.built_in {
                    ui.label(theme::meta("Built in"));
                }
                // A skill of the teacher's own is theirs to change.
                if skill.draft.is_some() {
                    let free = idle && !self.agent.running;
                    if kit::ghost(ui, "Change", free).clicked() {
                        change = SkillEdit::of(skill);
                    }
                    if kit::ghost(ui, "Delete", free).clicked() {
                        delete = Some(skill.id.clone());
                    }
                }
            });
            if !skill.description.is_empty() {
                ui.label(theme::muted(&skill.description));
            }
            if self.agent.deleting_skill.as_deref() == Some(skill.id.as_str()) {
                let question = format!(
                    "Delete the skill \u{201c}{}\u{201d}? Its file is removed and cannot be \
                     brought back.",
                    skill.name
                );
                match kit::confirm(ui, &question, "Delete the skill", idle, Some("Keep it")) {
                    Some(true) => actions.push(Action::DeleteSkill(skill.id.clone())),
                    Some(false) => keep = true,
                    None => {}
                }
            }
        }
        if let Some(edit) = change {
            self.agent.editing = Some(edit);
        }
        if let Some(id) = delete {
            self.agent.deleting_skill = Some(id);
        }
        if keep {
            self.agent.deleting_skill = None;
        }
        if self.agent.skills.is_empty() && idle {
            ui.label(theme::muted("Nothing yet."));
        }
        ui.add_space(4.0);
        ui.label(theme::muted(
            "A guide is used whenever the agent is on its site. A skill of your own is a \
             Markdown file in your skills folder, used on every task while it is ticked.",
        ));
        ui.horizontal_wrapped(|ui| {
            let free = idle && !self.agent.running && self.agent.editing.is_none();
            if kit::ghost(ui, "Write a skill", free).clicked() {
                self.agent.editing = Some(SkillEdit::default());
            }
            if kit::ghost(ui, "Open the skills folder", idle).clicked() {
                actions.push(Action::OpenSkillsFolder);
            }
            if kit::ghost(ui, "Look again", idle).clicked() {
                actions.push(Action::ListSkills);
            }
            if !self.agent.skills_folder.is_empty() {
                ui.label(theme::muted(&self.agent.skills_folder));
            }
        });
    }

    /// The form a skill of the teacher's is written or changed in.
    pub(super) fn skill_editor(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let Some(edit) = &mut self.agent.editing else {
            return;
        };
        kit::panel_title(
            ui,
            if edit.id.is_some() {
                "Change the skill"
            } else {
                "A new skill"
            },
        );
        let line = |ui: &mut egui::Ui, label: &str, hint: &str, text: &mut String| {
            let label = kit::section_label(ui, label);
            ui.add(
                egui::TextEdit::singleline(text)
                    .hint_text(hint)
                    .desired_width(f32::INFINITY),
            )
            .labelled_by(label.id);
        };
        line(ui, "Name", "For example: Late work", &mut edit.name);
        line(
            ui,
            "What it is for",
            "One line, for you to tell your skills apart",
            &mut edit.description,
        );
        line(
            ui,
            "Sites it is a guide to",
            "Leave empty for a skill used on every task. Otherwise: schoology.com, another.org",
            &mut edit.sites,
        );
        let label = kit::section_label(ui, "What the agent should know");
        ui.add(
            egui::TextEdit::multiline(&mut edit.body)
                .hint_text(
                    "In your own words, or Markdown. For example: work handed in late \
                     loses one point for each day, down to half credit.",
                )
                .desired_rows(8)
                .desired_width(f32::INFINITY),
        )
        .labelled_by(label.id);
        let complete = !edit.name.trim().is_empty() && !edit.body.trim().is_empty();
        let mut cancel = false;
        ui.horizontal(|ui| {
            if kit::primary(ui, "Save the skill", idle && complete).clicked() {
                actions.push(Action::SaveSkill);
            }
            cancel = kit::ghost(ui, "Cancel", true).clicked();
        });
        if cancel {
            self.agent.editing = None;
        }
    }
}
