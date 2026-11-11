//! Picking graded responses from earlier chunks to show the AI alongside the
//! next chunk, so every chunk is scored to the same standard.

use std::cmp::Ordering;

use ogre_core::{BridgeResponse, ScoringAnchors, StudentResult, StudentWork};

use crate::text::display_name;

/// Below this many tiered examples the scores are too bunched for tiers to
/// mean much, and a low, middle and high example are used instead.
const MIN_TIERED_BRIDGES: usize = 3;

/// Chooses up to two graded responses from each anchor tier: the lowest and
/// the highest scoring in it.
///
/// The tiers overlap at the top (a score one below the excellent anchor is
/// both excellent and adequate) and leave a gap between the below-average
/// anchor and one above it. A student picked for two tiers appears once, in
/// the first position and labelled with the later tier. `students` supplies
/// names only.
pub fn build_bridge_responses(
    results: &[StudentResult],
    students: &[StudentWork],
    anchors: &ScoringAnchors,
) -> Vec<BridgeResponse> {
    let bridge = |result: &StudentResult, tier: &str| {
        let student = students.iter().find(|s| s.index == result.student_index);
        BridgeResponse {
            tier: Some(tier.to_owned()),
            name: Some(display_name(student, result.student_index)),
            student_index: result.student_index,
            score: result.score,
            feedback: result.feedback.clone(),
        }
    };
    let by_score = |keep: &dyn Fn(f64) -> bool| {
        let mut kept: Vec<&StudentResult> = results.iter().filter(|r| keep(r.score)).collect();
        kept.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(Ordering::Equal));
        kept
    };

    let excellent = anchors.excellent.score;
    let below_average = anchors.below_average.score;
    let minimal = anchors.minimal.score;
    let tiers: [(&str, &dyn Fn(f64) -> bool); 4] = [
        ("excellent", &|score| score >= excellent - 1.0),
        ("adequate", &|score| {
            score >= below_average + 1.0 && score <= excellent - 1.0
        }),
        ("belowAverage", &|score| {
            score >= minimal + 1.0 && score <= below_average
        }),
        ("minimal", &|score| score < minimal + 1.0),
    ];

    let mut bridges = Vec::new();
    for (tier, keep) in tiers {
        match by_score(keep).as_slice() {
            [] => {}
            [only] => bridges.push(bridge(only, tier)),
            [lowest, .., highest] => {
                bridges.push(bridge(lowest, tier));
                bridges.push(bridge(highest, tier));
            }
        }
    }

    if bridges.len() < MIN_TIERED_BRIDGES {
        let sorted = by_score(&|_| true);
        bridges = [0, sorted.len() / 2, sorted.len().saturating_sub(1)]
            .into_iter()
            .filter_map(|position| sorted.get(position))
            .map(|result| bridge(result, "spread"))
            .collect();
    }
    one_per_student(bridges)
}

/// Keeps one entry per student: the first one's position, the last one's
/// content.
fn one_per_student(bridges: Vec<BridgeResponse>) -> Vec<BridgeResponse> {
    let mut unique: Vec<BridgeResponse> = Vec::with_capacity(bridges.len());
    for bridge in bridges {
        match unique
            .iter_mut()
            .find(|kept| kept.student_index == bridge.student_index)
        {
            Some(kept) => *kept = bridge,
            None => unique.push(bridge),
        }
    }
    unique
}
