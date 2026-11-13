//! The category weights in the rubric text the teacher edits.

use super::*;

const MODE: WeightMode = WeightMode::Category;

fn share(category: &str, weight: f64) -> CategoryShare {
    CategoryShare {
        category: category.to_owned(),
        weight,
    }
}

const THREE: &str = "## Method\nShows the steps\n## Answer\nGives the value\n## Writing\nUses sentences\n\n--- Model Response ---\nThe answer is 4.";

#[test]
fn text_without_weights_shows_the_ones_grading_fills_in() {
    assert_eq!(
        category_shares(THREE),
        [
            share("Method", 33.4),
            share("Answer", 33.3),
            share("Writing", 33.3)
        ]
    );
    assert_eq!(category_weight_problem(THREE), None);
    // The same weights the rubric is graded with.
    let rubric = rubric_from_edited_text(&Rubric::default(), THREE, MODE);
    let graded: Vec<(String, f64)> = rubric
        .category_weights
        .unwrap()
        .iter()
        .map(|(category, weight)| (category.to_owned(), *weight))
        .collect();
    assert_eq!(
        graded,
        [
            ("Method".to_owned(), 33.4),
            ("Answer".to_owned(), 33.3),
            ("Writing".to_owned(), 33.3)
        ]
    );
}

#[test]
fn changing_one_weight_writes_every_weight_into_the_text() {
    let text = with_category_weight(THREE, "Answer", 50.0);
    assert_eq!(
        text,
        "## Method [33.4%]\nShows the steps\n## Answer [50%]\nGives the value\n## Writing [33.3%]\nUses sentences\n\n--- Model Response ---\nThe answer is 4."
    );
    assert_eq!(
        category_weight_problem(&text).as_deref(),
        Some("The category weights add up to 116.7%. They must add up to 100%.")
    );

    let text = with_category_weight(&text, "Method", 25.0);
    let text = with_category_weight(&text, "Writing", 25.0);
    assert_eq!(
        category_shares(&text),
        [
            share("Method", 25.0),
            share("Answer", 50.0),
            share("Writing", 25.0)
        ]
    );
    assert_eq!(category_weight_problem(&text), None);
    let rubric = rubric_from_edited_text(&Rubric::default(), &text, MODE);
    assert_eq!(rubric.category_weights.unwrap().get("Answer"), Some(&50.0));
    assert_eq!(rubric.model_text.as_deref(), Some("The answer is 4."));
}

#[test]
fn a_weight_is_kept_between_nothing_and_everything() {
    let text = with_category_weight(THREE, "Answer", 250.0);
    assert_eq!(category_shares(&text)[1], share("Answer", 100.0));
    let text = with_category_weight(THREE, "Answer", -3.0);
    assert_eq!(category_shares(&text)[1], share("Answer", 0.0));
    // A category the text does not have changes no weight.
    assert_eq!(
        category_shares(&with_category_weight(THREE, "Spelling", 40.0)),
        category_shares(THREE)
    );
}

#[test]
fn weights_can_be_shared_out_equally_again() {
    let lopsided = "## Method [70%]\nShows the steps\n## Answer [10%]\nGives the value";
    assert_eq!(
        category_weight_problem(lopsided).as_deref(),
        Some("The category weights add up to 80%. They must add up to 100%.")
    );
    let text = with_equal_category_weights(lopsided);
    assert_eq!(
        text,
        "## Method [50%]\nShows the steps\n## Answer [50%]\nGives the value"
    );
    assert_eq!(category_weight_problem(&text), None);
}

#[test]
fn a_heading_with_a_weight_beside_headings_without_one_does_not_add_up() {
    let text = "## Method [60%]\nShows the steps\n## Answer\nGives the value";
    assert_eq!(
        category_shares(text),
        [share("Method", 60.0), share("Answer", 0.0)]
    );
    assert_eq!(
        category_weight_problem(text).as_deref(),
        Some("The category weights add up to 60%. They must add up to 100%.")
    );
}

#[test]
fn requirements_above_the_first_heading_are_reported() {
    let text = "Names the units\n## Method\nShows the steps\n## Answer\nGives the value";
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    let total: f64 = rubric
        .category_weights
        .unwrap()
        .iter()
        .map(|(_, weight)| *weight)
        .sum();
    // What grading would do with it: the named categories do not reach 100.
    assert!(total < 70.0, "{total}");
    assert!(
        category_weight_problem(text)
            .unwrap()
            .starts_with("The requirements above the first heading are in no category")
    );
}

#[test]
fn text_without_headings_has_no_weights_to_get_wrong() {
    let text = "Shows the steps\nGives the value";
    assert_eq!(category_shares(text), []);
    assert_eq!(category_weight_problem(text), None);
    assert_eq!(with_equal_category_weights(text), text);
    assert_eq!(with_category_weight(text, "Method", 40.0), text);
}

#[test]
fn the_page_rubric_as_read_has_weights_that_add_up() {
    let text = editable_rubric_text(&real_rubric());
    assert!(!category_shares(&text).is_empty());
    assert_eq!(category_weight_problem(&text), None);
}

/// A page whose categories are named with their points, and one more the
/// teacher added. The AI is asked to name categories without their points,
/// so only the added one matches its weight.
#[test]
fn a_category_the_teacher_adds_does_not_shrink_every_score() {
    use crate::grading::{StudentWork, parse_batch_response, parse_batch_response_checked};

    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped).replacen(
        "\n\n--- Model Response ---",
        "\n## Units\nNames the units: every number has its unit.\n\n--- Model Response ---",
        1,
    );
    let rubric = rubric_from_edited_text(&scraped, &text, MODE);
    let students = [StudentWork {
        index: 0,
        name: "Avery, Sam".to_owned(),
        response: "There are 20 trials.".to_owned(),
        prompt: None,
    }];
    let reply = r#"[{"studentIndex": 0, "criterion_scores": {"Check the Conditions": 8, "Name the Parameters": 8, "State and Compute": 8, "Interpret": 8, "Units": 8}, "score": 8, "feedback": "<p>Hi Sam,</p><p>Incorrect: the units are missing.</p>"}]"#;
    let weighting = rubric.category_weighting();
    let max = rubric.max_score_value();

    // The original: 8 of 10 in the one matching category, worth a fifth.
    let original = parse_batch_response(reply, &students, max, weighting.as_ref()).unwrap();
    assert_eq!(original[0].score, 2.0);
    // Corrected: the AI's own 8 of 10, on a 14-point question.
    let corrected =
        parse_batch_response_checked(reply, &students, max, weighting.as_ref()).unwrap();
    assert_eq!(corrected[0].result.score, 11.0);
    assert!(corrected[0].score_given);
}

#[test]
fn weights_are_named_only_once_a_heading_carries_one() {
    assert!(!names_category_weights(THREE));
    assert!(!names_category_weights(&editable_rubric_text(
        &real_rubric()
    )));
    let weighted = with_equal_category_weights(THREE);
    assert!(names_category_weights(&weighted));
    assert_eq!(without_category_weights(&weighted), THREE);
    // A weight on a requirement's own line is not a category weight.
    assert!(!names_category_weights(
        "## Method\nShows the steps (2pts, 40%)"
    ));
}

/// Weights the teacher writes take part in the score even where the page
/// names its categories with their points.
#[test]
fn written_weights_reach_the_score_by_the_name_the_ai_reports() {
    use crate::grading::{CategoryWeighting, StudentWork, parse_batch_response_checked};

    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped);
    let text = with_equal_category_weights(&text);
    let text = with_category_weight(&text, "Interpret(4 pts)", 70.0);
    let text = with_category_weight(&text, "Check the Conditions(4 pts)", 10.0);
    let text = with_category_weight(&text, "Name the Parameters(2 pts)", 10.0);
    let text = with_category_weight(&text, "State and Compute(4 pts)", 10.0);
    assert_eq!(category_weight_problem(&text), None);
    let rubric = rubric_from_edited_text(&scraped, &text, MODE);

    let students = [StudentWork {
        index: 0,
        name: "Avery, Sam".to_owned(),
        response: "There are 20 trials.".to_owned(),
        prompt: None,
    }];
    let reply = r#"[{"studentIndex": 0, "criterion_scores": {"Check the Conditions": 10, "Name the Parameters": 10, "State and Compute": 10, "Interpret": 0}, "score": 9, "feedback": "<p>Hi Sam,</p><p>Incorrect: the meaning is missing.</p>"}]"#;
    let score = |weighting: Option<CategoryWeighting>| {
        parse_batch_response_checked(reply, &students, 14.0, weighting.as_ref()).unwrap()[0]
            .result
            .score
    };
    // Looked up as written, no weight is found: the AI's own 9 of 10.
    assert_eq!(score(rubric.category_weighting()), 12.5);
    // By the reported name: three categories at 10% each, of 14 points.
    assert_eq!(score(rubric.category_weighting_by_reported_name()), 4.0);
}

#[test]
fn prepared_text_goes_back_to_the_editor_without_what_grading_added() {
    // As grading prepares it: points on every line, weights filled in, and
    // the exemplar answer after the marker.
    let prepared = with_default_weights(&grading_text(THREE), MODE);
    assert!(
        prepared.contains("(0pts)") && prepared.contains('%'),
        "{prepared}"
    );
    assert_eq!(
        editable_requirements(&prepared, false),
        "## Method\nShows the steps\n## Answer\nGives the value\n## Writing\nUses sentences"
    );

    // Weights the teacher's own text named are theirs and stay.
    let weighted = "## Method [70%]\nShows the steps\n## Answer [30%]\nGives the value";
    let prepared = with_default_weights(&grading_text(weighted), MODE);
    assert_eq!(editable_requirements(&prepared, true), weighted);
}
