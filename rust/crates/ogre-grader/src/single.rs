use ogre_core::{
    PARSE_ERROR_FEEDBACK, Rubric, SingleGrade, build_single_grade_prompt,
    parse_single_grade_response,
};
use ogre_llm::{ChatProvider, ChatRequest, Message};

use crate::error::GraderError;
use crate::text::snippet;

/// Grades one student's work.
///
/// `instructions` is a note from the teacher for this one grading; it may be
/// empty. A reply that cannot be read is an error, not a zero.
pub async fn grade_single(
    provider: &dyn ChatProvider,
    rubric: &Rubric,
    student_work: &str,
    instructions: &str,
) -> Result<SingleGrade, GraderError> {
    let prompt = build_single_grade_prompt(rubric, student_work, instructions, None)?;
    let reply = provider
        .chat(&ChatRequest::new([Message::user(prompt)]))
        .await?;

    let weighting = rubric.category_weighting();
    let grade =
        parse_single_grade_response(&reply, rubric.max_score_value(), weighting.as_ref(), None);
    // The parser's way of saying it found nothing.
    if grade.score == 0.0 && grade.feedback == PARSE_ERROR_FEEDBACK {
        return Err(GraderError::UnreadableReply {
            reply: snippet(&reply),
        });
    }
    Ok(grade)
}
