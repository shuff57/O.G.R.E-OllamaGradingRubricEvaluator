//! The rubric text the teacher edits, and the rubric built from their edits.

use super::*;

const MODE: WeightMode = WeightMode::Category;

#[test]
fn text_left_alone_grades_like_the_page_rubric() {
    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped);
    assert!(!text.contains("(0pts)"), "{text}");
    assert!(text.contains("\nGive the value, using a calculator.\n"));
    assert_eq!(grading_text(&text), rubric_text(&scraped));
    assert_eq!(
        rubric_from_edited_text(&scraped, &text, MODE),
        prepare_for_grading(&scraped, MODE)
    );
}

#[test]
fn a_requirement_the_teacher_adds_is_graded() {
    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped).replacen(
        "\n\n--- Model Response ---",
        "\n## Units\nNames the units: every number has its unit.\n\n--- Model Response ---",
        1,
    );
    let rubric = rubric_from_edited_text(&scraped, &text, MODE);
    let added = rubric.checklist_items.last().unwrap();
    assert_eq!(added.category.as_deref(), Some("Units"));
    assert_eq!(added.items, ["Names the units: every number has its unit."]);
    assert_eq!(rubric.checklist_items.len(), 5);
    assert_eq!(rubric.model_text, scraped.model_text);
}

#[test]
fn a_deleted_exemplar_answer_stays_deleted() {
    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped);
    let without = &text[..text.find("--- Model Response ---").unwrap()];
    let rubric = rubric_from_edited_text(&scraped, without, MODE);
    assert_eq!(rubric.model_text, None);
    assert_eq!(rubric.checklist_items.len(), 4);
}

#[test]
fn a_rewritten_exemplar_answer_replaces_the_pages() {
    let scraped = real_rubric();
    let text = editable_rubric_text(&scraped).replace("0.2375", "0.238");
    let rubric = rubric_from_edited_text(&scraped, &text, MODE);
    assert_eq!(
        rubric.model_text.as_deref(),
        Some("X ~ B(20, 0.7). P(X >= 16) = 0.238.")
    );
}

#[test]
fn erased_requirements_do_not_come_back_from_the_page() {
    let scraped = real_rubric();
    let rubric = rubric_from_edited_text(&scraped, "", MODE);
    assert!(rubric.checklist_items.is_empty());
    assert!(rubric.rubric_items.is_empty());
    assert_eq!(rubric.model_text, None);
    // What the page says about the question itself is kept.
    assert_eq!(rubric.essay_prompt, scraped.essay_prompt);
    assert_eq!(rubric.max_score_value(), 14.0);
}

#[test]
fn a_page_without_a_rubric_starts_with_an_empty_editor() {
    let bare = Rubric::default();
    assert_eq!(editable_rubric_text(&bare), "");

    let only_exemplar = Rubric {
        model_text: Some("The mean is 14.".to_owned()),
        ..Rubric::default()
    };
    let text = editable_rubric_text(&only_exemplar);
    assert_eq!(text, "--- Model Response ---\nThe mean is 14.");
    assert_eq!(
        rubric_from_edited_text(&only_exemplar, &text, MODE).model_text,
        only_exemplar.model_text
    );
}

#[test]
fn a_rubric_typed_from_scratch_is_graded() {
    let text = "## Method\nSets up the equation (2pts): Uses the given rate.\nSolves it (2pts)\n## Answer\nStates the result (1pts): With units.";
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    let categories: Vec<_> = rubric
        .checklist_items
        .iter()
        .map(|item| (item.category.as_deref().unwrap(), item.items.len()))
        .collect();
    assert_eq!(categories, [("Method", 2), ("Answer", 1)]);
    assert!(rubric.category_weights.is_some(), "weights are filled in");
}

#[test]
fn the_page_rubric_has_no_unread_lines() {
    assert_eq!(
        unread_rubric_lines(&editable_rubric_text(&real_rubric())),
        Vec::<String>::new()
    );
    assert_eq!(unread_rubric_lines(""), Vec::<String>::new());
}

#[test]
fn a_line_typed_without_points_is_a_requirement() {
    let text = "## Method\nSets up the equation (2pts): Uses the given rate.\nShows every step\n\n--- Model Response ---\nA line of the exemplar.";
    assert_eq!(unread_rubric_lines(text), Vec::<String>::new());
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    assert_eq!(
        rubric.checklist_items[0].items,
        [
            "Sets up the equation: Uses the given rate.",
            "Shows every step"
        ]
    );
    assert_eq!(
        rubric.model_text.as_deref(),
        Some("A line of the exemplar.")
    );
}

#[test]
fn free_text_is_graded_line_by_line() {
    let text = "Give full marks for a clear answer.\nTake a point off for missing units.";
    assert_eq!(unread_rubric_lines(text), Vec::<String>::new());
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    let requirements: Vec<_> = rubric
        .checklist_items
        .iter()
        .flat_map(|item| &item.items)
        .collect();
    assert_eq!(
        requirements,
        [
            "Give full marks for a clear answer.",
            "Take a point off for missing units."
        ]
    );
}

#[test]
fn points_and_weights_a_teacher_types_are_kept() {
    let text = "## Method [60%]\nSets up the equation (2pts)\nSolves it\n## Answer [40%]\nStates the result";
    assert_eq!(
        grading_text(text),
        "## Method [60%]\nSets up the equation (2pts)\nSolves it (0pts)\n## Answer [40%]\nStates the result (0pts)"
    );
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    let weights = rubric.category_weights.unwrap();
    assert_eq!(weights.get("Method"), Some(&60.0));
    assert_eq!(weights.get("Answer"), Some(&40.0));
}

#[test]
fn a_name_that_reads_as_points_or_a_heading_keeps_its_zero_points() {
    // Shown plainly, these would come back as something else.
    let scraped: Rubric = serde_json::from_str(
        r#"{"checklistItems": [{"category": "Parts", "items": ["Part A (2 pts)", "\u0023# Not a heading", "Says why"]}]}"#,
    )
    .unwrap();
    let text = editable_rubric_text(&scraped);
    assert_eq!(
        text,
        "## Parts\nPart A (2 pts) (0pts)\n## Not a heading (0pts)\nSays why"
    );
    assert_eq!(grading_text(&text), rubric_text(&scraped));
}

#[test]
fn bracketed_categories_with_dashed_items_are_read() {
    let text =
        "[Method]\n- Sets up the equation\n- Solves it\nstray note\n[Answer]\n- States the result";
    assert_eq!(unread_rubric_lines(text), ["stray note"]);
    let rubric = rubric_from_edited_text(&Rubric::default(), text, MODE);
    assert_eq!(rubric.checklist_items.len(), 2);
    assert_eq!(rubric.checklist_items[0].items.len(), 2);
}
