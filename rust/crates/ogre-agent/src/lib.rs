//! Agent mode: the teacher describes a task in plain language and an AI
//! carries it out in a web page, one approved step at a time.
//!
//! [`run_agent`] is the loop. Each turn it shows the AI the interactive parts
//! of the page ([`capture_page_state`]), reads one action out of the reply
//! ([`parse_agent_reply`]), checks it against the live page ([`safety`]),
//! asks the [`Approver`] where that is required, and carries it out with real
//! mouse and keyboard input. [`skills`] are the teacher's installed
//! instructions and site profiles, put into the prompt for the sites they
//! apply to.
//!
//! Text the teacher or their skills wrote is treated as instructions. Text
//! read from a web page is treated as data: it is marked as such wherever the
//! AI sees it, and nothing in it can change what needs approval, because that
//! is decided here from the page's elements and never from what the AI says.

mod action;
mod agent;
mod exec;
mod frontmatter;
mod fuzzy;
mod page;
mod prompt;
mod reply;
pub mod safety;
mod script;
mod site_guide;
mod skill_interview;
pub mod skills;

#[cfg(test)]
mod agent_tests;
#[cfg(test)]
mod testing;

pub use action::{Action, ActionError, ActionResult, DANGEROUS_JS_PATTERNS, ScrollDirection};
pub use agent::{
    ActionStep, AgentContext, AgentEnd, AgentEvent, AgentLimits, AgentMode, AgentOptions,
    AgentOutcome, AgentStep, Approval, Approver, CancelFlag, Decision, MAX_CONTEXT_TOKENS,
    PRUNE_WINDOW, ProposedAction, estimate_tokens, prune_history, run_agent,
};
pub use fuzzy::{FuzzyStrategy, find_fuzzy_match, fuzzy_match_reason};
pub use page::{ElementInfo, PageElement, PageState, PageStateOptions, Target, capture_page_state};
pub use prompt::{
    HarnessContext, PAGE_CONTENT_CLOSE, PAGE_CONTENT_OPEN, RubricSummary, TOOL_DEFINITIONS,
    ToolDefinition, build_harness, wrap_page_content,
};
pub use reply::{AgentReply, parse_agent_reply};
pub use safety::ApprovalReason;
pub use site_guide::{LearnedCorrection, SiteGuide, Workflow, convert_profile_to_json};
pub use skill_interview::{
    InterviewTurn, SKILL_INTERVIEW_PROMPT, Speaker, around_block, continue_interview, drafted_skill,
};
pub use skills::{
    ParsedSkill, Skill, SkillContext, SkillDraft, SkillSource, build_site_context_injection,
    build_skill_injection, bundled_site_profiles, find_matching_profiles, load_skills_dir,
    parse_skill_markdown, select_best_profile, skill_context_for,
};
