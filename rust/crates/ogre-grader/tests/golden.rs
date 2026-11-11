//! The helpers ported from `grading-server/server.js`, compared with what the
//! JavaScript itself returns.
//!
//! `fixtures/server_golden.json` was recorded by running the original
//! functions (extracted from server.js by source text, since importing the
//! file starts the server) on the inputs stored beside each expected value.

use ogre_core::{
    BridgeResponse, Rubric, ScoringAnchors, StudentResult, StudentWork, generate_scoring_anchors,
};
use ogre_grader::{
    blank_response_feedback, build_anchor_generation_prompt, build_bridge_responses,
    parse_anchor_responses, parse_sweep_adjustments,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Golden {
    bridges: Vec<BridgeCase>,
    sweep_adjustments: Vec<SweepCase>,
    blank_feedback: Vec<BlankCase>,
    anchor_prompts: Vec<PromptCase>,
    anchor_responses: Vec<ResponseCase>,
}

#[derive(Deserialize)]
struct BridgeCase {
    name: String,
    anchors: ScoringAnchors,
    results: Vec<StudentResult>,
    students: Vec<StudentWork>,
    expected: Vec<BridgeResponse>,
}

#[derive(Deserialize)]
struct SweepCase {
    text: String,
    expected: Option<Vec<Value>>,
}

#[derive(Deserialize)]
struct BlankCase {
    rubric: Rubric,
    student: StudentWork,
    expected: String,
}

#[derive(Deserialize)]
struct PromptCase {
    rubric: Rubric,
    leniency: Option<f64>,
    expected: String,
}

#[derive(Deserialize)]
struct ResponseCase {
    rubric: Rubric,
    text: String,
    expected: Vec<ExpectedAnchor>,
}

#[derive(Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ExpectedAnchor {
    label: String,
    score: f64,
    max_score: f64,
    response: String,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("fixtures/server_golden.json")).expect("fixture is valid")
}

#[test]
fn bridge_responses_match_the_server() {
    let cases = golden().bridges;
    assert_eq!(cases.len(), 7);
    for case in cases {
        let actual = build_bridge_responses(&case.results, &case.students, &case.anchors);
        assert_eq!(actual, case.expected, "{}", case.name);
    }
}

#[test]
fn no_results_give_no_bridges() {
    // The server's function throws on an empty list; it is never called
    // with one.
    let anchors = generate_scoring_anchors(&Rubric::default());
    assert!(build_bridge_responses(&[], &[], &anchors).is_empty());
}

#[test]
fn sweep_replies_parse_as_on_the_server() {
    let cases = golden().sweep_adjustments;
    assert_eq!(cases.len(), 13);
    for case in cases {
        assert_eq!(
            parse_sweep_adjustments(&case.text),
            case.expected,
            "{:?}",
            case.text
        );
    }
}

#[test]
fn blank_response_feedback_matches_the_server() {
    let cases = golden().blank_feedback;
    assert_eq!(cases.len(), 4);
    for case in cases {
        assert_eq!(
            blank_response_feedback(&case.rubric, &case.student),
            case.expected
        );
    }
}

#[test]
fn blank_response_feedback_always_says_why() {
    // The server leaves a bare greeting when the checklist is an empty list
    // rather than absent. A rubric cannot tell those apart here, and a
    // greeting alone explains nothing.
    let rubric: Rubric = serde_json::from_str(r#"{"checklistItems": []}"#).unwrap();
    let student: StudentWork =
        serde_json::from_str(r#"{"index": 0, "name": "Kim", "response": ""}"#).unwrap();
    assert_eq!(
        blank_response_feedback(&rubric, &student),
        "<p>Hi Kim,</p><p>No response was submitted, so this question was not evaluated.</p>"
    );
}

#[test]
fn anchor_generation_prompts_match_the_server() {
    let cases = golden().anchor_prompts;
    assert_eq!(cases.len(), 8);
    for case in cases {
        let anchors = generate_scoring_anchors(&case.rubric);
        assert_eq!(
            build_anchor_generation_prompt(&case.rubric, &anchors, case.leniency),
            case.expected,
            "leniency {:?}",
            case.leniency
        );
    }
}

#[test]
fn anchor_replies_parse_as_on_the_server() {
    let cases = golden().anchor_responses;
    assert_eq!(cases.len(), 9);
    for case in cases {
        let anchors = generate_scoring_anchors(&case.rubric);
        let actual: Vec<ExpectedAnchor> =
            parse_anchor_responses(&case.text, &anchors, case.rubric.max_score_value())
                .into_iter()
                .map(|example| ExpectedAnchor {
                    label: example.label,
                    score: example.score,
                    max_score: example.max_score,
                    response: example.response,
                })
                .collect();
        assert_eq!(actual, case.expected, "{:?}", case.text);
    }
}
