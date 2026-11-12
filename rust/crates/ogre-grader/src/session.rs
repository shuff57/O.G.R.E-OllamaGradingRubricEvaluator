//! What every grading call shares: the provider, the cancel flag, the event
//! sink and the warnings collected so far.

use std::time::Duration;

use ogre_core::{
    CategoryWeighting, CheckedResult, PARSE_ERROR_FEEDBACK, Rubric, ScoringAnchors, StudentResult,
    StudentWork, generate_scoring_anchors, parse_batch_response_checked,
};
use ogre_llm::{ChatProvider, ChatRequest, LlmError, Message};
use tokio::time::{Instant, timeout};

use crate::options::{CancelFlag, ScoreSource};
use crate::outcome::GradeEvent;

/// How often a pending request looks at the cancel flag.
const CANCEL_CHECK: Duration = Duration::from_millis(250);

/// Why a request to the AI gave no reply.
pub(crate) enum Stop {
    Cancelled,
    Failed(LlmError),
}

pub(crate) struct Session<'a> {
    provider: &'a dyn ChatProvider,
    cancel: &'a CancelFlag,
    on_event: &'a mut (dyn FnMut(GradeEvent) + Send),
    heartbeat: Option<Duration>,
    started: Instant,
    warnings: Vec<String>,
    cancelled: bool,
    /// An error that every further request would hit too, such as a rejected
    /// API key. Once set, no more requests are sent.
    fatal: Option<LlmError>,
}

impl<'a> Session<'a> {
    pub(crate) fn new(
        provider: &'a dyn ChatProvider,
        cancel: &'a CancelFlag,
        on_event: &'a mut (dyn FnMut(GradeEvent) + Send),
        heartbeat: Option<Duration>,
    ) -> Self {
        Self {
            provider,
            cancel,
            on_event,
            heartbeat: heartbeat.filter(|every| !every.is_zero()),
            started: Instant::now(),
            warnings: Vec::new(),
            cancelled: false,
            fatal: None,
        }
    }

    pub(crate) fn emit(&mut self, event: GradeEvent) {
        (self.on_event)(event);
    }

    pub(crate) fn warn(&mut self, message: String) {
        self.warnings.push(message.clone());
        self.emit(GradeEvent::Warning(message));
    }

    /// True once the cancel flag has been seen set. Sticky.
    pub(crate) fn check_cancelled(&mut self) -> bool {
        self.cancelled |= self.cancel.is_cancelled();
        self.cancelled
    }

    pub(crate) fn cancelled(&self) -> bool {
        self.cancelled
    }

    pub(crate) fn fatal(&self) -> Option<&LlmError> {
        self.fatal.as_ref()
    }

    /// True when no further request should be sent.
    pub(crate) fn stopped(&self) -> bool {
        self.cancelled || self.fatal.is_some()
    }

    pub(crate) fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    pub(crate) fn into_warnings(self) -> Vec<String> {
        self.warnings
    }

    /// Sends one prompt as a single user message and waits for the reply,
    /// reporting heartbeats meanwhile.
    pub(crate) async fn ask(&mut self, prompt: String) -> Result<String, Stop> {
        if self.check_cancelled() {
            return Err(Stop::Cancelled);
        }
        if let Some(error) = &self.fatal {
            return Err(Stop::Failed(error.clone()));
        }

        let request = ChatRequest::new([Message::user(prompt)]);
        let provider = self.provider;
        let mut reply = provider.chat(&request);
        // The reply is awaited in short slices so that Stop takes effect on a
        // request that is under way: a model that never answers must not hold
        // the teacher for the provider's whole timeout. Dropping the request
        // abandons it.
        let asked = Instant::now();
        let mut next_heartbeat = self.heartbeat.map(|every| asked + every);
        let outcome = loop {
            match timeout(CANCEL_CHECK, &mut reply).await {
                Ok(outcome) => break outcome,
                Err(_) => {
                    if self.check_cancelled() {
                        return Err(Stop::Cancelled);
                    }
                    if let (Some(every), Some(due)) = (self.heartbeat, next_heartbeat)
                        && Instant::now() >= due
                    {
                        self.emit(GradeEvent::Heartbeat {
                            elapsed: asked.elapsed(),
                        });
                        next_heartbeat = Some(due + every);
                    }
                }
            }
        };

        outcome.map_err(|error| {
            if !error.is_retryable() {
                self.fatal = Some(error.clone());
            }
            Stop::Failed(error)
        })
    }
}

/// The rubric with everything derived from it that prompts and parsers need.
pub(crate) struct Job<'a> {
    pub(crate) rubric: &'a Rubric,
    pub(crate) anchors: ScoringAnchors,
    pub(crate) max_score: f64,
    weighting: Option<CategoryWeighting>,
    pub(crate) score_source: ScoreSource,
}

impl<'a> Job<'a> {
    pub(crate) fn new(rubric: &'a Rubric) -> Self {
        Self {
            rubric,
            anchors: generate_scoring_anchors(rubric),
            max_score: rubric.max_score_value(),
            weighting: rubric.category_weighting(),
            score_source: ScoreSource::Ai,
        }
    }

    /// Reads a reply to a batch prompt for `students`. `None` if nothing in
    /// it could be read.
    ///
    /// The parser reports an unreadable reply as a zero with a stock message
    /// for every student. Those are not grades, so they are not passed on.
    pub(crate) fn read(&self, reply: &str, students: &[StudentWork]) -> Option<Vec<StudentResult>> {
        let checked = self.read_checked(reply, students)?;
        Some(checked.into_iter().map(|checked| checked.result).collect())
    }

    /// Like [`Self::read`], and also says which results the AI gave a score for.
    pub(crate) fn read_checked(
        &self,
        reply: &str,
        students: &[StudentWork],
    ) -> Option<Vec<CheckedResult>> {
        let results =
            parse_batch_response_checked(reply, students, self.max_score, self.weighting.as_ref())
                .ok()?;
        let unreadable = results.len() == students.len()
            && results
                .iter()
                .all(|checked| is_parse_error(&checked.result));
        (!unreadable).then_some(results)
    }
}

pub(crate) fn is_parse_error(result: &StudentResult) -> bool {
    result.score == 0.0 && result.feedback == PARSE_ERROR_FEEDBACK
}
