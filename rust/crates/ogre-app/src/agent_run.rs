//! Runs agent mode for the window: the AI proposes one action at a time on
//! the open page, and the teacher is asked before it acts.

use std::path::Path;

use async_trait::async_trait;
use ogre_agent::{
    AgentContext, AgentEnd, AgentEvent, AgentMode, AgentOptions, Approver, CancelFlag, Decision,
    ProposedAction, SkillSource, bundled_site_profiles, load_skills_dir, run_agent,
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
    pub cancel: CancelFlag,
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

    // The built-in site guides, then the teacher's own skill files.
    let mut skills = bundled_site_profiles();
    skills.extend(load_skills_dir(skills_dir, SkillSource::Local).unwrap_or_default());
    let context = AgentContext {
        skills,
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
