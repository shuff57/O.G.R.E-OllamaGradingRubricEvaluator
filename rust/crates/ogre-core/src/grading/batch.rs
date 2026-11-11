//! Whole-class operations: splitting students into chunks, merging the
//! chunks' results and finding scores far from the mean.

use std::sync::LazyLock;

use regex::Regex;

use super::js::{self, WS};
use super::types::{Chunk, Outlier, OutlierReport, StudentResult, StudentWork};
use super::{NUMBER, pattern};

/// The chunk size the original uses for [`chunk_students`] by default.
pub const DEFAULT_CHUNK_SIZE: usize = 20;
/// The chunk size the original uses for [`chunk_students_by_prompt`] by
/// default.
pub const DEFAULT_PROMPT_CHUNK_SIZE: usize = 30;

static NUMBERS: LazyLock<Regex> = LazyLock::new(|| pattern(NUMBER));
static WHITESPACE_RUN: LazyLock<Regex> = LazyLock::new(|| pattern(&format!("{WS}+")));

/// Splits students into chunks of at most `chunk_size`, in order. A
/// `chunk_size` of zero is treated as one.
pub fn chunk_students(students: Vec<StudentWork>, chunk_size: usize) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    push_chunks(&mut chunks, students, chunk_size, None);
    chunks
}

/// Splits students into chunks in which everyone answered the same question.
///
/// Students are grouped by their own `prompt`, ignoring the numbers in it, so
/// that a question with per-student randomized values is one group while
/// differently worded versions stay apart. Students without a prompt are
/// grouped under `fallback_prompt`. Groups keep first-seen order and each
/// chunk carries its group's key, so examples from one version are not used
/// to calibrate another.
pub fn chunk_students_by_prompt(
    students: Vec<StudentWork>,
    chunk_size: usize,
    fallback_prompt: &str,
) -> Vec<Chunk> {
    let mut groups: Vec<(String, Vec<StudentWork>)> = Vec::new();
    for student in students {
        let key = prompt_group_key(&student, fallback_prompt);
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, members)) => members.push(student),
            None => groups.push((key, vec![student])),
        }
    }

    let mut chunks = Vec::new();
    for (key, members) in groups {
        push_chunks(&mut chunks, members, chunk_size, Some(&key));
    }
    chunks
}

fn push_chunks(
    chunks: &mut Vec<Chunk>,
    students: Vec<StudentWork>,
    chunk_size: usize,
    prompt_key: Option<&str>,
) {
    let mut remaining = students.into_iter().peekable();
    while remaining.peek().is_some() {
        chunks.push(Chunk {
            students: remaining.by_ref().take(chunk_size.max(1)).collect(),
            needs_anchors: !chunks.is_empty(),
            chunk_index: chunks.len(),
            prompt_key: prompt_key.map(str::to_owned),
        });
    }
}

/// The student's question with numbers masked, whitespace collapsed and case
/// folded.
fn prompt_group_key(student: &StudentWork, fallback: &str) -> String {
    let raw = student
        .prompt
        .as_deref()
        .map(js::trim)
        .filter(|prompt| !prompt.is_empty())
        .unwrap_or(fallback);
    let masked = NUMBERS.replace_all(raw, "N");
    let collapsed = WHITESPACE_RUN.replace_all(&masked, " ");
    js::trim(&collapsed.to_lowercase()).to_owned()
}

/// Joins per-chunk results into one list ordered by student index.
pub fn merge_results(chunk_results: Vec<Vec<StudentResult>>) -> Vec<StudentResult> {
    let mut merged: Vec<StudentResult> = chunk_results.into_iter().flatten().collect();
    merged.sort_by_key(|result| result.student_index);
    merged
}

/// Finds scores more than two standard deviations from the batch mean.
///
/// Two, not one: one flags about a third of a normal class, and re-grading
/// that many pulls accurate scores toward the mean.
pub fn detect_outliers(results: &[StudentResult]) -> OutlierReport {
    if results.is_empty() {
        return OutlierReport {
            mean: 0.0,
            std_dev: 0.0,
            outliers: Vec::new(),
        };
    }
    let count = results.len() as f64;
    let mean = results.iter().map(|r| r.score).sum::<f64>() / count;
    let variance = results
        .iter()
        .map(|r| (r.score - mean).powi(2))
        .sum::<f64>()
        / count;
    let std_dev = variance.sqrt();

    let mut outliers: Vec<Outlier> = results
        .iter()
        .filter(|r| (r.score - mean).abs() > std_dev * 2.0)
        .map(|r| Outlier {
            student_index: r.student_index,
            score: r.score,
            deviation: (r.score - mean).abs() / js::or_number(std_dev, 1.0),
        })
        .collect();
    outliers.sort_by(|a, b| b.deviation.total_cmp(&a.deviation));
    for outlier in &mut outliers {
        outlier.deviation = js::to_fixed_2(outlier.deviation);
    }

    OutlierReport {
        mean: js::to_fixed_2(mean),
        std_dev: js::to_fixed_2(std_dev),
        outliers,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn student(index: usize, prompt: Option<&str>) -> StudentWork {
        StudentWork {
            index,
            name: format!("Student {index}"),
            response: String::new(),
            prompt: prompt.map(str::to_owned),
        }
    }

    fn result(student_index: usize, score: f64) -> StudentResult {
        StudentResult {
            student_index,
            score,
            feedback: String::new(),
        }
    }

    #[test]
    fn jittered_prompts_share_a_group() {
        let students = vec![
            student(0, Some("Predict y when x = 3.5 and b = -2")),
            student(1, Some("Explain the residual.")),
            student(2, Some("  predict Y when x = 12\n and b = 7 ")),
            student(3, None),
            student(4, Some("   ")),
            student(5, Some("Predict y when x = 1 and b = 0")),
        ];
        let chunks = chunk_students_by_prompt(students, 2, "Explain the  RESIDUAL.");
        let shape: Vec<(Vec<usize>, bool, usize, &str)> = chunks
            .iter()
            .map(|c| {
                (
                    c.students.iter().map(|s| s.index).collect(),
                    c.needs_anchors,
                    c.chunk_index,
                    c.prompt_key.as_deref().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            shape,
            [
                (vec![0, 2], false, 0, "predict y when x = n and b = n"),
                (vec![5], true, 1, "predict y when x = n and b = n"),
                (vec![1, 3], true, 2, "explain the residual."),
                (vec![4], true, 3, "explain the residual."),
            ]
        );
    }

    #[test]
    fn chunking_nothing_gives_nothing() {
        assert!(chunk_students(vec![], 20).is_empty());
        assert!(chunk_students_by_prompt(vec![], 30, "").is_empty());
    }

    #[test]
    fn zero_chunk_size_still_terminates() {
        let chunks = chunk_students(vec![student(0, None), student(1, None)], 0);
        assert_eq!(chunks.len(), 2);
    }

    #[test]
    fn merge_sorts_by_student_index_across_chunks() {
        let merged = merge_results(vec![
            vec![result(4, 1.0), result(0, 2.0)],
            vec![],
            vec![result(2, 3.0)],
        ]);
        let order: Vec<usize> = merged.iter().map(|r| r.student_index).collect();
        assert_eq!(order, [0, 2, 4]);
    }

    #[test]
    fn outlier_statistics_round_to_two_places() {
        let scores = [8.0, 8.0, 9.0, 8.0, 8.0, 8.0, 0.0];
        let results: Vec<StudentResult> = scores
            .iter()
            .enumerate()
            .map(|(i, &s)| result(i, s))
            .collect();
        let report = detect_outliers(&results);
        assert_eq!(report.mean, 7.0);
        assert_eq!(report.std_dev, 2.88);
        assert_eq!(
            report.outliers,
            [Outlier {
                student_index: 6,
                score: 0.0,
                deviation: 2.43
            }]
        );
    }

    #[test]
    fn mean_on_an_exact_tie_rounds_up() {
        let scores = [8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 9.0];
        let results: Vec<StudentResult> = scores
            .iter()
            .enumerate()
            .map(|(i, &s)| result(i, s))
            .collect();
        // 8.125 is exactly representable; JavaScript's toFixed gives 8.13.
        assert_eq!(detect_outliers(&results).mean, 8.13);
    }
}
