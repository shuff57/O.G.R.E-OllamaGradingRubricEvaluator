//! A rubric read from a picture: the AI's reply, and the rubric text made
//! from it.

use super::*;

const REPLY: &str = r#"{
  "suggestedName": "Essay 2",
  "rubric": [
    { "criteria": "Writing Quality", "description": "Clear grammar, style, and organization", "points": 10 },
    { "criteria": "Argument Strength", "description": "Thesis is supported with evidence", "points": "15 pts" },
    { "criteria": "Analysis", "description": "", "points": 5 }
  ]
}"#;

#[test]
fn a_plain_reply_is_read() {
    let rubric = parse_rubric_extraction(REPLY).unwrap();
    assert_eq!(rubric.suggested_name, "Essay 2");
    let read: Vec<(&str, f64)> = rubric
        .criteria
        .iter()
        .map(|c| (c.criteria.as_str(), c.points))
        .collect();
    assert_eq!(
        read,
        [
            ("Writing Quality", 10.0),
            ("Argument Strength", 15.0),
            ("Analysis", 5.0)
        ]
    );
    assert_eq!(rubric.criteria[2].question, None);
}

#[test]
fn what_models_put_around_the_json_is_set_aside() {
    let expected = parse_rubric_extraction(REPLY).unwrap();
    let fenced = format!(
        "<think>\nIs {{ this }} a rubric?\n</think>\nHere it is:\n```json\n{REPLY}\n```\nDone."
    );
    assert_eq!(parse_rubric_extraction(&fenced).unwrap(), expected);
    let bare_fence = format!("```\n{REPLY}\n```");
    assert_eq!(parse_rubric_extraction(&bare_fence).unwrap(), expected);
    let talkative = format!("Sure! {REPLY} Let me know if you need more.");
    assert_eq!(parse_rubric_extraction(&talkative).unwrap(), expected);
}

#[test]
fn rows_without_a_name_are_dropped_and_odd_values_do_not_break_the_rest() {
    let reply = r#"{"rubric": [
        null,
        {"description": "No name here", "points": 4},
        {"name": "  Evidence\n  used ", "points": "lots", "question": "2"},
        {"criteria": "Clarity", "points": -1, "question": 0}
    ]}"#;
    let rubric = parse_rubric_extraction(reply).unwrap();
    assert_eq!(rubric.suggested_name, "");
    assert_eq!(rubric.criteria.len(), 2);
    assert_eq!(rubric.criteria[0].criteria, "Evidence used");
    assert_eq!(rubric.criteria[0].points, 0.0);
    assert_eq!(rubric.criteria[0].question, Some(2.0));
    assert_eq!(rubric.criteria[1].question, None);
}

#[test]
fn a_reply_with_no_rubric_in_it_says_which_way_it_failed() {
    for reply in ["I cannot see a rubric in this image.", "[1, 2]", ""] {
        assert_eq!(
            parse_rubric_extraction(reply),
            Err(ExtractionError::NotJson),
            "{reply}"
        );
    }
    for reply in [
        r#"{"rubric": []}"#,
        r#"{"suggestedName": "x"}"#,
        r#"{"rubric": [{"points": 3}]}"#,
    ] {
        assert_eq!(
            parse_rubric_extraction(reply),
            Err(ExtractionError::NoCriteria),
            "{reply}"
        );
    }
}

#[test]
fn each_criterion_becomes_a_category_weighted_by_its_points() {
    let rubric = parse_rubric_extraction(REPLY).unwrap();
    let text = imported_rubric_text(&rubric.criteria);
    assert_eq!(
        text,
        "## Writing Quality [33.3%]\nClear grammar, style, and organization\n## Argument Strength [50%]\nThesis is supported with evidence\n## Analysis [16.7%]\nAnalysis"
    );
    // The weights are the teacher's to see, and they add up.
    assert!(names_category_weights(&text));
    assert_eq!(category_weight_problem(&text), None);
    let graded = rubric_from_edited_text(&Rubric::default(), &text, WeightMode::Category);
    assert_eq!(graded.checklist_items.len(), 3);
    assert_eq!(
        graded.category_weights.unwrap().get("Argument Strength"),
        Some(&50.0)
    );
}

#[test]
fn criteria_without_points_get_no_weights() {
    let criteria = [
        criterion("Thesis", "States a position", 0.0),
        criterion("Evidence", "Cites two sources", 4.0),
    ];
    assert_eq!(
        imported_rubric_text(&criteria),
        "## Thesis\nStates a position\n## Evidence\nCites two sources"
    );
    // A single criterion is the whole grade whatever its points.
    assert_eq!(
        imported_rubric_text(&criteria[1..]),
        "## Evidence\nCites two sources"
    );
}

#[test]
fn several_questions_and_repeated_names_stay_apart() {
    let mut criteria = [
        criterion("Analysis", "Finds the theme", 5.0),
        criterion("Analysis", "Finds the tone", 5.0),
        criterion("Analysis", "Compares both", 10.0),
    ];
    criteria[0].question = Some(1.0);
    criteria[1].question = Some(1.0);
    criteria[2].question = Some(2.0);
    let text = imported_rubric_text(&criteria);
    assert_eq!(
        text,
        "## Question 1: Analysis [25%]\nFinds the theme\n## Question 1: Analysis (2) [25%]\nFinds the tone\n## Question 2: Analysis [50%]\nCompares both"
    );
    assert_eq!(category_shares(&text).len(), 3);
    assert_eq!(category_weight_problem(&text), None);
}

#[test]
fn new_requirements_keep_the_exemplar_answer() {
    let text = "## Old\nOld requirement\n\n--- Model Response ---\nThe answer is 4.";
    assert_eq!(
        with_requirements(text, "## New\nNew requirement"),
        "## New\nNew requirement\n\n--- Model Response ---\nThe answer is 4."
    );
    assert_eq!(with_requirements("Old requirement", "New"), "New");
    assert_eq!(with_requirements("", "New"), "New");
}

#[test]
fn the_draft_prompt_carries_the_question_and_what_it_is_worth() {
    let prompt = rubric_draft_prompt("  Explain the margin of error.\n", 14.0);
    assert!(prompt.starts_with(
        "You are a grading assistant. Create a JSON scoring rubric from the assignment text provided.\n\nOUTPUT FORMAT \u{2014} Your entire response must be a single valid JSON object. Begin with `{` and end with `}`."
    ));
    assert!(
        prompt.contains("2. Criteria point values must sum to EXACTLY 14. Use whole numbers only.")
    );
    assert!(prompt.ends_with("Assignment (max 14 points):\nExplain the margin of error."));
    assert!(!prompt.contains("${"));
    // Half points print as JavaScript prints them.
    assert!(rubric_draft_prompt("Q", 2.5).contains("EXACTLY 2.5."));
}

#[test]
fn a_drafted_rubric_reads_like_one_from_a_picture() {
    // The prompt's own example of a reply.
    let reply = r#"{"suggestedName": "Essay Analysis", "rubric": [{"criteria": "Thesis Statement", "description": "Full: clear, arguable thesis stated | Partial: thesis present but vague or broad | None: no thesis or completely off-topic", "points": 4, "question": 1}, {"criteria": "Supporting Evidence", "description": "Full: 2+ specific examples with explanation | Partial: evidence cited but underdeveloped | None: no supporting evidence", "points": 6, "question": 1}]}"#;
    let rubric = parse_rubric_extraction(reply).unwrap();
    let text = imported_rubric_text(&rubric.criteria);
    assert!(
        text.starts_with(
            "## Thesis Statement [40%]\nFull: clear, arguable thesis stated | Partial:"
        )
    );
    assert!(text.contains("\n## Supporting Evidence [60%]\n"));
    assert_eq!(category_weight_problem(&text), None);
    assert_eq!(unread_rubric_lines(&text), Vec::<String>::new());
    // A reply that says there is nothing to grade.
    assert_eq!(
        parse_rubric_extraction(r#"{"suggestedName": "", "rubric": []}"#),
        Err(ExtractionError::NoCriteria)
    );
}
