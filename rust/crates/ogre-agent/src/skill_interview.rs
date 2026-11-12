//! Writing a skill by talking it over with the AI.
//!
//! The prompt is the desktop app's (`SKILL_CREATION_PROMPT` in
//! `lib/skill-creation-prompt.ts`), which interviews the teacher one question
//! at a time and then writes the skill as a Markdown block. The desktop app
//! sent the whole conversation as one message of transcript; here each turn
//! is a message of its own, which is what the AI services are built for.
//!
//! Nothing here saves a skill. [`drafted_skill`] hands the AI's draft to
//! whoever shows it to the teacher.

use std::sync::LazyLock;

use ogre_llm::{ChatProvider, ChatRequest, Message};
use regex::Regex;

use crate::skills::SkillDraft;

/// The system prompt of the interview.
pub const SKILL_INTERVIEW_PROMPT: &str = r#"You are a skill creation assistant for O.G.R.E, an AI-powered grading tool for educators.
Your job is to help educators create custom grading and tutoring skills through a structured interview.

## Phase 1 — Interview
Ask these questions ONE AT A TIME (wait for the user's answer before asking the next):
1. What subject or course is this skill for? (e.g., "AP Calculus", "5th Grade Writing", "Intro to Python")
2. What grade level or audience? (elementary/middle/high school/college/adult learners)
3. How strict should grading be? (lenient: reward effort, moderate: balanced, strict: full correctness required)
4. What specific aspects should the AI focus on when grading? (e.g., "showing work", "grammar", "use of citations", "partial credit for correct approach")
5. Any custom rules, exceptions, or special instructions the AI should follow?
6. (Optional) Describe an example of ideal student work — this helps calibrate the grading skill.

Once you have answers to questions 1–5, proceed to Phase 2.

## Phase 2 — Skill Generation
Generate a complete skill in markdown format using a code block. Follow this TDD approach:
1. Generate an initial draft based on the interview answers
2. Mentally test it against edge cases: lazy student (minimal effort), overachiever (exceeds expectations), partial answer (shows understanding but incomplete)
3. Iterate your draft until it handles these cases well
4. Present the final result as a ```markdown code block

### Required Skill Format:
```markdown
---
name: [Descriptive skill name]
description: [One sentence describing what this skill does]
author: Created with O.G.R.E
---

# [Skill Name]

## Purpose
[What this skill is for and when to apply it]

## Grading Criteria
[Specific criteria for evaluation, ordered by importance]

## Scoring Guide
[How to allocate points/scores]

## Feedback Style
[How to phrase feedback: tone, level of detail, encouragement policy]

## Special Rules
[Edge cases, exceptions, partial credit policies]
```

After presenting the skill, ask: "Does this look right? You can ask me to adjust any section.""#;

/// Who said a turn of the interview.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Speaker {
    Teacher,
    Ai,
}

/// One thing said in the interview.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterviewTurn {
    pub speaker: Speaker,
    pub text: String,
}

impl InterviewTurn {
    pub fn teacher(text: impl Into<String>) -> Self {
        Self {
            speaker: Speaker::Teacher,
            text: text.into(),
        }
    }

    pub fn ai(text: impl Into<String>) -> Self {
        Self {
            speaker: Speaker::Ai,
            text: text.into(),
        }
    }
}

static THINKING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<think>.*?</think>").expect("pattern is valid"));
static MARKDOWN_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)```(?:markdown)?[ \t]*\r?\n(.+?)```").expect("pattern is valid")
});

/// What the AI says next, given the interview so far. The last turn is the
/// teacher's.
pub async fn continue_interview(
    provider: &dyn ChatProvider,
    turns: &[InterviewTurn],
) -> ogre_llm::Result<String> {
    let mut messages = vec![Message::system(SKILL_INTERVIEW_PROMPT)];
    messages.extend(turns.iter().map(|turn| match turn.speaker {
        Speaker::Teacher => Message::user(&turn.text),
        Speaker::Ai => Message::assistant(&turn.text),
    }));
    let reply = provider.chat(&ChatRequest::new(messages)).await?;
    Ok(THINKING.replace_all(&reply, "").trim().to_owned())
}

/// A reply taken apart around the first Markdown block in it: what the AI
/// said before the block, what the block holds, and what it said after.
/// `None` for a reply with no block.
pub fn around_block(reply: &str) -> Option<(&str, &str, &str)> {
    let found = MARKDOWN_BLOCK.captures(reply)?;
    let (whole, inside) = (found.get(0)?, found.get(1)?);
    Some((
        reply[..whole.start()].trim(),
        inside.as_str().trim(),
        reply[whole.end()..].trim(),
    ))
}

/// The skill the AI wrote out in `reply`, if it wrote one: the first
/// Markdown block, where it holds a skill with something in it.
pub fn drafted_skill(reply: &str) -> Option<SkillDraft> {
    let (_, block, _) = around_block(reply)?;
    let draft = SkillDraft::from_markdown(block);
    (!draft.name.trim().is_empty() && !draft.body.trim().is_empty()).then_some(draft)
}

#[cfg(test)]
mod tests {
    use ogre_llm::Role;

    use super::*;
    use crate::testing::ScriptedProvider;

    const WRITTEN: &str = "Here is your skill:\n\n```markdown\n---\nname: Late work\ndescription: How late work is marked down\nauthor: Created with O.G.R.E\n---\n\n# Late work\n\n## Special Rules\nOne point off for each day late, down to half credit.\n```\n\nDoes this look right? You can ask me to adjust any section.";

    #[tokio::test]
    async fn each_turn_is_sent_as_its_own_message_after_the_interview_prompt() {
        let provider =
            ScriptedProvider::new(["<think>They said statistics.</think>\n\nWhat grade level?"]);
        let turns = [
            InterviewTurn::teacher("A skill for late work"),
            InterviewTurn::ai("What subject or course is this skill for?"),
            InterviewTurn::teacher("AP Statistics"),
        ];
        let reply = continue_interview(&provider, &turns).await.unwrap();
        assert_eq!(
            reply, "What grade level?",
            "thinking is not part of the answer"
        );

        let request = provider.requests().remove(0);
        let said: Vec<(Role, &str)> = request
            .messages
            .iter()
            .map(|message| (message.role, message.text.as_str()))
            .collect();
        assert_eq!(
            said,
            [
                (Role::System, SKILL_INTERVIEW_PROMPT),
                (Role::User, "A skill for late work"),
                (Role::Assistant, "What subject or course is this skill for?"),
                (Role::User, "AP Statistics"),
            ]
        );
        assert!(!request.json, "the interview is a conversation, not JSON");
    }

    #[test]
    fn a_skill_the_ai_wrote_out_is_read_into_the_editors_form() {
        let draft = drafted_skill(WRITTEN).expect("the reply holds a skill");
        assert_eq!(draft.name, "Late work");
        assert_eq!(draft.description, "How late work is marked down");
        assert!(draft.sites.is_empty());
        assert_eq!(
            draft.body,
            "# Late work\n\n## Special Rules\nOne point off for each day late, down to half credit."
        );
    }

    #[test]
    fn a_reply_comes_apart_around_the_skill_in_it() {
        let (before, block, after) = around_block(WRITTEN).unwrap();
        assert_eq!(before, "Here is your skill:");
        assert!(block.starts_with("---\nname: Late work\n"), "{block}");
        assert!(block.ends_with("down to half credit."), "{block}");
        assert_eq!(
            after,
            "Does this look right? You can ask me to adjust any section."
        );
        assert_eq!(around_block("What grade level or audience?"), None);
    }

    #[test]
    fn a_block_with_no_language_named_is_read_too() {
        let reply = "```\n---\nname: Units\n---\n\nAlways ask for units.\n```";
        assert_eq!(drafted_skill(reply).unwrap().name, "Units");
    }

    #[test]
    fn a_question_or_an_empty_block_is_no_skill() {
        assert_eq!(drafted_skill("What grade level or audience?"), None);
        assert_eq!(
            drafted_skill("```markdown\n---\nname: Nothing yet\n---\n```"),
            None
        );
        assert_eq!(drafted_skill("```markdown\n\n```"), None);
    }

    #[test]
    fn the_prompt_no_longer_tells_the_teacher_to_say_save() {
        // Saving is a button in the editor, where the teacher reads the
        // skill first.
        assert!(!SKILL_INTERVIEW_PROMPT.contains("say 'Save'"));
        assert!(SKILL_INTERVIEW_PROMPT.ends_with("You can ask me to adjust any section.\""));
    }
}
