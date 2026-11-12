//! From a scraped rubric to the rubric that is graded against.
//!
//! The desktop app never sends a scraped rubric as it is. It turns it into
//! text for the teacher to review (`formatRubricForDisplay` in
//! `components/grading/batch/format.ts`), its rubric card fills in weights if
//! the text has none (`RubricCard.svelte`), and when grading starts the text
//! is parsed back into a rubric (`buildRubricFromText` and the request built
//! in `BatchProgress.svelte`). This module is those three steps.

use std::sync::LazyLock;

use regex::Regex;

use super::criteria::{
    MODEL_RESPONSE_MARKER, RowType, RubricCriterion, WEIGHT_TOLERANCE, auto_fill_weights,
    criteria_to_text, equalize_weights, is_line_layout, is_rubric_line, pattern, plain_lines,
    pointed_lines, reweighted_headings, text_to_criteria, unweighted_headings,
};
use crate::grading::js::{self, WS};
use crate::grading::{
    ChecklistItem, MaxScore, OrderedMap, Rubric, RubricItem, WeightMap, WeightMode,
};

/// The weight mode the desktop starts in.
pub const DEFAULT_WEIGHT_MODE: WeightMode = WeightMode::Category;

const NO_RUBRIC_TEXT: &str = "(No rubric data found on page)";
const DEFAULT_MAX_SCORE: &str = "10";

/// How often the weight fill may rewrite the text before it is taken as it
/// is. Filled weights are found by the next pass, so the text settles after
/// one pass, or two when a criterion's points are too large for a number and
/// its line reads differently once rewritten. The limit is a backstop.
const MAX_FILL_PASSES: usize = 16;

/// "(4 pts)" in a category name.
static POINT_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"\(([0-9]+(?:\.[0-9]+)?){WS}*(?i-u:pts?)\)")));

/// The rubric that the desktop app sends for grading when the teacher scrapes
/// a page and starts grading without editing anything.
///
/// The result carries the weight mode and, when the rubric text ends up with
/// weights, `category_weights` or `criterion_weights`. Its checklist is
/// regrouped from the text and has no `points`. `custom_instructions` is left
/// empty: the desktop sends those beside the rubric, not in it.
pub fn prepare_for_grading(scraped: &Rubric, mode: WeightMode) -> Rubric {
    let text = with_default_weights(&rubric_text(scraped), mode);
    rubric_from_text(scraped, &text, mode)
}

/// The rubric as text for the teacher to review, before any weights are
/// filled in.
///
/// The checklist is used when it has requirements; otherwise the rubric
/// targets are, without their "(N pts)" rows and "Target:" detail. Categories
/// get a weight only when rubric targets name their points and a category's
/// name matches. The exemplar answer follows a model response marker.
pub fn rubric_text(scraped: &Rubric) -> String {
    let criteria = scraped_criteria(scraped);
    if criteria.is_empty() {
        return NO_RUBRIC_TEXT.to_owned();
    }
    let mut text = criteria_to_text(&criteria);
    if let Some(model_text) = scraped.model_text.as_deref().filter(|t| !t.is_empty()) {
        text += &format!("\n\n{MODEL_RESPONSE_MARKER}\n{model_text}");
    }
    text
}

/// The scraped rows as criteria worth no points each.
fn scraped_criteria(scraped: &Rubric) -> Vec<RubricCriterion> {
    let weights = target_point_weights(&scraped.rubric_items);
    let has_checklist = scraped
        .checklist_items
        .iter()
        .any(|item| !item.items.is_empty());

    let rows: Vec<(Option<String>, Vec<String>)> = if has_checklist {
        scraped
            .checklist_items
            .iter()
            .map(|item| {
                let items = item.items.iter().map(|text| js::trim(text).to_owned());
                (item.category.clone(), unique_non_empty(items))
            })
            .collect()
    } else {
        target_rows(&scraped.rubric_items)
    };
    let row_type = if has_checklist || !scraped.rubric_items.is_empty() {
        RowType::Allocation
    } else {
        RowType::Checklist
    };

    let mut criteria = Vec::new();
    for (category, items) in rows {
        let category = category
            .map(|category| js::trim(&category).to_owned())
            .filter(|category| !category.is_empty());
        let category_weight = category.as_deref().and_then(|category| {
            let weights = weights.as_ref()?;
            weights
                .iter()
                .find(|(name, _)| name == category)
                .map(|(_, weight)| *weight)
        });
        for item in items {
            let name = js::trim(&item);
            if name.is_empty() {
                continue;
            }
            criteria.push(RubricCriterion {
                criteria: name.to_owned(),
                category: category.clone(),
                category_weight,
                row_type: Some(row_type),
                ..RubricCriterion::default()
            });
        }
    }
    criteria
}

/// Percentage weights from the rubric targets whose category names carry
/// points, keyed by the name without the points. `None` when no target names
/// points or they total zero.
fn target_point_weights(targets: &[RubricItem]) -> Option<Vec<(String, f64)>> {
    let mut points: Vec<(String, f64)> = Vec::new();
    for target in targets {
        let Some(category) = target.category.as_deref() else {
            continue;
        };
        let Some(suffix) = POINT_SUFFIX.captures(category) else {
            continue;
        };
        let name = js::trim(&POINT_SUFFIX.replace(category, "")).to_owned();
        if !points.iter().any(|(seen, _)| *seen == name) {
            points.push((name, js::parse_float(&suffix[1])));
        }
    }

    let total = points.iter().fold(0.0, |sum, (_, points)| sum + points);
    let has_points = total > 0.0;
    if !has_points {
        return None;
    }
    let last = points.len() - 1;
    let mut assigned = 0.0;
    Some(
        points
            .into_iter()
            .enumerate()
            .map(|(i, (name, points))| {
                let percent = if i == last {
                    js::round((100.0 - assigned) * 10.0) / 10.0
                } else {
                    js::round((points / total) * 1000.0) / 10.0
                };
                assigned += percent;
                (name, percent)
            })
            .collect(),
    )
}

/// The rubric targets to show when there is no checklist: the rows whose
/// category has no "(N pts)", or every row with that suffix removed when all
/// have one. A "Target:" label and anything after a line starting with one
/// are scoring detail and are dropped.
fn target_rows(targets: &[RubricItem]) -> Vec<(Option<String>, Vec<String>)> {
    static TARGET_DETAIL: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r"\n{WS}*Target:")));
    static TARGET_LABEL: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r"^Target:{WS}*")));

    let has_points = |target: &&RubricItem| {
        target
            .category
            .as_deref()
            .is_some_and(|category| POINT_SUFFIX.is_match(category))
    };
    let short_rows: Vec<&RubricItem> = targets.iter().filter(|t| !has_points(t)).collect();
    let strip_points = short_rows.is_empty();
    let rows = if strip_points {
        targets.iter().collect()
    } else {
        short_rows
    };

    rows.into_iter()
        .map(|target| {
            let category = target.category.as_deref().map(|category| {
                if strip_points {
                    js::trim(&POINT_SUFFIX.replace(category, "")).to_owned()
                } else {
                    category.to_owned()
                }
            });
            let items = target.items.iter().map(|item| {
                let mut text = js::trim(item);
                if let Some(detail) = TARGET_DETAIL.find(text) {
                    text = js::trim(&text[..detail.start()]);
                }
                if let Some(label) = TARGET_LABEL.find(text) {
                    text = &text[label.end()..];
                }
                unquote(text).to_owned()
            });
            (category, unique_non_empty(items))
        })
        .collect()
}

/// The text without its surrounding double quotes, if it is one quoted line.
fn unquote(text: &str) -> &str {
    text.strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
        .filter(|inner| !inner.contains(['\n', '\r', '\u{2028}', '\u{2029}']))
        .unwrap_or(text)
}

fn unique_non_empty(items: impl Iterator<Item = String>) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for item in items {
        if !item.is_empty() && !unique.contains(&item) {
            unique.push(item);
        }
    }
    unique
}

/// The rubric text as the desktop's rubric card leaves it: if no criterion
/// has a weight for `mode`, weights are filled in from the criteria's points,
/// or equally when there are no points, and the text is rewritten from the
/// criteria. Text that already has weights, or holds no criteria, is returned
/// unchanged.
///
/// Rewriting drops the model response section and anything else that is not
/// a criterion; [`rubric_from_text`] takes the exemplar answer from the
/// scraped rubric when the text has none.
pub fn with_default_weights(text: &str, mode: WeightMode) -> String {
    let mut text = text.to_owned();
    // The card runs this as an effect that fires again whenever it changed
    // the text, so it is repeated until the text stays the same.
    for _ in 0..MAX_FILL_PASSES {
        match fill_missing_weights(&text, mode) {
            Some(filled) if filled != text => text = filled,
            _ => break,
        }
    }
    text
}

/// One run of the rubric card's weight effect. `None` when it leaves the text
/// alone.
fn fill_missing_weights(text: &str, mode: WeightMode) -> Option<String> {
    let by_category = mode == WeightMode::Category;
    let rows = text_to_criteria(text);
    if rows.is_empty() {
        return None;
    }
    let weight = |row: &RubricCriterion| {
        if by_category {
            row.category_weight
        } else {
            row.criterion_weight
        }
    };
    if rows.iter().any(|row| weight(row).unwrap_or(0.0) != 0.0) {
        return None;
    }

    // Weights left over from the other mode would otherwise stay in the text.
    let cleared: Vec<RubricCriterion> = rows
        .into_iter()
        .map(|mut row| {
            if by_category {
                row.criterion_weight = None;
            } else {
                row.category_weight = None;
            }
            row
        })
        .collect();
    Some(criteria_to_text(&auto_fill_weights(&cleared, mode)))
}

/// The exemplar answer in rubric text: what follows the model response
/// marker, up to the next line that starts with `---`.
pub fn extract_model_text(text: &str) -> Option<String> {
    let marker = text.find(MODEL_RESPONSE_MARKER)?;
    let after = js::trim(&text[marker + MODEL_RESPONSE_MARKER.len()..]);
    let model_text = match after.find("\n---") {
        Some(next_section) => js::trim(&after[..next_section]),
        None => after,
    };
    (!model_text.is_empty()).then(|| model_text.to_owned())
}

/// The rubric to grade against, built from rubric text as the desktop builds
/// it when grading starts.
///
/// Criteria in the text become the checklist, grouped by category; a
/// criterion outside any category is a category of its own. Text with no
/// criteria is read as `[Category]` lines followed by `- item` lines, and
/// text with neither leaves the scraped checklist and targets as they are.
/// The question and the maximum score come from `scraped`, and so does the
/// exemplar answer unless the text has one.
pub fn rubric_from_text(scraped: &Rubric, text: &str, mode: WeightMode) -> Rubric {
    let rows = text_to_criteria(text);
    let (checklist_items, rubric_items) = if rows.is_empty() {
        bracketed_items(scraped, text)
    } else {
        (grouped_checklist(scraped, &rows), Vec::new())
    };

    Rubric {
        essay_prompt: Some(scraped.essay_prompt.clone().unwrap_or_default()),
        max_score: Some(max_score(scraped)),
        checklist_items,
        rubric_items,
        model_text: extract_model_text(text).or_else(|| scraped.model_text.clone()),
        custom_instructions: None,
        weight_mode: Some(mode),
        category_weights: (mode == WeightMode::Category)
            .then(|| category_weights(&rows))
            .flatten(),
        criterion_weights: (mode == WeightMode::Criterion)
            .then(|| criterion_weights(&rows))
            .flatten(),
    }
}

/// The rubric text to put in an editor for the teacher: [`rubric_text`] with
/// requirements that carry no points written as plain lines, or only the
/// exemplar answer when the page has no requirements, or nothing.
pub fn editable_rubric_text(scraped: &Rubric) -> String {
    let text = rubric_text(scraped);
    if text != NO_RUBRIC_TEXT {
        return plain_lines(&text);
    }
    match scraped.model_text.as_deref().filter(|t| !t.is_empty()) {
        Some(model_text) => format!("{MODEL_RESPONSE_MARKER}\n{model_text}"),
        None => String::new(),
    }
}

/// The teacher's edited rubric text in the form grading reads: every line
/// they wrote that is not a heading is a requirement, with "(0pts)" added
/// where they gave no points.
pub fn grading_text(edited: &str) -> String {
    pointed_lines(edited)
}

/// The lines of edited rubric text that grading will not use: neither a
/// requirement nor a heading, and not part of the exemplar answer.
///
/// With one requirement per line there are none. Text in the older
/// `[Category]` and `- item` layout can have lines outside any category.
/// Empty for text in a table layout, where lines cannot be judged one by one.
pub fn unread_rubric_lines(edited: &str) -> Vec<String> {
    let text = grading_text(edited);
    if !is_line_layout(&text) {
        return Vec::new();
    }
    let body = match text.find(MODEL_RESPONSE_MARKER) {
        Some(marker) => &text[..marker],
        None => &text,
    };
    let lines = || body.split('\n').map(js::trim).filter(|l| !l.is_empty());
    if lines().any(is_rubric_line) {
        return lines()
            .filter(|line| !is_rubric_line(line))
            .map(str::to_owned)
            .collect();
    }

    // No criteria: the text is read as `[Category]` lines with `- item` lines
    // under them, as `bracketed_items` does.
    let mut unread = Vec::new();
    let mut category_open = false;
    for line in lines() {
        if line == "--- Rubric Targets ---" || line == "--- Grading Checklist ---" {
            category_open = false;
        } else if line.starts_with('[') && line.ends_with(']') {
            category_open = true;
        } else if !(category_open && line.starts_with('-')) {
            unread.push(line.to_owned());
        }
    }
    unread
}

/// The rubric to grade against when the teacher has changed the rubric text,
/// from the text as they left it in the editor.
pub fn rubric_from_edited_text(scraped: &Rubric, edited: &str, mode: WeightMode) -> Rubric {
    rubric_from_grading_text(scraped, &grading_text(edited), mode)
}

/// The rubric to grade against when the teacher has changed the rubric text,
/// from that text in the form [`grading_text`] gives.
///
/// Unlike [`rubric_from_text`], nothing is taken from the page behind the
/// teacher's back: requirements and an exemplar answer they deleted stay
/// deleted. Weights are filled in as [`with_default_weights`] does. The
/// question and the maximum score still come from `scraped`.
pub fn rubric_from_grading_text(scraped: &Rubric, text: &str, mode: WeightMode) -> Rubric {
    let only_the_page_facts = Rubric {
        checklist_items: Vec::new(),
        rubric_items: Vec::new(),
        model_text: None,
        ..scraped.clone()
    };
    let mut rubric = rubric_from_text(
        &only_the_page_facts,
        &with_default_weights(text, mode),
        mode,
    );
    // Filling in weights rewrites the text without its exemplar answer.
    rubric.model_text = extract_model_text(text);
    rubric
}

/// A category of the rubric text and how much of the grade it is.
#[derive(Debug, Clone, PartialEq)]
pub struct CategoryShare {
    pub category: String,
    /// The percentage grading will use: the one in the category's heading,
    /// or the one that is filled in when the text names no weights.
    pub weight: f64,
}

/// The named categories of edited rubric text, in order, each with the
/// weight grading will use for it. Empty for text without headings and for
/// text that is not laid out one requirement per line.
pub fn category_shares(edited: &str) -> Vec<CategoryShare> {
    shares(&weighted_rows(edited))
}

/// The rows of edited rubric text, with the weights grading will use where
/// the text names none. Empty for text that is not laid out one requirement
/// per line.
fn weighted_rows(edited: &str) -> Vec<RubricCriterion> {
    let text = grading_text(edited);
    if !is_line_layout(&text) {
        return Vec::new();
    }
    text_to_criteria(&with_default_weights(&text, DEFAULT_WEIGHT_MODE))
}

/// Each named category once, with the first weight given for it.
fn shares(rows: &[RubricCriterion]) -> Vec<CategoryShare> {
    let mut found: Vec<(&str, Option<f64>)> = Vec::new();
    for row in rows {
        let Some(category) = row.category.as_deref() else {
            continue;
        };
        match found.iter_mut().find(|(name, _)| *name == category) {
            Some((_, weight)) => *weight = weight.or(row.category_weight),
            None => found.push((category, row.category_weight)),
        }
    }
    found
        .into_iter()
        .map(|(category, weight)| CategoryShare {
            category: category.to_owned(),
            weight: weight.unwrap_or(0.0),
        })
        .collect()
}

/// True when edited rubric text itself says how much a category counts, as
/// opposed to leaving the weights to be filled in.
pub fn names_category_weights(edited: &str) -> bool {
    let text = grading_text(edited);
    is_line_layout(&text)
        && text_to_criteria(&text)
            .iter()
            .any(|row| row.category.is_some() && row.category_weight.unwrap_or(0.0) != 0.0)
}

/// The edited rubric text with no weight in any heading.
pub fn without_category_weights(edited: &str) -> String {
    unweighted_headings(edited)
}

/// The edited rubric text with `category` counting for `weight` percent.
///
/// Every category's weight is written into its heading, so that weights the
/// text left to be filled in are now the teacher's to see and change.
pub fn with_category_weight(edited: &str, category: &str, weight: f64) -> String {
    let weight = js::round_to(weight.clamp(0.0, 100.0), 10.0);
    let weights: Vec<(String, f64)> = category_shares(edited)
        .into_iter()
        .map(|share| {
            let weight = if share.category == category {
                weight
            } else {
                share.weight
            };
            (share.category, weight)
        })
        .collect();
    reweighted_headings(edited, &weights)
}

/// The edited rubric text with every named category counting the same.
pub fn with_equal_category_weights(edited: &str) -> String {
    let named: Vec<RubricCriterion> = text_to_criteria(&grading_text(edited))
        .into_iter()
        .filter(|row| row.category.is_some())
        .collect();
    let weights: Vec<(String, f64)> = shares(&equalize_weights(&named, DEFAULT_WEIGHT_MODE))
        .into_iter()
        .map(|share| (share.category, share.weight))
        .collect();
    reweighted_headings(edited, &weights)
}

/// Why the weights in edited rubric text would give wrong scores, if they
/// would: a class graded against weights that do not add up to 100 has
/// every score scaled by what they do add up to.
pub fn category_weight_problem(edited: &str) -> Option<String> {
    let rows = weighted_rows(edited);
    let shares = shares(&rows);
    if shares.is_empty() {
        return None;
    }
    if rows.iter().any(|row| row.category.is_none()) {
        return Some(
            "The requirements above the first heading are in no category, so they \
             would not count toward the score. Put them under a heading."
                .to_owned(),
        );
    }
    let sum = js::round_to(shares.iter().map(|share| share.weight).sum(), 10.0);
    ((sum - 100.0).abs() > WEIGHT_TOLERANCE).then(|| {
        format!(
            "The category weights add up to {}%. They must add up to 100%.",
            js::Num(sum)
        )
    })
}

/// The scraped maximum, or "10" where JavaScript finds it falsy.
fn max_score(scraped: &Rubric) -> MaxScore {
    match &scraped.max_score {
        Some(MaxScore::Text(text)) if !text.is_empty() => MaxScore::Text(text.clone()),
        Some(MaxScore::Number(number)) if *number != 0.0 && !number.is_nan() => {
            MaxScore::Number(*number)
        }
        _ => MaxScore::Text(DEFAULT_MAX_SCORE.to_owned()),
    }
}

fn scraped_weight(scraped: &Rubric, category: &str) -> Option<f64> {
    scraped.category_weights.as_ref()?.get(category).copied()
}

/// One checklist item per category, in order of first appearance. A
/// category's weight is its first criterion's.
fn grouped_checklist(scraped: &Rubric, rows: &[RubricCriterion]) -> Vec<ChecklistItem> {
    let mut checklist: Vec<ChecklistItem> = Vec::new();
    for row in rows {
        let category = row.category.as_deref().unwrap_or(&row.criteria);
        let requirement = if row.description.is_empty() {
            row.criteria.clone()
        } else {
            format!("{}: {}", row.criteria, row.description)
        };
        match checklist
            .iter_mut()
            .find(|item| item.category.as_deref() == Some(category))
        {
            Some(item) => item.items.push(requirement),
            None => checklist.push(ChecklistItem {
                category: Some(category.to_owned()),
                points: None,
                items: vec![requirement],
                category_weight: row
                    .category_weight
                    .or_else(|| scraped_weight(scraped, category)),
                criterion_weight: None,
            }),
        }
    }
    checklist
}

/// Reads `[Category]` / `- item` text into a checklist and rubric targets.
/// A part the text does not have comes from the scraped rubric.
fn bracketed_items(scraped: &Rubric, text: &str) -> (Vec<ChecklistItem>, Vec<RubricItem>) {
    enum Open {
        Nothing,
        Checklist,
        Target,
    }

    let mut checklist: Vec<ChecklistItem> = Vec::new();
    let mut targets: Vec<RubricItem> = Vec::new();
    let mut open = Open::Nothing;
    let mut in_targets = false;
    let mut in_model_text = false;

    for line in text.split('\n') {
        let line = js::trim(line);
        if line == MODEL_RESPONSE_MARKER {
            in_model_text = true;
        } else if in_model_text {
            // The model text ends at the next section line, which is
            // swallowed whatever it says.
            in_model_text = !line.starts_with("---");
        } else if line == "--- Rubric Targets ---" {
            in_targets = true;
            open = Open::Nothing;
        } else if line == "--- Grading Checklist ---" {
            in_targets = false;
            open = Open::Nothing;
        } else if let Some(category) = line
            .strip_prefix('[')
            .and_then(|rest| rest.strip_suffix(']'))
        {
            if in_targets {
                targets.push(RubricItem {
                    category: Some(category.to_owned()),
                    items: Vec::new(),
                });
                open = Open::Target;
            } else {
                checklist.push(ChecklistItem {
                    category: Some(category.to_owned()),
                    category_weight: scraped_weight(scraped, category),
                    ..ChecklistItem::default()
                });
                open = Open::Checklist;
            }
        } else if let Some(item) = line.strip_prefix('-') {
            let items = match open {
                Open::Checklist => checklist.last_mut().map(|item| &mut item.items),
                Open::Target => targets.last_mut().map(|item| &mut item.items),
                Open::Nothing => None,
            };
            if let Some(items) = items {
                items.push(js::trim(item).to_owned());
            }
        }
    }

    if checklist.is_empty() && targets.is_empty() {
        return (
            scraped.checklist_items.clone(),
            scraped.rubric_items.clone(),
        );
    }
    (
        if checklist.is_empty() {
            scraped.checklist_items.clone()
        } else {
            checklist
        },
        if targets.is_empty() {
            scraped.rubric_items.clone()
        } else {
            targets
        },
    )
}

/// Each category's weight: that of its first criterion that has one.
fn category_weights(rows: &[RubricCriterion]) -> Option<WeightMap> {
    let mut weights: Vec<(&str, f64)> = Vec::new();
    for row in rows {
        let category = row.category.as_deref().unwrap_or("");
        if let Some(weight) = row.category_weight
            && !weights.iter().any(|(seen, _)| *seen == category)
        {
            weights.push((category, weight));
        }
    }
    // The original collects these on a plain JavaScript object, where
    // assigning a number to `__proto__` does nothing.
    weights.retain(|(category, _)| *category != "__proto__");
    (!weights.is_empty()).then(|| weights.into_iter().collect())
}

/// Each criterion's weight under its category, leaving out weights of zero.
fn criterion_weights(rows: &[RubricCriterion]) -> Option<OrderedMap<WeightMap>> {
    let mut weights: Vec<(&str, Vec<(&str, f64)>)> = Vec::new();
    for row in rows {
        let category = row.category.as_deref().unwrap_or("");
        let Some(weight) = row.criterion_weight.filter(|weight| *weight > 0.0) else {
            continue;
        };
        // The original collects these on plain JavaScript objects. A category
        // named like something every object inherits is found there already
        // and never becomes a key of its own, so its weights are lost.
        if INHERITED_OBJECT_KEYS.contains(&category) {
            continue;
        }
        let at = match weights.iter().position(|(seen, _)| *seen == category) {
            Some(at) => at,
            None => {
                weights.push((category, Vec::new()));
                weights.len() - 1
            }
        };
        if row.criteria != "__proto__" {
            weights[at].1.push((row.criteria.as_str(), weight));
        }
    }
    (!weights.is_empty()).then(|| {
        weights
            .into_iter()
            .map(|(category, criteria)| (category, criteria.into_iter().collect::<WeightMap>()))
            .collect()
    })
}

/// The members of JavaScript's `Object.prototype`.
const INHERITED_OBJECT_KEYS: [&str; 12] = [
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
];
