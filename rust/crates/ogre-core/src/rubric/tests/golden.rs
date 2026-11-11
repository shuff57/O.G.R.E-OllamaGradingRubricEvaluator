//! Differential tests against the desktop's TypeScript.
//!
//! `golden.json` holds inputs together with what the original returned for
//! them under bun, as of commit 9791461. `rubric-utils.ts` and `format.ts`
//! were imported unchanged; the functions that live inside Svelte components
//! (`buildRubricFromText`, `extractModelTextFromText`, the grade request and
//! the rubric card's weight effect) were copied out verbatim. The `prepare`
//! cases, apart from the two with categories named after `Object.prototype`
//! members, were also run through the real `BatchPanel` and `RubricCard`
//! components under jsdom, which built the same requests.

use std::collections::BTreeMap;
use std::fmt::Debug;

use serde::Deserialize;
use serde_json::Value;

use super::*;
use crate::grading::{
    StudentWork, build_batch_prompt, generate_scoring_anchors, parse_batch_response,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Golden {
    prepare: Vec<PrepareCase>,
    from_text_bases: BTreeMap<String, Rubric>,
    from_text: Vec<FromTextCase>,
    default_weights: Vec<DefaultWeightsCase>,
    model_text: Vec<ModelTextCase>,
    text_to_criteria: Vec<TextCase>,
    criteria: Vec<CriteriaCase>,
    allocation: Vec<AllocationCase>,
}

#[derive(Deserialize)]
struct PrepareCase {
    name: String,
    mode: WeightMode,
    scraped: Rubric,
    expected: Prepared,
}

/// The default path's state at each step.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Prepared {
    /// What `formatRubricForDisplay` gave.
    rubric_text: String,
    /// The rubric card's `tableRows` for that text. Kept as JSON because a
    /// row's points can be infinite, which JSON writes as null.
    table_rows: Value,
    /// The text once the rubric card's weight effect settled.
    filled_text: String,
    /// The request's rubric after the server attached `weightMode`.
    rubric: Rubric,
}

#[derive(Deserialize)]
struct FromTextCase {
    base: String,
    text: String,
    mode: WeightMode,
    expected: Rubric,
}

#[derive(Deserialize)]
struct DefaultWeightsCase {
    text: String,
    mode: WeightMode,
    expected: String,
}

#[derive(Deserialize)]
struct ModelTextCase {
    text: String,
    expected: Option<String>,
}

#[derive(Deserialize)]
struct TextCase {
    text: String,
    expected: Vec<RubricCriterion>,
}

#[derive(Deserialize)]
struct CriteriaCase {
    criteria: Vec<RubricCriterion>,
    expected: CriteriaResults,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CriteriaResults {
    text: String,
    reparsed: Vec<RubricCriterion>,
    validate_category: WeightValidation,
    validate_criterion: WeightValidation,
    equalize_category: Vec<RubricCriterion>,
    equalize_criterion: Vec<RubricCriterion>,
    auto_fill_category: Vec<RubricCriterion>,
    auto_fill_criterion: Vec<RubricCriterion>,
    auto_fill_category_text: String,
    auto_fill_criterion_text: String,
    full_credit: Vec<(usize, f64)>,
    unsaved_against_own_text: bool,
    unsaved_against_other: bool,
}

#[derive(Deserialize)]
struct AllocationCase {
    name: String,
    expected: bool,
}

/// Collects mismatches so one run reports every failing case.
#[derive(Default)]
struct Report {
    checked: usize,
    failures: Vec<String>,
}

impl Report {
    fn check<T: PartialEq + Debug>(&mut self, case: &str, actual: &T, expected: &T) {
        self.checked += 1;
        if actual != expected {
            self.failures.push(format!(
                "{case}\n  expected: {expected:?}\n  actual:   {actual:?}"
            ));
        }
    }

    /// Compares a rubric with the one the original produced: as the typed
    /// value, which is where the order of the weights is checked, and field
    /// by field against the original's JSON, which catches any field the
    /// typed value would not hold.
    fn check_rubric(&mut self, case: &str, actual: &Rubric, expected: &Rubric, json: &Value) {
        self.check(case, actual, expected);
        let actual = serde_json::to_value(actual).expect("rubrics serialize");
        self.check(
            &format!("{case} (as JSON)"),
            &comparable(&actual),
            &comparable(&without_target_weights(json)),
        );
    }
}

/// JSON with the differences that carry no meaning removed: a null field is
/// an absent one, and a number is a double however it was written.
fn comparable(value: &Value) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .filter(|(_, field)| !field.is_null())
                .map(|(key, field)| (key.clone(), comparable(field)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(comparable).collect()),
        other => same_numbers(other),
    }
}

/// JSON with every number as a double, so that `25` equals `25.0`.
fn same_numbers(value: &Value) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, field)| (key.clone(), same_numbers(field)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(same_numbers).collect()),
        Value::Number(number) => {
            // Adding zero turns -0 into 0, which is how JSON.stringify
            // writes it.
            let number = number.as_f64().expect("fixture numbers are doubles") + 0.0;
            Value::String(format!("number {number:?}"))
        }
        other => other.clone(),
    }
}

/// The original copies a scraped category weight onto a rubric target read
/// from `[Category]` text. Nothing reads it there and [`RubricItem`] has no
/// field for it.
///
/// [`RubricItem`]: crate::grading::RubricItem
fn without_target_weights(rubric: &Value) -> Value {
    let mut rubric = rubric.clone();
    if let Some(targets) = rubric.get_mut("rubricItems").and_then(Value::as_array_mut) {
        for target in targets {
            if let Some(fields) = target.as_object_mut() {
                fields.remove("categoryWeight");
            }
        }
    }
    rubric
}

#[test]
fn matches_the_typescript_implementation() {
    let golden: Golden = serde_json::from_str(include_str!("golden.json")).unwrap();
    let json: Value = serde_json::from_str(include_str!("golden.json")).unwrap();
    let mut report = Report::default();

    for (index, case) in golden.prepare.iter().enumerate() {
        let name = format!("prepare {:?} [{:?}]", case.name, case.mode);
        let text = rubric_text(&case.scraped);
        report.check(&format!("{name} text"), &text, &case.expected.rubric_text);
        let rows = serde_json::to_value(text_to_criteria(&text)).expect("criteria serialize");
        report.check(
            &format!("{name} rows"),
            &same_numbers(&rows),
            &same_numbers(&case.expected.table_rows),
        );
        report.check(
            &format!("{name} weighted text"),
            &with_default_weights(&text, case.mode),
            &case.expected.filled_text,
        );
        report.check_rubric(
            &format!("{name} request"),
            &prepare_for_grading(&case.scraped, case.mode),
            &case.expected.rubric,
            &json["prepare"][index]["expected"]["rubric"],
        );
    }

    for (index, case) in golden.from_text.iter().enumerate() {
        let scraped = &golden.from_text_bases[&case.base];
        report.check_rubric(
            &format!(
                "from text {:?} [{} base, {:?}]",
                case.text, case.base, case.mode
            ),
            &rubric_from_text(scraped, &case.text, case.mode),
            &case.expected,
            &json["fromText"][index]["expected"],
        );
    }

    for case in &golden.default_weights {
        report.check(
            &format!("default weights for {:?} [{:?}]", case.text, case.mode),
            &with_default_weights(&case.text, case.mode),
            &case.expected,
        );
    }

    for case in &golden.model_text {
        report.check(
            &format!("model text in {:?}", case.text),
            &extract_model_text(&case.text),
            &case.expected,
        );
    }

    for case in &golden.text_to_criteria {
        report.check(
            &format!("criteria in {:?}", case.text),
            &text_to_criteria(&case.text),
            &case.expected,
        );
    }

    for (index, case) in golden.criteria.iter().enumerate() {
        let (criteria, expected) = (&case.criteria, &case.expected);
        let name = |what: &str| format!("criteria set {index}: {what}");
        let text = criteria_to_text(criteria);
        report.check(&name("text"), &text, &expected.text);
        report.check(
            &name("reparsed"),
            &text_to_criteria(&text),
            &expected.reparsed,
        );
        report.check(
            &name("validate by category"),
            &validate_weights(criteria, WeightMode::Category),
            &expected.validate_category,
        );
        report.check(
            &name("validate by criterion"),
            &validate_weights(criteria, WeightMode::Criterion),
            &expected.validate_criterion,
        );
        let equal_category = equalize_weights(criteria, WeightMode::Category);
        let equal_criterion = equalize_weights(criteria, WeightMode::Criterion);
        report.check(
            &name("equalize by category"),
            &equal_category,
            &expected.equalize_category,
        );
        report.check(
            &name("equalize by criterion"),
            &equal_criterion,
            &expected.equalize_criterion,
        );
        let filled_category = auto_fill_weights(criteria, WeightMode::Category);
        let filled_criterion = auto_fill_weights(criteria, WeightMode::Criterion);
        report.check(
            &name("fill by category"),
            &filled_category,
            &expected.auto_fill_category,
        );
        report.check(
            &name("fill by criterion"),
            &filled_criterion,
            &expected.auto_fill_criterion,
        );
        report.check(
            &name("filled by category as text"),
            &criteria_to_text(&filled_category),
            &expected.auto_fill_category_text,
        );
        report.check(
            &name("filled by criterion as text"),
            &criteria_to_text(&filled_criterion),
            &expected.auto_fill_criterion_text,
        );
        report.check(
            &name("full credit"),
            &full_credit_points(criteria).into_iter().collect::<Vec<_>>(),
            &expected.full_credit,
        );
        report.check(
            &name("unsaved against own text"),
            &has_unsaved_changes(&format!("  {text}\n"), criteria),
            &expected.unsaved_against_own_text,
        );
        report.check(
            &name("unsaved against other text"),
            &has_unsaved_changes("Something else (1pts)", criteria),
            &expected.unsaved_against_other,
        );
    }

    for case in &golden.allocation {
        report.check(
            &format!("allocation name {:?}", case.name),
            &is_allocation_criterion(&case.name),
            &case.expected,
        );
    }

    assert!(
        report.failures.is_empty(),
        "{} of {} checks differ from the TypeScript:\n\n{}",
        report.failures.len(),
        report.checked,
        report.failures.join("\n\n")
    );
    // A truncated fixture must not pass quietly.
    assert_eq!(
        (
            golden.prepare.len(),
            golden.from_text.len(),
            golden.default_weights.len(),
            golden.model_text.len(),
            golden.text_to_criteria.len(),
            golden.criteria.len(),
            golden.allocation.len(),
        ),
        (78, 254, 206, 103, 103, 30, 20)
    );
}

/// The section of a batch prompt that starts with `heading`, up to the next
/// blank line.
fn section<'a>(prompt: &'a str, heading: &str) -> &'a str {
    let Some(start) = prompt.find(heading) else {
        return "";
    };
    let section = &prompt[start..];
    &section[..section.find("\n\n").unwrap_or(section.len())]
}

#[test]
fn real_rubric_gets_equal_weights_keyed_by_the_scraped_category_names() {
    let scraped = real_rubric();
    let prepared = prepare_for_grading(&scraped, DEFAULT_WEIGHT_MODE);

    assert_eq!(prepared.weight_mode, Some(WeightMode::Category));
    let weights: Vec<_> = prepared
        .category_weights
        .as_ref()
        .expect("category weights are sent")
        .iter()
        .map(|(category, weight)| (category, *weight))
        .collect();
    // Every requirement is worth 0 points in the text, so the points in the
    // category names do not reach the weights.
    assert_eq!(
        weights,
        [
            ("Check the Conditions(4 pts)", 25.0),
            ("Name the Parameters(2 pts)", 25.0),
            ("State and Compute(4 pts)", 25.0),
            ("Interpret(4 pts)", 25.0),
        ]
    );
    assert_eq!(prepared.criterion_weights, None);
    assert_eq!(prepared.custom_instructions, None);
    assert_eq!(prepared.max_score_value(), 14.0);
    assert_eq!(prepared.model_text, scraped.model_text);
    assert_eq!(prepared.essay_prompt, scraped.essay_prompt);
    assert!(prepared.rubric_items.is_empty());

    assert_eq!(prepared.checklist_items.len(), 4);
    for (item, original) in prepared
        .checklist_items
        .iter()
        .zip(&scraped.checklist_items)
    {
        assert_eq!(item.category, original.category);
        assert_eq!(item.items, original.items);
        assert_eq!(item.category_weight, Some(25.0));
        assert_eq!(item.points, None);
        assert_eq!(item.criterion_weight, None);
    }
    // With no points on the checklist there are no category maximums either.
    let weighting = prepared.category_weighting().expect("weights are present");
    assert_eq!(weighting.max_points, None);
}

#[test]
fn real_rubric_text_gains_weight_headers_and_loses_the_model_response() {
    let text = rubric_text(&real_rubric());
    assert!(text.starts_with(
        "## Check the Conditions(4 pts)\nSay there is a fixed number of trials, and how many. (0pts)\n"
    ));
    assert!(text.ends_with("\n\n--- Model Response ---\nX ~ B(20, 0.7). P(X >= 16) = 0.2375."));

    let weighted = with_default_weights(&text, DEFAULT_WEIGHT_MODE);
    assert_eq!(
        weighted,
        "## Check the Conditions(4 pts) [25%]\n\
         Say there is a fixed number of trials, and how many. (0pts)\n\
         Say each trial has two outcomes, success or failure. (0pts)\n\
         Say the chance of success is the same on each trial and the trials are independent. (0pts)\n\
         ## Name the Parameters(2 pts) [25%]\n\
         Say what one trial is and what counts as a success. (0pts)\n\
         Give the values of n and p, and write X ~ B(n, p). (0pts)\n\
         ## State and Compute(4 pts) [25%]\n\
         Write the probability asked for with the correct inequality, for example P(X >= k). (0pts)\n\
         Give the value, using a calculator. (0pts)\n\
         ## Interpret(4 pts) [25%]\n\
         Say what the probability means for this situation, in a sentence. (0pts)\n\
         Find the mean np and say whether the outcome is unusual. (0pts)"
    );
    // Already weighted: a second pass changes nothing.
    assert_eq!(
        with_default_weights(&weighted, DEFAULT_WEIGHT_MODE),
        weighted
    );
}

#[test]
fn real_rubric_batch_prompt_lists_the_weights() {
    let scraped = real_rubric();
    let students = [StudentWork {
        index: 0,
        name: "Avery, Sam".to_owned(),
        response: "There are 20 trials.".to_owned(),
        prompt: None,
    }];

    let prepared = prepare_for_grading(&scraped, DEFAULT_WEIGHT_MODE);
    let prompt = build_batch_prompt(
        &prepared,
        &students,
        &generate_scoring_anchors(&prepared),
        None,
        None,
    )
    .expect("every category is named");
    assert_eq!(
        section(&prompt, "CATEGORY WEIGHTS"),
        "CATEGORY WEIGHTS (percentage of total grade):\n\
         - Check the Conditions(4 pts): 25% of total grade\n\
         - Name the Parameters(2 pts): 25% of total grade\n\
         - State and Compute(4 pts): 25% of total grade\n\
         - Interpret(4 pts): 25% of total grade\n\
         Grade each category on its own merits. These weights will be applied automatically."
    );
    assert_eq!(
        section(&prompt, "SCORING BY CATEGORY"),
        "SCORING BY CATEGORY (score each 0-10, server applies weights automatically):\n\
         - Check the Conditions(4 pts): 10 points\n\
         - Name the Parameters(2 pts): 10 points\n\
         - State and Compute(4 pts): 10 points\n\
         - Interpret(4 pts): 10 points"
    );

    // The scraped rubric sent as it is has no weights section, and that is
    // the only difference between the two prompts.
    let unprepared = build_batch_prompt(
        &scraped,
        &students,
        &generate_scoring_anchors(&scraped),
        None,
        None,
    )
    .expect("every category is named");
    assert_eq!(section(&unprepared, "CATEGORY WEIGHTS"), "");
    let weights_section = format!("\n{}\n", section(&prompt, "CATEGORY WEIGHTS"));
    assert_eq!(prompt.replacen(&weights_section, "", 1), unprepared);
}

#[test]
fn criterion_mode_spreads_weights_over_every_requirement() {
    let prepared = prepare_for_grading(&real_rubric(), WeightMode::Criterion);
    assert_eq!(prepared.weight_mode, Some(WeightMode::Criterion));
    assert_eq!(prepared.category_weights, None);
    let weights = prepared
        .criterion_weights
        .expect("criterion weights are sent");
    let per_category: Vec<(&str, Vec<f64>)> = weights
        .iter()
        .map(|(category, criteria)| (category, criteria.iter().map(|(_, w)| *w).collect()))
        .collect();
    // Nine requirements share 100% across the whole rubric, not per category.
    assert_eq!(
        per_category,
        [
            ("Check the Conditions(4 pts)", vec![11.2, 11.1, 11.1]),
            ("Name the Parameters(2 pts)", vec![11.1, 11.1]),
            ("State and Compute(4 pts)", vec![11.1, 11.1]),
            ("Interpret(4 pts)", vec![11.1, 11.1]),
        ]
    );
    assert!(
        prepared
            .checklist_items
            .iter()
            .all(|item| item.category_weight.is_none())
    );
}

/// The original's weights for this rubric never take part in the score. They
/// are keyed by the category as scraped, "Interpret(4 pts)", while the prompt
/// asks the AI to report each category without its points, "Interpret", and
/// the parser looks the reported name up as it is.
#[test]
fn real_rubric_weights_do_not_match_the_names_the_ai_reports() {
    let prepared = prepare_for_grading(&real_rubric(), DEFAULT_WEIGHT_MODE);
    let students = [StudentWork {
        index: 0,
        name: "Avery, Sam".to_owned(),
        response: "There are 20 trials.".to_owned(),
        prompt: None,
    }];
    let prompt = build_batch_prompt(
        &prepared,
        &students,
        &generate_scoring_anchors(&prepared),
        None,
        None,
    )
    .expect("every category is named");
    assert!(prompt.contains(
        r#""criterion_scores": {"Check the Conditions": <0-10>, "Name the Parameters": <0-10>, "State and Compute": <0-10>, "Interpret": <0-10>}"#
    ));

    let weighting = prepared.category_weighting().expect("weights are present");
    assert_eq!(weighting.weights.get("Interpret"), None);
    assert_eq!(weighting.weights.get("Interpret(4 pts)"), Some(&25.0));

    let feedback = "<p>Hi Sam,</p><p><strong>Give the values of n and p.</strong></p><blockquote>You did not address this.</blockquote><p>Incorrect: n and p are missing.</p><p><em>To improve: state n = 20 and p = 0.7.</em></p>";
    let score_for = |names: [&str; 4]| {
        let ai = format!(
            r#"[{{"studentIndex": 0, "criterion_scores": {{"{}": 10, "{}": 0, "{}": 10, "{}": 10}}, "score": 9, "feedback": "{feedback}"}}]"#,
            names[0], names[1], names[2], names[3]
        );
        parse_batch_response(&ai, &students, prepared.max_score_value(), Some(&weighting))
            .expect("the response parses")[0]
            .score
    };
    // Names as the prompt asks for them: the weights are skipped and the
    // AI's own total is used, 9 of 10 on a 14-point question.
    assert_eq!(
        score_for([
            "Check the Conditions",
            "Name the Parameters",
            "State and Compute",
            "Interpret"
        ]),
        12.5
    );
    // Only if the AI copies the scraped names do the weights apply: three of
    // four equal categories.
    assert_eq!(
        score_for([
            "Check the Conditions(4 pts)",
            "Name the Parameters(2 pts)",
            "State and Compute(4 pts)",
            "Interpret(4 pts)",
        ]),
        10.5
    );
}
