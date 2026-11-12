//! Turning raw AI output into scores and feedback.
//!
//! Models wrap their JSON in reasoning blocks, code fences and prose, leave
//! LaTeX backslashes unescaped and add trailing commas. Each parser tries
//! progressively looser readings before giving up.

use std::sync::LazyLock;

use regex::Regex;

use super::feedback::{
    normalize_feedback_html, normalize_greeting, reconcile_explained_score,
    reconcile_score_with_feedback,
};
use super::js::{self, Json, WS};
use super::pattern;
use super::types::{CategoryWeighting, GradingError, SingleGrade, StudentResult, StudentWork};

/// The feedback given to every student when a response cannot be read at all.
pub const PARSE_ERROR_FEEDBACK: &str = "Error parsing AI response. Please try again.";
const DEFAULT_FEEDBACK: &str = "Graded by AI.";

static THINK_BLOCK: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u:<think>)(?s:.)*?(?i-u:</think>)"));
static JSON_FENCE: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"```json{WS}*((?s:.)*?){WS}*```")));
static FENCE: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r"```{WS}*((?s:.)*?){WS}*```")));
static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| pattern(&format!(r",{WS}*([}}\]])")));
static RESULT_OBJECT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r#"\{{{WS}*"studentIndex"{WS}*:{WS}*[0-9]+{WS}*,{WS}*"score"{WS}*:{WS}*([0-9]+\.?[0-9]*){WS}*,{WS}*"feedback"{WS}*:{WS}*"([^"]*)""#
    ))
});
static SCORE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"(?i-u:student){WS}*[0-9]+[^:]*:{WS}*([0-9]+\.?[0-9]*){WS}*/{WS}*[0-9]+"
    ))
});
static SCORE_AND_FEEDBACK: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r#""score"{WS}*:{WS}*([0-9]+\.?[0-9]*){WS}*,{WS}*"feedback"{WS}*:{WS}*"([^"]*)""#
    ))
});

/// Reads the AI's answer to a batch prompt.
///
/// Results are matched to `students` by position, not by the `studentIndex`
/// the AI wrote, because models often number every chunk from zero. Fewer
/// results than students may come back; extra ones are dropped. If nothing
/// can be read, every student gets a zero and [`PARSE_ERROR_FEEDBACK`].
///
/// Scores arrive out of 10 and are converted to `max_score`, or combined from
/// per-category scores when `weighting` is given. Fails only when the AI's
/// array holds a `null` in place of a result.
pub fn parse_batch_response(
    ai_text: &str,
    students: &[StudentWork],
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
) -> Result<Vec<StudentResult>, GradingError> {
    let checked = parse_batch(ai_text, students, max_score, weighting, Rules::Original)?;
    Ok(checked.into_iter().map(|checked| checked.result).collect())
}

/// Which scoring rules a batch reply is read with.
#[derive(Clone, Copy)]
enum Rules {
    /// Exactly what the JavaScript server did.
    Original,
    /// The same, with its two known scoring faults corrected.
    Corrected,
}

/// One result of [`parse_batch_response_checked`].
#[derive(Debug, Clone, PartialEq)]
pub struct CheckedResult {
    pub result: StudentResult,
    /// False when the AI's result held no usable score, so the zero in
    /// `result.score` is a stand-in and not a grade.
    pub score_given: bool,
}

/// Reads a batch reply for the app: like [`parse_batch_response`], but says
/// for each result whether the AI actually gave a score, and corrects two
/// faults of the JavaScript server's scoring.
///
/// - A missing or unreadable score came out as a zero there. Here it is
///   reported through [`CheckedResult::score_given`], so a caller that must
///   never invent a grade can tell the two apart.
/// - Category scores are asked for out of 10, but were divided by the
///   category's points, so half marks in every category could come out as
///   full credit. Here they are divided by 10.
/// - A score below the maximum was raised to full credit whenever the
///   feedback's wording was not recognised as critical. Here it is raised
///   only when every requirement is marked Correct
///   ([`reconcile_explained_score`](super::reconcile_explained_score)).
pub fn parse_batch_response_checked(
    ai_text: &str,
    students: &[StudentWork],
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
) -> Result<Vec<CheckedResult>, GradingError> {
    parse_batch(ai_text, students, max_score, weighting, Rules::Corrected)
}

fn parse_batch(
    ai_text: &str,
    students: &[StudentWork],
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
    rules: Rules,
) -> Result<Vec<CheckedResult>, GradingError> {
    // Corrected: every category is scored out of 10, as the prompt asks.
    let out_of_ten = weighting.map(|given| CategoryWeighting {
        weights: given.weights.clone(),
        max_points: None,
    });
    let weighting = match rules {
        Rules::Original => weighting,
        Rules::Corrected => out_of_ten.as_ref(),
    };
    let text = strip_wrapping(ai_text);
    let Some(items) = batch_items(&text) else {
        return Ok(students
            .iter()
            .map(|student| CheckedResult {
                result: StudentResult {
                    student_index: student.index,
                    score: 0.0,
                    feedback: PARSE_ERROR_FEEDBACK.to_owned(),
                },
                score_given: false,
            })
            .collect());
    };
    let results = validate_batch_results(&items, students, max_score, weighting, rules)?;
    Ok(results
        .into_iter()
        .zip(&items)
        .map(|(result, item)| CheckedResult {
            result,
            score_given: has_score(item, weighting, max_score),
        })
        .collect())
}

/// The result objects in a reply, by the first way of reading it that finds any.
fn batch_items(text: &str) -> Option<Vec<Json>> {
    if let Some(items) = parse_result_array(text) {
        return Some(items);
    }
    if let Some(items) = outermost(text, '[', ']').and_then(parse_result_array) {
        return Some(items);
    }

    // Individual result objects inside otherwise broken JSON.
    let objects: Vec<Json> = RESULT_OBJECT
        .captures_iter(text)
        .map(|found| score_and_feedback(&found[1], &found[2]))
        .collect();
    if !objects.is_empty() {
        return Some(objects);
    }

    // Prose such as "Student 5: 8/10".
    let lines: Vec<Json> = SCORE_LINE
        .captures_iter(text)
        .map(|found| score_and_feedback(&found[1], "Score extracted from non-JSON response."))
        .collect();
    (!lines.is_empty()).then_some(lines)
}

/// Whether `item` carries a score [`final_score`] can use, as opposed to
/// falling back to zero.
fn has_score(item: &Json, weighting: Option<&CategoryWeighting>, max_score: f64) -> bool {
    let weighted =
        weighting.and_then(|w| weighted_score(item.get("criterion_scores"), w, max_score));
    let plain = item.get("score").parse_float();
    weighted.is_some() || (!plain.is_nan() && plain >= 0.0)
}

/// Reads the AI's answer to a single-grade prompt.
///
/// `student_name`, when given, rewrites the feedback's greeting to the
/// student's first name. If nothing can be read the result is a zero with
/// [`PARSE_ERROR_FEEDBACK`].
pub fn parse_single_grade_response(
    ai_text: &str,
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
    student_name: Option<&str>,
) -> SingleGrade {
    let text = strip_wrapping(ai_text);
    let read = |source: &str| {
        Json::parse(source).and_then(|parsed| clamp_single_result(&parsed, max_score, weighting))
    };

    let graded = read(&text)
        .or_else(|| read(&escape_stray_backslashes(&text)))
        .or_else(|| {
            let object = outermost(&text, '{', '}')?;
            read(object).or_else(|| read(&escape_stray_backslashes(object)))
        })
        .or_else(|| {
            let found = SCORE_AND_FEEDBACK.captures(&text)?;
            clamp_single_result(
                &score_and_feedback(&found[1], &found[2]),
                max_score,
                weighting,
            )
        });

    match graded {
        Some(mut grade) => {
            if let Some(name) = student_name.filter(|n| !n.is_empty()) {
                grade.feedback = normalize_greeting(&grade.feedback, name);
            }
            grade
        }
        None => SingleGrade {
            score: 0.0,
            feedback: PARSE_ERROR_FEEDBACK.to_owned(),
        },
    }
}

/// Removes reasoning blocks and unwraps a fenced code block.
fn strip_wrapping(ai_text: &str) -> String {
    let without_thinking = THINK_BLOCK.replace_all(js::trim(ai_text), "");
    let text = js::trim(&without_thinking);
    match JSON_FENCE.captures(text).or_else(|| FENCE.captures(text)) {
        Some(fenced) => js::trim(&fenced[1]).to_owned(),
        None => text.to_owned(),
    }
}

/// From the first `open` to the last `close`, if they come in that order.
fn outermost(text: &str, open: char, close: char) -> Option<&str> {
    let start = text.find(open)?;
    let end = text.rfind(close)?;
    (end > start).then(|| &text[start..end + close.len_utf8()])
}

/// Doubles every backslash that does not start a JSON escape, so that LaTeX
/// such as `\(` survives parsing. Each backslash is judged on its own, as in
/// the original, so the second half of an already escaped pair can be doubled
/// too.
fn escape_stray_backslashes(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len() + 16);
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        escaped.push(c);
        let starts_escape = matches!(
            chars.peek(),
            Some('"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' | 'u')
        );
        if c == '\\' && !starts_escape {
            escaped.push('\\');
        }
    }
    escaped
}

/// Parses `text` as a JSON array of results, repairing it if needed. Objects
/// that wrap the array under a common key are unwrapped.
fn parse_result_array(text: &str) -> Option<Vec<Json>> {
    fn array(parsed: Json, unwrap_objects: bool) -> Option<Vec<Json>> {
        match parsed {
            Json::Array(items) => Some(items),
            Json::Object(_) if unwrap_objects => {
                let inner = ["results", "students", "grades", "data"]
                    .iter()
                    .map(|key| parsed.get(key))
                    .find(|value| value.is_truthy())?;
                match inner {
                    Json::Array(items) => Some(items.clone()),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    Json::parse(text)
        .and_then(|parsed| array(parsed, true))
        .or_else(|| Json::parse(&escape_stray_backslashes(text)).and_then(|p| array(p, true)))
        .or_else(|| {
            let without_commas = TRAILING_COMMA.replace_all(text, "${1}");
            Json::parse(&escape_stray_backslashes(&without_commas)).and_then(|p| array(p, false))
        })
}

fn score_and_feedback(score: &str, feedback: &str) -> Json {
    Json::Object(vec![
        ("score".to_owned(), Json::Number(js::parse_float(score))),
        ("feedback".to_owned(), Json::String(feedback.to_owned())),
    ])
}

fn validate_batch_results(
    items: &[Json],
    students: &[StudentWork],
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
    rules: Rules,
) -> Result<Vec<StudentResult>, GradingError> {
    let reconcile = match rules {
        Rules::Original => reconcile_score_with_feedback,
        Rules::Corrected => reconcile_explained_score,
    };
    // The original reads a property of every item before dropping the extra
    // ones, so a null anywhere fails the whole response.
    if let Some(position) = items.iter().position(|item| matches!(item, Json::Null)) {
        return Err(GradingError::NullResult { position });
    }

    Ok(items
        .iter()
        .zip(students)
        .map(|(item, student)| {
            let score = final_score(item, max_score, weighting);
            let raw_feedback = match item.get("feedback") {
                Json::Array(parts) => Json::join(parts, "\n"),
                other if other.is_truthy() => other.to_js_string(),
                _ => String::new(),
            };
            let feedback = normalize_feedback_html(js::trim(&raw_feedback));
            let feedback = if feedback.is_empty() {
                DEFAULT_FEEDBACK.to_owned()
            } else {
                feedback
            };
            let feedback = normalize_greeting(&feedback, &student.name);
            StudentResult {
                student_index: student.index,
                score: reconcile(score, &feedback, max_score),
                feedback,
            }
        })
        .collect())
}

/// Scores one parsed single-grade object. `None` where the original throws:
/// a null, or feedback that is neither text nor empty.
fn clamp_single_result(
    parsed: &Json,
    max_score: f64,
    weighting: Option<&CategoryWeighting>,
) -> Option<SingleGrade> {
    if matches!(parsed, Json::Null) {
        return None;
    }
    let score = final_score(parsed, max_score, weighting);
    let raw_feedback = match parsed.get("feedback") {
        Json::String(text) => js::trim(text),
        other if other.is_truthy() => return None,
        _ => "",
    };
    let feedback = normalize_feedback_html(raw_feedback);
    let feedback = if feedback.is_empty() {
        DEFAULT_FEEDBACK.to_owned()
    } else {
        feedback
    };
    Some(SingleGrade {
        score: reconcile_score_with_feedback(score, &feedback, max_score),
        feedback,
    })
}

/// The item's score on the rubric's real scale, capped and snapped.
fn final_score(item: &Json, max_score: f64, weighting: Option<&CategoryWeighting>) -> f64 {
    let weighted =
        weighting.and_then(|w| weighted_score(item.get("criterion_scores"), w, max_score));
    let score = weighted.unwrap_or_else(|| {
        let out_of_ten = item.get("score").parse_float();
        let out_of_ten = if out_of_ten.is_nan() || out_of_ten < 0.0 {
            0.0
        } else {
            out_of_ten
        };
        out_of_ten / (10.0 / js::or_number(max_score, 10.0))
    });
    snap_score(if score > max_score { max_score } else { score }, max_score)
}

/// The percentage-weighted total of per-category scores:
/// `sum(score / category max * weight% / 100) * max_score`. `None` if no
/// category has both a usable score and a weight.
fn weighted_score(
    criterion_scores: &Json,
    weighting: &CategoryWeighting,
    max_score: f64,
) -> Option<f64> {
    let mut fraction = 0.0;
    let mut counted = false;
    for (category, value) in criterion_scores.entries() {
        let raw = value.parse_float();
        if raw.is_nan() || raw < 0.0 {
            continue;
        }
        let Some(&weight_percent) = weighting.weights.get(&category) else {
            continue;
        };
        let category_max = weighting
            .max_points
            .as_ref()
            .and_then(|max_points| max_points.get(&category))
            .map_or(10.0, |&points| js::or_number(points, 10.0));
        fraction += (raw / category_max) * (weight_percent / 100.0);
        counted = true;
    }
    counted.then_some(fraction * max_score)
}

/// Rounds to steps that suit the maximum, so that low-point questions keep
/// finer precision than half points.
fn snap_score(score: f64, max_score: f64) -> f64 {
    let steps_per_point = if max_score >= 5.0 {
        2.0
    } else if max_score >= 2.0 {
        4.0
    } else {
        10.0
    };
    js::round_to(score, steps_per_point)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn students(count: usize) -> Vec<StudentWork> {
        (0..count)
            .map(|i| StudentWork {
                index: i + 10,
                name: format!("Last{i}, First{i}"),
                response: String::new(),
                prompt: None,
            })
            .collect()
    }

    fn weighting(weights: &[(&str, f64)], max_points: Option<&[(&str, f64)]>) -> CategoryWeighting {
        CategoryWeighting {
            weights: weights.iter().copied().collect(),
            max_points: max_points.map(|m| m.iter().copied().collect()),
        }
    }

    #[test]
    fn snapping_depends_on_the_maximum() {
        assert_eq!(snap_score(7.3, 10.0), 7.5);
        assert_eq!(snap_score(7.25, 10.0), 7.5);
        assert_eq!(snap_score(1.6, 3.0), 1.5);
        assert_eq!(snap_score(1.63, 3.0), 1.75);
        assert_eq!(snap_score(0.84, 1.0), 0.8);
        assert_eq!(snap_score(0.85, 1.0), 0.9);
    }

    #[test]
    fn stray_backslashes_are_doubled_one_at_a_time() {
        assert_eq!(escape_stray_backslashes(r"\( x \)"), r"\\( x \\)");
        assert_eq!(escape_stray_backslashes(r#"\n \" \\"#), r#"\n \" \\\"#);
        assert_eq!(escape_stray_backslashes(r"\frac"), r"\frac");
        assert_eq!(escape_stray_backslashes(r"\alpha\"), r"\\alpha\\");
    }

    #[test]
    fn results_map_to_students_by_position() {
        let ai = r#"[{"studentIndex": 0, "score": 9, "feedback": "<p>Hi Last0, First0,</p>"},
                     {"studentIndex": 0, "score": 4, "feedback": ["a", null, 2]},
                     {"studentIndex": 7, "score": 1, "feedback": "extra"}]"#;
        let results = parse_batch_response(ai, &students(2), 20.0, None).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].student_index, 10);
        assert_eq!(results[0].score, 18.0);
        assert_eq!(results[0].feedback, "<p>Hi First0,</p>");
        assert_eq!(results[1].student_index, 11);
        assert_eq!(results[1].feedback, "a\n\n2");
    }

    #[test]
    fn wrapper_objects_and_surrounding_prose_are_unwrapped() {
        let wrapped = r#"{"results": [{"score": 8, "feedback": "ok"}]}"#;
        assert_eq!(
            parse_batch_response(wrapped, &students(1), 10.0, None).unwrap()[0].score,
            8.0
        );
        let grades = r#"Sure! {"results": null, "grades": [{"score": 6, "feedback": "ok"}]} Done."#;
        assert_eq!(
            parse_batch_response(grades, &students(1), 10.0, None).unwrap()[0].score,
            6.0
        );
        let prose = "Here you go:\n[{\"score\": 7, \"feedback\": \"ok\"},]\nThanks";
        assert_eq!(
            parse_batch_response(prose, &students(1), 10.0, None).unwrap()[0].score,
            7.0
        );
    }

    #[test]
    fn latex_in_batch_feedback_survives() {
        let ai = r#"<think>hmm [1]</think>```json
[{"studentIndex": 0, "score": 8, "feedback": "Use \( x^2 \) and \frac{1}{2}"}]
```"#;
        let results = parse_batch_response(ai, &students(1), 10.0, None).unwrap();
        // `\f` is a valid JSON escape, so only `\(` and `\)` are repaired.
        assert_eq!(results[0].feedback, "Use \\( x^2 \\) and \u{c}rac{1}{2}");
    }

    #[test]
    fn broken_json_falls_back_to_object_and_line_patterns() {
        let objects = r#"{"studentIndex": 3, "score": 8., "feedback": "Good"} junk {"studentIndex": 4, "score": 5, "feedback": "Fair" "#;
        let results = parse_batch_response(objects, &students(2), 10.0, None).unwrap();
        assert_eq!(
            results
                .iter()
                .map(|r| (r.score, r.feedback.as_str()))
                .collect::<Vec<_>>(),
            [(8.0, "Good"), (5.0, "Fair")]
        );

        let lines = "Student 1 (Ann): 8/10\nSTUDENT 2 - Bob: 6.5 / 10";
        let results = parse_batch_response(lines, &students(2), 10.0, None).unwrap();
        assert_eq!(results[0].score, 8.0);
        assert_eq!(results[1].score, 6.5);
        assert_eq!(
            results[1].feedback,
            "Score extracted from non-JSON response."
        );
    }

    #[test]
    fn unreadable_text_gives_every_student_the_error_result() {
        let results = parse_batch_response("no idea", &students(2), 10.0, None).unwrap();
        assert_eq!(results.len(), 2);
        assert!(
            results
                .iter()
                .all(|r| r.score == 0.0 && r.feedback == PARSE_ERROR_FEEDBACK)
        );
        assert_eq!(results[1].student_index, 11);
    }

    #[test]
    fn null_result_is_an_error() {
        assert_eq!(
            parse_batch_response(r#"[{"score": 1}, null]"#, &students(1), 10.0, None),
            Err(GradingError::NullResult { position: 1 })
        );
    }

    #[test]
    fn odd_score_values_parse_like_javascript() {
        let ai =
            r#"[{"score": "7.5 out of 10"}, {"score": [6]}, {"score": true}, 5, {"score": null}]"#;
        let results = parse_batch_response(ai, &students(5), 10.0, None).unwrap();
        let scores: Vec<f64> = results.iter().map(|r| r.score).collect();
        assert_eq!(scores, [7.5, 6.0, 0.0, 0.0, 0.0]);
        assert!(results.iter().all(|r| r.feedback == DEFAULT_FEEDBACK));
    }

    #[test]
    fn category_weights_combine_criterion_scores() {
        let weights = weighting(&[("Understanding", 60.0), ("Detail", 40.0)], None);
        let ai = r#"[{"score": 2, "criterion_scores": {"Understanding": 10, "Detail": 5, "Unknown": 0}, "feedback": "x"}]"#;
        let results = parse_batch_response(ai, &students(1), 20.0, Some(&weights)).unwrap();
        // (10/10 * 0.6 + 5/10 * 0.4) * 20
        assert_eq!(results[0].score, 16.0);

        let with_max = weighting(
            &[("Understanding", 60.0), ("Detail", 40.0)],
            Some(&[("Understanding", 5.0), ("Detail", 0.0)]),
        );
        let ai = r#"{"score": 2, "criterion_scores": {"Understanding": 5, "Detail": "5", "Clarity": 3}, "feedback": "x"}"#;
        let grade = parse_single_grade_response(ai, 20.0, Some(&with_max), None);
        assert_eq!(grade.score, 16.0);
    }

    #[test]
    fn weights_without_usable_criterion_scores_fall_back_to_the_score() {
        let weights = weighting(&[("Understanding", 100.0)], None);
        for ai in [
            r#"[{"score": 7, "feedback": "x"}]"#,
            r#"[{"score": 7, "criterion_scores": {"Other": 3, "Understanding": -1}, "feedback": "x"}]"#,
            r#"[{"score": 7, "criterion_scores": "n/a", "feedback": "x"}]"#,
        ] {
            let results = parse_batch_response(ai, &students(1), 10.0, Some(&weights)).unwrap();
            assert_eq!(results[0].score, 7.0, "{ai}");
        }
    }

    #[test]
    fn single_parser_skips_readings_the_original_throws_on() {
        // Feedback that is not text makes the direct readings fail, leaving
        // the pattern fallback, which finds nothing here.
        let grade = parse_single_grade_response(r#"{"score": 8, "feedback": 5}"#, 10.0, None, None);
        assert_eq!(grade.feedback, PARSE_ERROR_FEEDBACK);
        let grade = parse_single_grade_response("null", 10.0, None, None);
        assert_eq!(grade.feedback, PARSE_ERROR_FEEDBACK);
        // An array is not a grade object, but the original reads it as one
        // with no score and no feedback.
        let grade =
            parse_single_grade_response(r#"[{"score": 8, "feedback": "ok"}]"#, 10.0, None, None);
        assert_eq!(
            (grade.score, grade.feedback.as_str()),
            (0.0, DEFAULT_FEEDBACK)
        );
    }

    #[test]
    fn single_parser_rewrites_the_greeting_when_given_a_name() {
        let ai = r#"{"score": 10, "feedback": "<p>Hello Avery, Sam!</p><p>Great.</p>"}"#;
        let grade = parse_single_grade_response(ai, 10.0, None, Some("Avery, Sam"));
        assert_eq!(grade.feedback, "<p>Hi Sam,</p><p>Great.</p>");
        let grade = parse_single_grade_response(ai, 10.0, None, None);
        assert_eq!(grade.feedback, "<p>Hello Avery, Sam!</p><p>Great.</p>");
    }
}

#[cfg(test)]
mod checked_tests {
    use super::*;

    fn students(count: usize) -> Vec<StudentWork> {
        (0..count)
            .map(|index| StudentWork {
                index,
                name: format!("Student {index}"),
                response: "An answer.".into(),
                prompt: None,
            })
            .collect()
    }

    fn given(reply: &str, count: usize) -> Vec<bool> {
        parse_batch_response_checked(reply, &students(count), 10.0, None)
            .unwrap()
            .into_iter()
            .map(|checked| checked.score_given)
            .collect()
    }

    #[test]
    fn a_missing_or_unusable_score_is_reported_as_not_given() {
        let reply = r#"[
            {"studentIndex": 0, "score": 7, "feedback": "a"},
            {"studentIndex": 1, "feedback": "b"},
            {"studentIndex": 2, "score": "n/a", "feedback": "c"},
            {"studentIndex": 3, "score": -2, "feedback": "d"},
            {"studentIndex": 4, "score": 0, "feedback": "e"},
            {"studentIndex": 5, "score": "6.5", "feedback": "f"}
        ]"#;
        assert_eq!(given(reply, 6), [true, false, false, false, true, true]);
    }

    #[test]
    fn nothing_readable_means_no_scores_were_given() {
        assert_eq!(given("I cannot grade these.", 2), [false, false]);
    }

    #[test]
    fn scores_found_in_prose_count_as_given() {
        assert_eq!(given("Student 1: 8/10\nStudent 2: 6/10", 2), [true, true]);
    }

    #[test]
    fn half_marks_in_every_category_stay_half_marks() {
        use crate::grading::types::WeightMap;
        let weighting = CategoryWeighting {
            weights: [("Concept".to_owned(), 50.0), ("Work".to_owned(), 50.0)]
                .into_iter()
                .collect::<WeightMap>(),
            max_points: Some(
                [("Concept".to_owned(), 5.0), ("Work".to_owned(), 3.0)]
                    .into_iter()
                    .collect::<WeightMap>(),
            ),
        };
        let reply = r#"[{"studentIndex": 0, "criterion_scores": {"Concept": 5, "Work": 5}, "feedback": "Half right."}]"#;
        // The original divides the 0-10 category scores by the category's points.
        let original = parse_batch_response(reply, &students(1), 10.0, Some(&weighting)).unwrap();
        assert_eq!(original[0].score, 10.0);
        let corrected =
            parse_batch_response_checked(reply, &students(1), 10.0, Some(&weighting)).unwrap();
        assert_eq!(corrected[0].result.score, 5.0);
        assert!(corrected[0].score_given);
    }

    #[test]
    fn criticism_in_unfamiliar_words_no_longer_earns_full_credit() {
        let omitted = r#"[{"studentIndex": 0, "score": 3, "feedback": "<p>Hi Sam,</p><p><strong>Units</strong></p><p>You omitted the units.</p>"}]"#;
        let original = parse_batch_response(omitted, &students(1), 10.0, None).unwrap();
        assert_eq!(original[0].score, 10.0, "the original raises it");
        let corrected = parse_batch_response_checked(omitted, &students(1), 10.0, None).unwrap();
        assert_eq!(corrected[0].result.score, 3.0);

        // What the rule was written for still works: everything Correct, yet a deduction.
        let unexplained = r#"[{"studentIndex": 0, "score": 8, "feedback": "<p>Hi Sam,</p><p><strong>Names the theorem</strong></p><blockquote>You said: \"it is not wrong\"</blockquote><p>Correct. The answer states the Central Limit Theorem.</p><p><em>To improve: N/A</em></p>"}]"#;
        let corrected =
            parse_batch_response_checked(unexplained, &students(1), 10.0, None).unwrap();
        assert_eq!(corrected[0].result.score, 10.0);
    }
}
