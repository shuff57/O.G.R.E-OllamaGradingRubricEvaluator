//! What the agent knows, on the Agent screen: the list of skills with a
//! switch each, the form a skill of the teacher's is written in, and the
//! conversation in which the AI helps write one.

use eframe::egui;
use egui_commonmark::CommonMarkViewer;
use ogre_agent::{InterviewTurn, SkillDraft, Speaker, around_block, drafted_skill};

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
        Some(Self {
            id: Some(skill.id.clone()),
            ..Self::new(skill.draft.as_ref()?)
        })
    }

    /// The form for a skill that is not saved yet, filled in from `draft`.
    fn new(draft: &SkillDraft) -> Self {
        Self {
            id: None,
            name: draft.name.clone(),
            description: draft.description.clone(),
            sites: draft.sites.join(", "),
            body: draft.body.clone(),
        }
    }

    pub(super) fn draft(&self) -> SkillDraft {
        SkillDraft {
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

/// The conversation in which the AI helps the teacher write a skill.
#[derive(Default)]
pub(super) struct Interview {
    turns: Vec<InterviewTurn>,
    /// What the teacher is writing to the AI.
    message: String,
    /// The newest skill the AI has written out, if it has written one.
    written: Option<SkillDraft>,
    /// The AI has just answered: bring the answer into view.
    reveal: bool,
}

impl Interview {
    /// Takes what the teacher wrote into the conversation, and gives the
    /// conversation to send. `None` if they wrote nothing.
    pub(super) fn say(&mut self) -> Option<Vec<InterviewTurn>> {
        let message = self.message.trim();
        if message.is_empty() {
            return None;
        }
        self.turns.push(InterviewTurn::teacher(message));
        self.message.clear();
        Some(self.turns.clone())
    }

    /// Takes the AI's answer into the conversation.
    pub(super) fn heard(&mut self, reply: String) {
        if let Some(written) = drafted_skill(&reply) {
            self.written = Some(written);
        }
        self.turns.push(InterviewTurn::ai(reply));
        self.reveal = true;
    }

    /// The teacher's last message got no answer: it goes back where it was
    /// written, to be sent again.
    pub(super) fn unanswered(&mut self) {
        if self
            .turns
            .last()
            .is_none_or(|turn| turn.speaker != Speaker::Teacher)
        {
            return;
        }
        if let Some(turn) = self.turns.pop() {
            let since = std::mem::take(&mut self.message);
            self.message = [turn.text.as_str(), since.trim()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
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
            let can_talk = idle && !self.agent.running && self.agent.interview.is_none();
            if kit::ghost(ui, "Write one with the AI", can_talk).clicked() {
                self.agent.interview = Some(Interview::default());
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

    /// The conversation in which the AI asks what a skill is for and then
    /// writes it. What it writes goes to the editor, for the teacher to read
    /// and change before it is saved.
    pub(super) fn skill_interview(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        let provider_problem = self.provider_problem();
        let service = self.settings.provider.service;
        let (agent, markdown) = (&mut self.agent, &mut self.markdown);
        let Some(interview) = &mut agent.interview else {
            return;
        };
        kit::panel_title(ui, "Write a skill with the AI");
        let how = "Say what the skill is for. The AI asks a few questions, one at a time, \
                   and then writes the skill. You read it and change it before it is saved.";
        ui.label(theme::muted(if service.is_remote() {
            format!("{how} What you write here goes to {}.", service.label())
        } else {
            how.to_owned()
        }));
        if let Some(problem) = provider_problem {
            kit::warning(ui, problem);
        }
        for (index, turn) in interview.turns.iter().enumerate() {
            if turn.speaker == Speaker::Teacher {
                kit::section_label(ui, "You");
                ui.label(theme::body(&turn.text));
                continue;
            }
            kit::section_label(ui, "The AI");
            // The AI answers in Markdown. A skill it wrote out stands apart
            // from what it says about it, as the file it would be.
            let (before, skill, after) = around_block(&turn.text)
                .map_or((turn.text.as_str(), None, ""), |parts| {
                    (parts.0, Some(parts.1), parts.2)
                });
            let mut said = |ui: &mut egui::Ui, part: &str, text: &str| {
                if !text.is_empty() {
                    ui.push_id(("interview", index, part), |ui| {
                        CommonMarkViewer::new().show(ui, markdown, text);
                    });
                }
            };
            said(ui, "before", before);
            if let Some(skill) = skill {
                kit::quoted(ui, skill);
            }
            said(ui, "after", after);
        }
        if let Some(written) = &interview.written {
            ui.horizontal_wrapped(|ui| {
                let label = if agent.editing.is_some() {
                    "Put it in the editor again"
                } else {
                    "Put the skill in the editor"
                };
                if kit::ghost(ui, label, idle).clicked() {
                    agent.editing = Some(SkillEdit::new(written));
                }
                ui.label(theme::muted(format!(
                    "The AI wrote \u{201c}{}\u{201d}. Nothing is saved until you save it in \
                     the editor.",
                    written.name
                )));
            });
        }
        let label = kit::section_label(ui, "Your message to the AI");
        let hint = if interview.turns.is_empty() {
            "For example: a skill for how I take points off late work"
        } else {
            "Your answer, or what to change in the skill"
        };
        let message = ui
            .add(
                egui::TextEdit::multiline(&mut interview.message)
                    .hint_text(hint)
                    .desired_rows(3)
                    .desired_width(f32::INFINITY),
            )
            .labelled_by(label.id);
        if std::mem::take(&mut interview.reveal) {
            message.scroll_to_me(Some(egui::Align::BOTTOM));
        }
        let can_send = idle && provider_problem.is_none() && !interview.message.trim().is_empty();
        let (mut again, mut close) = (false, false);
        ui.horizontal(|ui| {
            if kit::ghost(ui, "Send", can_send).clicked() {
                actions.push(Action::AskInterview);
            }
            again = kit::ghost(ui, "Start over", idle && !interview.turns.is_empty()).clicked();
            close = kit::ghost(ui, "Close", idle).clicked();
        });
        if again {
            *interview = Interview::default();
        }
        if close {
            agent.interview = None;
        }
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
