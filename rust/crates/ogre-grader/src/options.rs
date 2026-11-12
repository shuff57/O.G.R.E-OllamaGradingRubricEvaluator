use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use ogre_core::{CalibrationExamples, DEFAULT_PROMPT_CHUNK_SIZE};

/// The grading server clamped the requested chunk size to this range.
pub const MIN_CHUNK_SIZE: usize = 5;
pub const MAX_CHUNK_SIZE: usize = 50;

/// The consistency sweep is skipped below this many graded students: it
/// splits them into four score bands and needs at least two in a band.
pub const MIN_SWEEP_STUDENTS: usize = 5;

/// How a batch is graded. The defaults are what the grading server did when
/// the desktop app sent no options.
#[derive(Debug, Clone, PartialEq)]
pub struct GradeOptions {
    /// Where each student's score comes from.
    pub score_source: ScoreSource,
    /// Students per request. Zero means the default of 30; other values are
    /// clamped to [`MIN_CHUNK_SIZE`]..=[`MAX_CHUNK_SIZE`].
    pub chunk_size: usize,
    /// Which consistency sweep runs after grading. Its suggestions are
    /// reported for review and never applied.
    pub sweep: SweepMode,
    /// Re-grade students whose score is far from the class mean and replace
    /// their grade with the second opinion. Off by default: the grading
    /// server dropped this step in favour of the sweep's review suggestions.
    pub outlier_review: bool,
    /// Graded examples from earlier sessions, added to every chunk prompt.
    pub calibration_examples: Option<CalibrationExamples>,
    /// How often a [`GradeEvent::Heartbeat`](crate::GradeEvent::Heartbeat)
    /// is sent while a request is pending. `None` sends none.
    pub heartbeat: Option<Duration>,
}

impl Default for GradeOptions {
    fn default() -> Self {
        Self {
            score_source: ScoreSource::Ai,
            chunk_size: DEFAULT_PROMPT_CHUNK_SIZE,
            sweep: SweepMode::Auto,
            outlier_review: false,
            calibration_examples: None,
            heartbeat: Some(Duration::from_secs(30)),
        }
    }
}

impl GradeOptions {
    /// The chunk size actually used.
    pub fn effective_chunk_size(&self) -> usize {
        match self.chunk_size {
            0 => DEFAULT_PROMPT_CHUNK_SIZE,
            size => size.clamp(MIN_CHUNK_SIZE, MAX_CHUNK_SIZE),
        }
    }
}

/// Where a student's score comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ScoreSource {
    /// The AI's own 0 to 10 judgment, as the Electron app uses.
    #[default]
    Ai,
    /// Worked out from the verdicts in the feedback, so that the same
    /// feedback always gives the same score. The AI's score is kept only for
    /// feedback that cannot be read that way. The consistency check, which
    /// exists to even out the AI's own scores, is not run.
    Verdicts,
}

/// The consistency sweep a caller asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SweepMode {
    None,
    Compact,
    Pairwise,
    /// Currently the pairwise sweep.
    #[default]
    Auto,
}

impl SweepMode {
    /// The sweep that runs for `graded` students, if any.
    pub fn kind(self, graded: usize) -> Option<SweepKind> {
        if graded < MIN_SWEEP_STUDENTS {
            return None;
        }
        match self {
            SweepMode::None => None,
            SweepMode::Compact => Some(SweepKind::Compact),
            SweepMode::Pairwise | SweepMode::Auto => Some(SweepKind::Pairwise),
        }
    }
}

/// A consistency sweep that ran.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SweepKind {
    /// One request listing every score beside a short excerpt.
    Compact,
    /// One request per score band, with full responses side by side.
    Pairwise,
}

/// Asks a running grading call to stop. Clones share the flag.
///
/// The flag is read before each request to the AI and while one is pending.
/// A request under way is abandoned: its students come back as not graded.
#[derive(Debug, Clone, Default)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_size_is_clamped_like_the_server() {
        let size = |chunk_size| {
            GradeOptions {
                chunk_size,
                ..GradeOptions::default()
            }
            .effective_chunk_size()
        };
        assert_eq!(GradeOptions::default().effective_chunk_size(), 30);
        assert_eq!(size(0), 30);
        assert_eq!(size(1), 5);
        assert_eq!(size(12), 12);
        assert_eq!(size(500), 50);
    }

    #[test]
    fn sweep_needs_five_graded_students() {
        assert_eq!(SweepMode::Auto.kind(4), None);
        assert_eq!(SweepMode::Auto.kind(5), Some(SweepKind::Pairwise));
        assert_eq!(SweepMode::Pairwise.kind(9), Some(SweepKind::Pairwise));
        assert_eq!(SweepMode::Compact.kind(5), Some(SweepKind::Compact));
        assert_eq!(SweepMode::None.kind(40), None);
    }

    #[test]
    fn cancel_flag_clones_share_state() {
        let flag = CancelFlag::new();
        let other = flag.clone();
        assert!(!other.is_cancelled());
        flag.cancel();
        assert!(other.is_cancelled());
    }
}
