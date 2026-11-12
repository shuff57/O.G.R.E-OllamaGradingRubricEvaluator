//! Rubric criteria and the text form the teacher edits. A port of the
//! desktop's `lib/rubric-utils.ts`.
//!
//! One criterion per line, optionally under category headers:
//!
//! ```text
//! ## Category Name [40%]
//! Criterion Name (10pts, 25%): Description
//! ```
//!
//! Two other layouts are recognised when read: checkbox rows
//! (`Category<TAB>☐ Criterion`) and indented rows (`Category<TAB>` followed by
//! lines that start with a space).

use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::grading::WeightMode;
use crate::grading::js::{self, Num, WS};

/// Where the rubric text stops and the exemplar answer starts.
pub(super) const MODEL_RESPONSE_MARKER: &str = "--- Model Response ---";

/// JavaScript's `.`: anything but a line terminator.
const DOT: &str = r"[^\n\r\x{2028}\x{2029}]";
/// The characters at which JavaScript's `^` and `$` match in multiline mode.
const LINE_END: &str = r"[\n\r\x{2028}\x{2029}]";
const NUMBER: &str = r"[0-9]+(?:\.[0-9]+)?";

pub(super) fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("built-in pattern is valid")
}

/// JavaScript's `\S`.
fn non_whitespace() -> String {
    format!("[^{}", &WS[1..])
}

/// One line of a rubric.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RubricCriterion {
    /// The criterion's name.
    pub criteria: String,
    pub description: String,
    pub points: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// The category's percentage of the total grade, repeated on each of its
    /// criteria.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub criterion_weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_type: Option<RowType>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RowType {
    Checklist,
    /// A "Full (2pts)" / "Partial (1pts)" row that says how a criterion's
    /// points are awarded.
    Allocation,
}

/// The outcome of [`validate_weights`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeightValidation {
    pub valid: bool,
    /// The weights' total rounded to one decimal. Absent for an empty rubric.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sum: Option<f64>,
    pub errors: Vec<String>,
}

/// The original compares the mode with `'category'` and treats every other
/// value as criterion mode.
fn by_category(mode: WeightMode) -> bool {
    mode == WeightMode::Category
}

/// Whether a criterion name is an allocation row: "Full (2pts)",
/// "Partial (1pts): ...", "Minimal (1pts)", "Missing (0pts)". "Full Credit
/// (2pts)" is not one.
pub fn is_allocation_criterion(name: &str) -> bool {
    static ALLOCATION: LazyLock<Regex> = LazyLock::new(|| {
        pattern(&format!(
            r"^(?i-u:Full|Partial|Minimal|Missing){WS}*\([0-9]"
        ))
    });
    ALLOCATION.is_match(name)
}

/// For each criterion that is followed by allocation rows, its index and the
/// points of its "Full" row.
pub fn full_credit_points(criteria: &[RubricCriterion]) -> BTreeMap<usize, f64> {
    static FULL: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r"^(?i-u:Full){WS}*\(")));

    let mut result = BTreeMap::new();
    for (i, criterion) in criteria.iter().enumerate() {
        if is_allocation_criterion(&criterion.criteria) {
            continue;
        }
        for row in &criteria[i + 1..] {
            if !is_allocation_criterion(&row.criteria) {
                break;
            }
            if FULL.is_match(&row.criteria) {
                result.insert(i, row.points);
                break;
            }
        }
    }
    result
}

/// Writes criteria as text, one per line, with a `## Category` header before
/// the first criterion of each run of a category.
pub fn criteria_to_text(criteria: &[RubricCriterion]) -> String {
    let mut lines = Vec::with_capacity(criteria.len());
    let mut last_category = None;

    for criterion in criteria {
        if let Some(category) = criterion.category.as_deref()
            && last_category != Some(category)
        {
            let weight = criterion
                .category_weight
                .map(|weight| format!(" [{}%]", Num(weight)))
                .unwrap_or_default();
            lines.push(format!("## {category}{weight}"));
            last_category = Some(category);
        }

        let weight = criterion
            .criterion_weight
            .map(|weight| format!(", {}%", Num(weight)))
            .unwrap_or_default();
        let points = Num(criterion.points);
        let name = Some(js::trim(&criterion.criteria))
            .filter(|name| !name.is_empty())
            .unwrap_or("Unnamed");
        let description = js::trim(&criterion.description);
        lines.push(if description.is_empty() {
            format!("{name} ({points}pts{weight})")
        } else {
            format!("{name} ({points}pts{weight}): {description}")
        });
    }

    lines.join("\n")
}

/// `Name (10pts, 25%): Description`.
static LINE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"^({DOT}+?){WS}*\(({NUMBER}){WS}*(?i-u:pts?)(?:,{WS}*({NUMBER})%{WS}*)?\){WS}*(?::{WS}*({DOT}*))?$"
    ))
});
/// `## Category Name [40%]`.
static CATEGORY: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"^##{WS}+({DOT}+?)(?:{WS}*\[({NUMBER})%\])?{WS}*$"
    ))
});

/// True when `text` is laid out one criterion per line, which is the layout
/// in which a line can be told apart from its neighbours. The checkbox and
/// indented layouts are read as tables instead.
pub(super) fn is_line_layout(text: &str) -> bool {
    let text = match text.find(MODEL_RESPONSE_MARKER) {
        Some(marker) => &text[..marker],
        None => text,
    };
    !text.contains("\t\u{2610}") && !is_indented_category_format(text)
}

/// True when a trimmed line of rubric text is a category header or a
/// criterion that [`text_to_criteria`] reads.
pub(super) fn is_rubric_line(line: &str) -> bool {
    CATEGORY.is_match(line) || LINE.is_match(line)
}

/// The requirements part of rubric text and the rest, which starts at the
/// model response marker.
fn split_at_model_response(text: &str) -> (&str, &str) {
    text.split_at(text.find(MODEL_RESPONSE_MARKER).unwrap_or(text.len()))
}

/// Rubric text for a teacher to read: a criterion worth no points and with
/// no weight is shown as its name alone, without "(0pts)".
///
/// A name that would itself read as a heading or a criterion keeps its
/// "(0pts)", so [`pointed_lines`] gives back what this was given.
pub(super) fn plain_lines(text: &str) -> String {
    if !is_line_layout(text) {
        return text.to_owned();
    }
    let (body, rest) = split_at_model_response(text);
    let lines: Vec<String> = body
        .split('\n')
        .map(|raw| {
            let line = js::trim(raw);
            let Some(parts) = LINE.captures(line) else {
                return raw.to_owned();
            };
            let worth_nothing = js::parse_float(&parts[2]) == 0.0 && parts.get(3).is_none();
            let name = js::trim(&parts[1]);
            let plain = match parts.get(4).map(|d| js::trim(d.as_str())) {
                Some(description) if !description.is_empty() => format!("{name}: {description}"),
                _ => name.to_owned(),
            };
            if worth_nothing && !name.is_empty() && !is_rubric_line(&plain) {
                plain
            } else {
                raw.to_owned()
            }
        })
        .collect();
    lines.join("\n") + rest
}

/// The reverse of [`plain_lines`], for text a teacher has typed: a line that
/// is neither a heading nor a criterion becomes a criterion worth no points,
/// so that every line they wrote is graded against.
///
/// Text in the older `[Category]` and `- item` layout is left as it is.
pub(super) fn pointed_lines(text: &str) -> String {
    if !is_line_layout(text) {
        return text.to_owned();
    }
    let (body, rest) = split_at_model_response(text);
    let trimmed = || body.split('\n').map(js::trim);
    let bracketed = trimmed().any(|line| line.starts_with('[') && line.ends_with(']'));
    if bracketed && !trimmed().any(is_rubric_line) {
        return text.to_owned();
    }
    let lines: Vec<String> = body
        .split('\n')
        .map(|raw| {
            let line = js::trim(raw);
            if line.is_empty() || is_rubric_line(line) {
                raw.to_owned()
            } else {
                format!("{line} (0pts)")
            }
        })
        .collect();
    lines.join("\n") + rest
}

/// The category a heading line names. `line` is trimmed already.
fn heading_category(line: &str) -> Option<&str> {
    let parts = CATEGORY.captures(line)?;
    Some(js::trim(parts.get(1)?.as_str()))
}

/// Rubric text with the weight in every heading of the categories in
/// `weights` replaced. Other lines, and the exemplar answer, stay as they
/// are. Text that is not one criterion per line is returned unchanged.
pub(super) fn reweighted_headings(text: &str, weights: &[(String, f64)]) -> String {
    rewritten_headings(text, |category| {
        let (name, weight) = weights.iter().find(|(name, _)| name == category)?;
        Some(format!("## {name} [{}%]", Num(*weight)))
    })
}

/// Rubric text with the weight taken out of every heading.
pub(super) fn unweighted_headings(text: &str) -> String {
    rewritten_headings(text, |category| Some(format!("## {category}")))
}

/// Rubric text with each heading replaced by what `rewrite` gives for its
/// category, where it gives anything.
fn rewritten_headings(text: &str, rewrite: impl Fn(&str) -> Option<String>) -> String {
    if !is_line_layout(text) {
        return text.to_owned();
    }
    let (body, rest) = split_at_model_response(text);
    let lines: Vec<String> = body
        .split('\n')
        .map(|raw| {
            heading_category(js::trim(raw))
                .and_then(&rewrite)
                .unwrap_or_else(|| raw.to_owned())
        })
        .collect();
    lines.join("\n") + rest
}

/// Reads rubric text back into criteria. Lines that are not criteria are
/// skipped, and so is everything from the model response marker on.
pub fn text_to_criteria(text: &str) -> Vec<RubricCriterion> {
    let text = match text.find(MODEL_RESPONSE_MARKER) {
        Some(marker) => &text[..marker],
        None => text,
    };
    if text.contains("\t\u{2610}") {
        return parse_checkbox_format(text);
    }
    if is_indented_category_format(text) {
        return parse_indented_category_format(text);
    }

    let mut results = Vec::new();
    let mut category: Option<String> = None;
    let mut category_weight = None;

    for raw in text.split('\n') {
        let line = js::trim(raw);
        if line.is_empty() {
            continue;
        }
        if let Some(header) = CATEGORY.captures(line) {
            category = Some(js::trim(&header[1]).to_owned());
            category_weight = header.get(2).map(|weight| js::parse_float(weight.as_str()));
            continue;
        }
        let Some(parts) = LINE.captures(line) else {
            continue;
        };
        let name = js::trim(&parts[1]);
        if name.is_empty() {
            continue;
        }
        results.push(RubricCriterion {
            criteria: name.to_owned(),
            description: parts
                .get(4)
                .map_or("", |description| js::trim(description.as_str()))
                .to_owned(),
            points: js::or_number(js::parse_float(&parts[2]), 0.0),
            question: None,
            category: category.clone(),
            category_weight,
            criterion_weight: parts.get(3).map(|weight| js::parse_float(weight.as_str())),
            // The original tests the whole line here, not the name.
            row_type: is_allocation_criterion(line).then_some(RowType::Allocation),
        });
    }

    dedup_criteria(results)
}

/// Drops criteria that repeat an earlier one's category and name, ignoring
/// case.
fn dedup_criteria(criteria: Vec<RubricCriterion>) -> Vec<RubricCriterion> {
    let mut seen = HashSet::new();
    criteria
        .into_iter()
        .filter(|criterion| {
            seen.insert(format!(
                "{}|{}",
                criterion.category.as_deref().unwrap_or("").to_lowercase(),
                criterion.criteria.to_lowercase()
            ))
        })
        .collect()
}

/// A criterion as the checkbox and indented layouts give it: no points, no
/// description.
fn bare_criterion(name: &str, category: Option<String>) -> RubricCriterion {
    RubricCriterion {
        criteria: name.to_owned(),
        category,
        row_type: is_allocation_criterion(name).then_some(RowType::Allocation),
        ..RubricCriterion::default()
    }
}

/// `Category<TAB>☐ Criterion`, with `☐ Criterion` lines continuing the
/// category above.
fn parse_checkbox_format(text: &str) -> Vec<RubricCriterion> {
    static TAB_LINE: LazyLock<Regex> =
        LazyLock::new(|| pattern(&format!("^({DOT}+?)\t\u{2610}{WS}*({DOT}+)$")));
    static CHECKBOX: LazyLock<Regex> =
        LazyLock::new(|| pattern(&format!("^\u{2610}{WS}*({DOT}+)$")));

    let mut results = Vec::new();
    let mut category: Option<String> = None;

    for raw in text.split('\n') {
        let line = js::trim(raw);
        if line.is_empty() {
            continue;
        }
        if let Some(parts) = TAB_LINE.captures(line) {
            let current = js::trim(&parts[1]).to_owned();
            let name = js::trim(&parts[2]);
            if !name.is_empty() {
                // An empty category name is left off here but kept by the
                // continuation lines below, as in the original.
                let own = Some(current.clone()).filter(|category| !category.is_empty());
                results.push(bare_criterion(name, own));
            }
            category = Some(current);
            continue;
        }
        if let Some(parts) = CHECKBOX.captures(line) {
            let name = js::trim(&parts[1]);
            if !name.is_empty() {
                results.push(bare_criterion(name, category.clone()));
            }
        }
    }

    dedup_criteria(results)
}

/// A line that is a category name followed by a bare tab, and a line that
/// starts with a space or tab, both somewhere in the text.
fn is_indented_category_format(text: &str) -> bool {
    static HEADER: LazyLock<Regex> =
        LazyLock::new(|| pattern(&format!(r"(?:^|{LINE_END})[^\t\n]+\t{WS}*(?:$|{LINE_END})")));
    static INDENTED: LazyLock<Regex> =
        LazyLock::new(|| pattern(&format!(r"(?:^|{LINE_END})[ \t]+{}", non_whitespace())));
    HEADER.is_match(text) && INDENTED.is_match(text)
}

/// `Category<TAB>` lines, each followed by indented criterion lines.
fn parse_indented_category_format(text: &str) -> Vec<RubricCriterion> {
    static HEADER: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r"^([^\t]+)\t{WS}*$")));
    static INDENTED: LazyLock<Regex> = LazyLock::new(|| {
        let non_ws = non_whitespace();
        pattern(&format!(r"^[ \t]+({non_ws}{DOT}*{non_ws}|{non_ws})$"))
    });

    let mut results = Vec::new();
    let mut category: Option<String> = None;

    // Lines are not trimmed: the leading whitespace is what marks a criterion.
    for raw in text.split('\n') {
        if js::trim(raw).is_empty() {
            continue;
        }
        if let Some(header) = HEADER.captures(raw) {
            category = Some(js::trim(&header[1]).to_owned());
            continue;
        }
        if let Some(parts) = INDENTED.captures(raw) {
            let name = js::trim(&parts[1]);
            if !name.is_empty() {
                results.push(bare_criterion(name, category.clone()));
            }
        }
    }

    dedup_criteria(results)
}

/// Whether the text differs from the saved criteria, ignoring surrounding
/// whitespace.
pub fn has_unsaved_changes(text: &str, original: &[RubricCriterion]) -> bool {
    js::trim(text) != js::trim(&criteria_to_text(original))
}

/// Checks that the weights add up to 100%, give or take half a percent.
///
/// By category, one weight is counted per category: its first criterion's.
/// By criterion, every criterion's weight is counted, across all categories.
pub fn validate_weights(criteria: &[RubricCriterion], mode: WeightMode) -> WeightValidation {
    const TOLERANCE: f64 = 0.5;

    if criteria.is_empty() {
        return WeightValidation {
            valid: true,
            sum: None,
            errors: Vec::new(),
        };
    }

    let (sum, label) = if by_category(mode) {
        // A criterion with no category and one whose category is "" are
        // different groups here.
        let mut seen: Vec<Option<&str>> = Vec::new();
        let mut sum = 0.0;
        for criterion in criteria {
            let key = criterion.category.as_deref();
            if !seen.contains(&key) {
                seen.push(key);
                sum += criterion.category_weight.unwrap_or(0.0);
            }
        }
        (sum, "Category")
    } else {
        let sum = criteria.iter().fold(0.0, |sum, criterion| {
            sum + criterion.criterion_weight.unwrap_or(0.0)
        });
        (sum, "Criteria")
    };

    let rounded = js::round_to(sum, 10.0);
    let valid = (sum - 100.0).abs() <= TOLERANCE;
    WeightValidation {
        valid,
        sum: Some(rounded),
        errors: if valid {
            Vec::new()
        } else {
            vec![format!(
                "{label} weights sum to {}%, must be 100%",
                Num(rounded)
            )]
        },
    }
}

/// The distinct categories in order of first appearance. Criteria without a
/// category share the name "".
fn categories(criteria: &[RubricCriterion]) -> Vec<&str> {
    let mut categories = Vec::new();
    for criterion in criteria {
        let category = criterion.category.as_deref().unwrap_or("");
        if !categories.contains(&category) {
            categories.push(category);
        }
    }
    categories
}

fn set_category_weights(result: &mut [RubricCriterion], categories: &[&str], weights: &[f64]) {
    for criterion in result {
        let category = criterion.category.as_deref().unwrap_or("");
        criterion.category_weight = Some(
            categories
                .iter()
                .position(|name| *name == category)
                .map_or(0.0, |at| weights[at]),
        );
    }
}

/// Gives every category, or every criterion, the same weight. Weights have
/// one decimal; the first takes what rounding leaves over.
pub fn equalize_weights(criteria: &[RubricCriterion], mode: WeightMode) -> Vec<RubricCriterion> {
    let mut result = criteria.to_vec();
    if criteria.is_empty() {
        return result;
    }

    let equal_shares = |count: usize| {
        let count = count as f64;
        let base = (100.0 / count * 10.0).floor() / 10.0;
        let remainder = js::round((100.0 - base * count) * 10.0) / 10.0;
        (base + remainder, base)
    };

    if by_category(mode) {
        let categories = categories(criteria);
        let (first, rest) = equal_shares(categories.len());
        let weights: Vec<f64> = (0..categories.len())
            .map(|i| if i == 0 { first } else { rest })
            .collect();
        set_category_weights(&mut result, &categories, &weights);
    } else {
        let (first, rest) = equal_shares(criteria.len());
        for (i, criterion) in result.iter_mut().enumerate() {
            criterion.criterion_weight = Some(if i == 0 { first } else { rest });
        }
    }
    result
}

/// Each share of `total` as a percentage with one decimal. The last takes
/// whatever is left of 100, which rounding can push below zero.
fn proportional_shares(points: &[f64], total: f64) -> Vec<f64> {
    let mut allocated = 0.0;
    let last = points.len().saturating_sub(1);
    points
        .iter()
        .enumerate()
        .map(|(i, points)| {
            if i == last {
                js::round((100.0 - allocated) * 10.0) / 10.0
            } else {
                let weight = js::round((points / total) * 1000.0) / 10.0;
                allocated += weight;
                weight
            }
        })
        .collect()
}

/// Sets weights in proportion to points: each category's total by category,
/// each criterion's own otherwise. Falls back to equal weights when there
/// are no points.
pub fn auto_fill_weights(criteria: &[RubricCriterion], mode: WeightMode) -> Vec<RubricCriterion> {
    let mut result = criteria.to_vec();
    if criteria.is_empty() {
        return result;
    }

    if by_category(mode) {
        let categories = categories(criteria);
        let mut points = vec![0.0; categories.len()];
        for criterion in criteria {
            let category = criterion.category.as_deref().unwrap_or("");
            if let Some(at) = categories.iter().position(|name| *name == category) {
                points[at] += criterion.points;
            }
        }
        let total = points.iter().fold(0.0, |sum, points| sum + points);
        if total == 0.0 {
            return equalize_weights(criteria, mode);
        }
        let weights = proportional_shares(&points, total);
        set_category_weights(&mut result, &categories, &weights);
    } else {
        let points: Vec<f64> = criteria.iter().map(|criterion| criterion.points).collect();
        let total = points.iter().fold(0.0, |sum, points| sum + points);
        if total == 0.0 {
            return equalize_weights(criteria, mode);
        }
        let weights = proportional_shares(&points, total);
        for (criterion, weight) in result.iter_mut().zip(weights) {
            criterion.criterion_weight = Some(weight);
        }
    }
    result
}
