//! The teacher's graded examples as the worker reaches them: in a folder on
//! this computer, or on a server of the teacher's.

use std::path::Path;

use ogre_core::{CalibrationExample, CalibrationExamples};
use ogre_examples::{Chosen, FolderStore, GradedExample, ServerStore};

/// Where examples are kept.
#[derive(Clone, PartialEq)]
pub enum ExamplesPlace {
    /// In the app's data folder.
    ThisComputer,
    Server {
        address: String,
        key: Option<String>,
    },
}

impl std::fmt::Debug for ExamplesPlace {
    // The key is not for a log.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ThisComputer => write!(f, "ThisComputer"),
            Self::Server { address, key } => {
                let key = if key.is_some() { "a key" } else { "no key" };
                write!(f, "Server({address}, {key})")
            }
        }
    }
}

/// One question's examples: where they are kept, and under which name.
#[derive(Debug, Clone, PartialEq)]
pub struct ExamplesFor {
    pub place: ExamplesPlace,
    /// As [`ogre_examples::rubric_id`] names the question.
    pub rubric: String,
}

/// Grades on their way to the page that are to be kept as examples once
/// they are on it.
#[derive(Debug, Clone, PartialEq)]
pub struct KeepRequest {
    pub examples_for: ExamplesFor,
    /// Each with the student's place on the page, to tell which were written.
    pub examples: Vec<(usize, GradedExample)>,
}

/// A place examples are kept, opened.
pub(crate) enum Kept {
    Folder(FolderStore),
    Server(ServerStore),
}

impl Kept {
    /// `folder` is where examples kept on this computer are.
    pub fn open(folder: &Path, place: &ExamplesPlace) -> Result<Self, String> {
        match place {
            ExamplesPlace::ThisComputer => Ok(Self::Folder(FolderStore::new(folder))),
            ExamplesPlace::Server { address, key } => {
                ServerStore::new(address, key.as_deref().unwrap_or_default()).map(Self::Server)
            }
        }
    }

    pub async fn add(&self, rubric: &str, examples: &[GradedExample]) -> Result<usize, String> {
        match self {
            Self::Folder(folder) => folder.add(rubric, examples),
            Self::Server(server) => server.add(rubric, examples).await,
        }
    }

    pub async fn for_rubric(&self, rubric: &str) -> Result<Vec<GradedExample>, String> {
        match self {
            Self::Folder(folder) => folder.for_rubric(rubric),
            Self::Server(server) => server.for_rubric(rubric).await,
        }
    }

    pub async fn count(&self) -> Result<usize, String> {
        match self {
            Self::Folder(folder) => folder.count(),
            Self::Server(server) => server.count().await,
        }
    }

    pub async fn clear(&self) -> Result<usize, String> {
        match self {
            Self::Folder(folder) => folder.clear(),
            Self::Server(server) => server.clear().await,
        }
    }
}

/// The chosen examples as the grading engine takes them. `None` when there
/// is nothing to show.
pub(crate) fn for_grader(chosen: &Chosen) -> Option<CalibrationExamples> {
    let one = |example: &Option<GradedExample>| {
        example.as_ref().map(|example| CalibrationExample {
            grading_score: example.score,
            feedback: example.feedback.clone(),
        })
    };
    (chosen.considered > 0).then(|| CalibrationExamples {
        total: chosen.considered as f64,
        excellent: one(&chosen.high),
        adequate: one(&chosen.middle),
        minimal: one(&chosen.low),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_servers_key_is_not_printed() {
        let place = ExamplesPlace::Server {
            address: "https://school.example".into(),
            key: Some("a-secret-key".into()),
        };
        let printed = format!("{place:?}");
        assert!(printed.contains("school.example"), "{printed}");
        assert!(!printed.contains("a-secret-key"), "{printed}");
    }

    #[test]
    fn nothing_kept_is_nothing_to_show() {
        assert_eq!(for_grader(&Chosen::default()), None);
    }
}
