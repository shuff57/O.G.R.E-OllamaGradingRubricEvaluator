//! Runs agent mode for the window: the AI proposes one action at a time on
//! the open page, and the teacher is asked before it acts.

use std::collections::BTreeMap;
use std::path::Path;

use async_trait::async_trait;
use ogre_agent::{
    AgentContext, AgentEnd, AgentEvent, AgentMode, AgentOptions, Approver, CancelFlag, Decision,
    ProposedAction, Skill, SkillSource, bundled_site_profiles, load_skills_dir, run_agent,
};
use ogre_harness::InputDriver;
use tokio::sync::mpsc;

use crate::grading;
use crate::settings::ProviderSettings;
use crate::worker::{Event, Reporter};

#[derive(Debug)]
pub struct AgentRequest {
    /// What the teacher wants done, in their own words.
    pub task: String,
    /// Act without asking, except where OGRE always asks: saving, submitting,
    /// deleting, scores, scripts, and leaving the site.
    pub auto: bool,
    /// Send a picture of the page with each step.
    pub screenshots: bool,
    pub provider: ProviderSettings,
    pub api_key: Option<String>,
    /// The skills the teacher has switched on or off, by id. A skill that is
    /// not named here is on if its own file says so.
    pub skill_choices: BTreeMap<String, bool>,
    pub cancel: CancelFlag,
}

/// Something the agent knows, as the Agent screen lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    /// The sites it is a guide for. A guide is used on its sites whether or
    /// not it is switched on; a skill with none is used on every task while
    /// it is on.
    pub sites: Vec<String>,
    /// Shipped with OGRE, as opposed to a file in the teacher's folder.
    pub built_in: bool,
    /// Whether its own file switches it on.
    pub on_in_file: bool,
}

/// The built-in site guides, then the teacher's own skill files, with the
/// teacher's choices applied.
fn skills(skills_dir: &Path, choices: &BTreeMap<String, bool>) -> Vec<Skill> {
    let mut skills = bundled_site_profiles();
    skills.extend(load_skills_dir(skills_dir, SkillSource::Local).unwrap_or_default());
    for skill in &mut skills {
        if let Some(on) = choices.get(&skill.id) {
            skill.active = *on;
        }
    }
    skills
}

/// What the agent would be given from `skills_dir`, for the teacher to see.
pub(crate) fn list_skills(skills_dir: &Path) -> Vec<SkillSummary> {
    skills(skills_dir, &BTreeMap::new())
        .into_iter()
        .map(|skill| SkillSummary {
            built_in: skill.source == SkillSource::SiteProfile,
            on_in_file: skill.active,
            sites: skill
                .url_patterns
                .iter()
                .flat_map(|pattern| pattern.split(','))
                .map(|site| site.trim().to_owned())
                .filter(|site| !site.is_empty())
                .collect(),
            id: skill.id,
            name: skill.name,
            description: skill.description,
        })
        .collect()
}

/// An action waiting for the teacher's decision.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentQuestion {
    pub step: usize,
    /// What will happen and to which element, worked out from the live page.
    pub description: String,
    /// The AI's own explanation. It may be wrong.
    pub reasoning: String,
    /// Why OGRE asks even when the agent may otherwise act on its own.
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentAnswer {
    Allow,
    /// Do not do it, and carry on. The note goes to the AI.
    Deny(String),
    Stop,
}

/// One line of the running account of what the agent did.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentLine {
    pub kind: LineKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    /// An action the AI proposed.
    Step,
    /// Something the AI said without acting.
    Said,
    /// An action that did not work.
    Failed,
}

/// How a run ended.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentSummary {
    pub finished: bool,
    pub message: String,
}

/// Asks the window, and waits for the teacher.
struct WindowApprover<'a> {
    report: Reporter,
    answers: &'a mut mpsc::UnboundedReceiver<AgentAnswer>,
}

#[async_trait]
impl Approver for WindowApprover<'_> {
    async fn review(&mut self, proposal: &ProposedAction) -> Decision {
        // An answer left over from an earlier question must not answer this one.
        while self.answers.try_recv().is_ok() {}
        self.report.progress(Event::AgentAsks(AgentQuestion {
            step: proposal.step,
            description: proposal.description.clone(),
            reasoning: proposal.reasoning.clone(),
            reasons: proposal.forced_by.iter().map(ToString::to_string).collect(),
        }));
        match self.answers.recv().await {
            Some(AgentAnswer::Allow) => Decision::Allow,
            Some(AgentAnswer::Deny(note)) => Decision::Deny {
                note: Some(note.trim().to_owned()).filter(|note| !note.is_empty()),
            },
            // No window left to ask means no permission.
            Some(AgentAnswer::Stop) | None => Decision::Stop,
        }
    }
}

pub(crate) async fn run(
    page: &dyn InputDriver,
    request: AgentRequest,
    skills_dir: &Path,
    report: Reporter,
    answers: &mut mpsc::UnboundedReceiver<AgentAnswer>,
) -> AgentSummary {
    let provider = match grading::provider(&request.provider, request.api_key.as_deref()) {
        Ok(provider) => provider,
        Err(problem) => {
            return AgentSummary {
                finished: false,
                message: problem,
            };
        }
    };

    let context = AgentContext {
        skills: skills(skills_dir, &request.skill_choices),
        active_rubric: None,
        provider: Some(request.provider.service.label().to_owned()),
        model: Some(request.provider.model.clone()),
    };
    let options = AgentOptions {
        mode: if request.auto {
            AgentMode::Auto
        } else {
            AgentMode::Review
        },
        screenshots: request.screenshots,
        ..AgentOptions::default()
    };

    let lines = report.clone();
    let mut on_event = move |event: AgentEvent| {
        let line = match event {
            AgentEvent::Propose { description, .. } => AgentLine {
                kind: LineKind::Step,
                text: description,
            },
            AgentEvent::Text { content } => AgentLine {
                kind: LineKind::Said,
                text: content,
            },
            AgentEvent::Result { action, result } if !result.success => AgentLine {
                kind: LineKind::Failed,
                text: format!(
                    "{action} did not work: {}",
                    result.error.as_deref().unwrap_or("no reason given")
                ),
            },
            _ => return,
        };
        lines.progress(Event::AgentLine(line));
    };
    let mut approver = WindowApprover { report, answers };
    let outcome = run_agent(
        page,
        &provider,
        &request.task,
        &context,
        &options,
        &mut approver,
        &request.cancel,
        &mut on_event,
    )
    .await;

    AgentSummary {
        finished: matches!(outcome.end, AgentEnd::Done { success: true, .. }),
        message: outcome.end.message(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(test: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ogre-skills-{test}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_list_holds_the_built_in_guides_and_the_teachers_files() {
        let dir = folder("list");
        std::fs::write(
            dir.join("late-work.md"),
            "# Late work\n\nTake a point off for each day late.\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("schoology.md"),
            "---\nname: Schoology\nactive: true\nurlPatterns:\n  - schoology.com\n---\nWhere things are.\n",
        )
        .unwrap();

        let listed = list_skills(&dir);
        let built_in: Vec<_> = listed.iter().filter(|s| s.built_in).collect();
        assert_eq!(built_in.len(), 2);
        assert!(built_in.iter().all(|guide| !guide.sites.is_empty()));

        let late = listed.iter().find(|s| s.id == "late-work").unwrap();
        assert_eq!(late.name, "Late work");
        assert_eq!(late.description, "Take a point off for each day late.");
        assert!(late.sites.is_empty() && !late.built_in && !late.on_in_file);
        let guide = listed.iter().find(|s| s.id == "schoology").unwrap();
        assert_eq!(guide.sites, ["schoology.com"]);
        assert!(guide.on_in_file);

        // A folder that is not there yet is no skills, not a failure.
        assert_eq!(list_skills(&dir.join("missing")).len(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_teachers_choice_overrides_what_a_skill_file_says() {
        let dir = folder("choices");
        std::fs::write(dir.join("off.md"), "# Off by itself\n\nText.\n").unwrap();
        std::fs::write(
            dir.join("on.md"),
            "---\nname: On by itself\nactive: true\n---\nText.\n",
        )
        .unwrap();
        let active = |choices: &[(&str, bool)]| -> Vec<String> {
            let choices = choices
                .iter()
                .map(|(id, on)| ((*id).to_owned(), *on))
                .collect();
            skills(&dir, &choices)
                .into_iter()
                .filter(|skill| skill.active && skill.source == SkillSource::Local)
                .map(|skill| skill.id)
                .collect()
        };
        assert_eq!(active(&[]), ["on"]);
        assert_eq!(active(&[("off", true), ("on", false)]), ["off"]);
        assert_eq!(active(&[("gone", true)]), ["on"]);
        let _ = std::fs::remove_dir_all(dir);
    }
}
