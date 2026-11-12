//! Runs agent mode for the window: the AI proposes one action at a time on
//! the open page, and the teacher is asked before it acts.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use ogre_agent::{
    AgentContext, AgentEnd, AgentEvent, AgentMode, AgentOptions, Approver, CancelFlag, Decision,
    ProposedAction, Skill, SkillDraft, SkillSource, bundled_site_profiles, load_skills_dir,
    run_agent,
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
    /// The skill as the editor's form holds it. `None` for a built-in one,
    /// which is not the teacher's to change.
    pub draft: Option<SkillDraft>,
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

/// The skills the grader is given beside the rubric: those that are switched
/// on and are not a guide to a site, by name. The agent is given the same
/// ones on every task.
pub(crate) fn grading_skills(skills_dir: &Path, choices: &BTreeMap<String, bool>) -> Vec<Skill> {
    let mut skills: Vec<Skill> = skills(skills_dir, choices)
        .into_iter()
        .filter(|skill| skill.active && skill.sites().next().is_none())
        .collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

/// What the agent would be given from `skills_dir`, for the teacher to see.
pub(crate) fn list_skills(skills_dir: &Path) -> Vec<SkillSummary> {
    skills(skills_dir, &BTreeMap::new())
        .into_iter()
        .map(|skill| SkillSummary {
            draft: (skill.source == SkillSource::Local)
                .then(|| SkillDraft::from_markdown(&skill.content)),
            built_in: skill.source == SkillSource::SiteProfile,
            on_in_file: skill.active,
            sites: skill.sites().map(str::to_owned).collect(),
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

/// The file of the teacher's skill `id`, which is either `<id>.md` or
/// `<id>/SKILL.md`. An id is a file name the app made or found, never a path.
fn skill_file(skills_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let plain = !id.is_empty()
        && !id.starts_with('.')
        && id
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '));
    if !plain {
        return Err(format!("\"{id}\" is not the name of a skill file."));
    }
    let in_folder = skills_dir.join(id).join("SKILL.md");
    Ok(if in_folder.is_file() {
        in_folder
    } else {
        skills_dir.join(format!("{id}.md"))
    })
}

/// Writes a skill of the teacher's to their skills folder: over the file of
/// `id`, or as a new file named after the skill. Returns its id.
pub(crate) fn save_skill(
    skills_dir: &Path,
    id: Option<&str>,
    draft: &SkillDraft,
) -> Result<String, String> {
    if draft.name.trim().is_empty() {
        return Err("Give the skill a name.".into());
    }
    let id = match id {
        Some(id) => id.to_owned(),
        None => {
            let base: String = draft
                .name
                .trim()
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() {
                        c.to_lowercase().next().unwrap_or('-')
                    } else {
                        '-'
                    }
                })
                .collect();
            let base = base.trim_matches('-');
            let base = if base.is_empty() { "skill" } else { base };
            // A new skill never lands on a file that is already there.
            let taken = |id: &str| {
                skills_dir.join(format!("{id}.md")).exists() || skills_dir.join(id).exists()
            };
            (1..)
                .map(|copy| match copy {
                    1 => base.to_owned(),
                    copy => format!("{base}-{copy}"),
                })
                .find(|id| !taken(id))
                .unwrap_or_else(|| base.to_owned())
        }
    };
    let file = skill_file(skills_dir, &id)?;
    std::fs::create_dir_all(skills_dir)
        .and_then(|()| std::fs::write(&file, draft.to_markdown()))
        .map_err(|error| format!("The skill could not be saved: {error}"))?;
    Ok(id)
}

/// What the AI says next in the interview that writes a skill.
pub(crate) async fn skill_interview(
    settings: &ProviderSettings,
    api_key: Option<&str>,
    turns: &[ogre_agent::InterviewTurn],
) -> Result<String, String> {
    let provider = grading::provider(settings, api_key)?;
    match ogre_agent::continue_interview(&provider, turns).await {
        Ok(reply) if reply.is_empty() => {
            Err("The AI gave no answer. Send your message again.".to_owned())
        }
        Ok(reply) => Ok(reply),
        Err(error) => Err(format!("The AI could not be asked: {error}")),
    }
}

/// Removes a skill of the teacher's. One that is already gone is not an error.
pub(crate) fn delete_skill(skills_dir: &Path, id: &str) -> Result<(), String> {
    match std::fs::remove_file(skill_file(skills_dir, id)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("The skill could not be deleted: {error}")),
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
    fn the_grader_is_given_the_skills_that_are_on_and_are_not_site_guides() {
        let dir = folder("grading");
        let write = |file: &str, text: &str| std::fs::write(dir.join(file), text).unwrap();
        write(
            "units.md",
            "# Units\n\nAn answer without units loses a point.\n",
        );
        write(
            "late-work.md",
            "# Late work\n\nA point off for each day late.\n",
        );
        write("off.md", "# Rounding\n\nRound to two places.\n");
        write(
            "on-in-file.md",
            "---\nname: Always\nactive: true\n---\nShow the work.\n",
        );
        write(
            "schoology.md",
            "---\nname: Schoology\nactive: true\nurlPatterns:\n  - schoology.com\n---\nWhere things are.\n",
        );

        let names = |choices: &[(&str, bool)]| -> Vec<String> {
            let choices = choices
                .iter()
                .map(|(id, on)| ((*id).to_owned(), *on))
                .collect();
            grading_skills(&dir, &choices)
                .into_iter()
                .map(|skill| skill.name)
                .collect()
        };
        // With nothing chosen, only what its own file switches on.
        assert_eq!(names(&[]), ["Always"]);
        // The teacher's ticks decide, in name order. A guide to a site is
        // for finding the way around it, ticked or not; so are OGRE's own.
        assert_eq!(
            names(&[
                ("units", true),
                ("late-work", true),
                ("on-in-file", false),
                ("schoology", true),
                ("bundled-myopenmath", true),
            ]),
            ["Late work", "Units"]
        );
        let _ = std::fs::remove_dir_all(dir);
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

    fn draft(name: &str, body: &str) -> SkillDraft {
        SkillDraft {
            name: name.to_owned(),
            body: body.to_owned(),
            ..SkillDraft::default()
        }
    }

    #[test]
    fn a_skill_is_written_changed_and_deleted_as_a_file_in_the_folder() {
        let dir = folder("write").join("not-made-yet");
        let id = save_skill(&dir, None, &draft("Late work!", "A point off a day.")).unwrap();
        assert_eq!(id, "late-work");
        assert!(dir.join("late-work.md").is_file());
        // Another of the same name is another file, not the first one over.
        let second = save_skill(&dir, None, &draft("Late work", "Other text.")).unwrap();
        assert_eq!(second, "late-work-2");

        let listed = list_skills(&dir);
        let own: Vec<_> = listed.iter().filter(|s| !s.built_in).collect();
        assert_eq!(own.len(), 2);
        let first = own.iter().find(|s| s.id == "late-work").unwrap();
        assert_eq!(first.draft.as_ref().unwrap().body, "A point off a day.");
        assert!(
            listed
                .iter()
                .filter(|s| s.built_in)
                .all(|s| s.draft.is_none())
        );

        save_skill(&dir, Some("late-work"), &draft("Late work", "Two points.")).unwrap();
        let changed = list_skills(&dir);
        let first = changed.iter().find(|s| s.id == "late-work").unwrap();
        assert_eq!(first.draft.as_ref().unwrap().body, "Two points.");
        assert_eq!(changed.len(), listed.len(), "changed in place");

        delete_skill(&dir, "late-work").unwrap();
        delete_skill(&dir, "late-work").unwrap();
        assert!(!dir.join("late-work.md").exists());
        assert!(dir.join("late-work-2.md").exists());
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn a_skill_in_a_folder_of_its_own_is_changed_where_it_is() {
        let dir = folder("in-folder");
        std::fs::create_dir_all(dir.join("grading-voice")).unwrap();
        std::fs::write(dir.join("grading-voice/SKILL.md"), "# Voice\n\nBe kind.\n").unwrap();
        save_skill(&dir, Some("grading-voice"), &draft("Voice", "Be brief.")).unwrap();
        let text = std::fs::read_to_string(dir.join("grading-voice/SKILL.md")).unwrap();
        assert!(text.ends_with("Be brief.\n"), "{text}");
        assert!(!dir.join("grading-voice.md").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_skill_needs_a_name_and_an_id_cannot_reach_outside_the_folder() {
        let dir = folder("refused");
        assert!(save_skill(&dir, None, &draft("  ", "Text.")).is_err());
        for id in ["../outside", "a/b", "", ".hidden"] {
            assert!(
                save_skill(&dir, Some(id), &draft("Name", "Text.")).is_err(),
                "{id}"
            );
            assert!(delete_skill(&dir, id).is_err(), "{id}");
        }
        // A name of nothing but punctuation still gets a file name.
        assert_eq!(
            save_skill(&dir, None, &draft("???", "Text.")).unwrap(),
            "skill"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
