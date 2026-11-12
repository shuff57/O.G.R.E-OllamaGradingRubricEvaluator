//! Leniency: having the AI reword a rubric so its criteria are easier or
//! harder to meet, before anything is graded against it.
//!
//! A port of `lib/rubric-leniency.ts`. Only the prompt and the checks on the
//! reply live here; sending the prompt is the caller's job. The scale is the
//! Electron app's: from 0 (its most lenient) through 50 (the rubric as
//! written) to 100 (most strict). Values below 0 ask for more leniency than
//! the Electron app could: -50 is "100% more lenient".

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::grading::js;

/// The setting at which the rubric is used as written.
pub const NEUTRAL_LENIENCY: i16 = 50;

/// A line carrying a point value, such as `Name (2pts): ...`.
static CRITERION_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\(\s*[0-9]+(?:\.[0-9]+)?\s*(?:pts?|points?)\s*\)").expect("valid pattern")
});

/// `## Category` with an optional `[N%]` weight.
static CATEGORY_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^##[\s\x{feff}\x{a0}]+(.+?)(?:[\s\x{feff}\x{a0}]*\[([0-9]+(?:\.[0-9]+)?)%\])?[\s\x{feff}\x{a0}]*$")
        .expect("valid pattern")
});

/// Why a rewrite cannot be used.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RewriteError {
    Empty,
    /// The reply dropped too many of the rubric's criteria.
    LostCriteria {
        kept: usize,
        original: usize,
        /// The start of the reply, to show what came back.
        preview: String,
    },
}

impl std::fmt::Display for RewriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => f.write_str("the AI returned an empty rubric"),
            Self::LostCriteria {
                kept,
                original,
                preview,
            } => write!(
                f,
                "the AI's rewrite lost too many criteria ({kept} of {original} kept). Got: \"{preview}\""
            ),
        }
    }
}

impl std::error::Error for RewriteError {}

/// The request that asks an AI to reword `rubric_text` for `leniency`.
/// `None` at the neutral setting, where there is nothing to rewrite.
pub fn leniency_rewrite_prompt(rubric_text: &str, leniency: i16) -> Option<String> {
    if leniency == NEUTRAL_LENIENCY {
        return None;
    }
    let lenient = leniency < NEUTRAL_LENIENCY;
    let direction = if lenient { "lenient" } else { "strict" };
    let percent = leniency.abs_diff(NEUTRAL_LENIENCY);
    let description = if lenient {
        format!(
            "{percent}% more lenient — make criteria easier to satisfy, accept vaguer answers, less precise terminology, partial understanding counts as meeting the criterion"
        )
    } else {
        format!(
            "{percent}% more strict — make criteria harder to satisfy, require precise terminology, exact formulas, explicit conditions, thorough explanation"
        )
    };
    Some(format!(
        "Rewrite the following rubric criteria to be {description}.\n\
         \n\
         RULES:\n\
         - Keep ALL \"## Category [N%]\" header lines EXACTLY the same\n\
         - Keep ALL point values in \"(Npts)\" EXACTLY the same\n\
         - Keep the EXACT same formatting structure (headers, line breaks)\n\
         - Rewrite ONLY the criterion description text to be more {direction}\n\
         - Return the COMPLETE rewritten rubric, not just changed parts\n\
         - Do NOT add explanations or commentary — return ONLY the rubric text\n\
         \n\
         ORIGINAL RUBRIC:\n\
         {rubric_text}\n\
         \n\
         REWRITTEN RUBRIC:"
    ))
}

/// Checks an AI's rewrite of `original` and returns the text to use.
///
/// A reply that kept fewer than 70% of the criteria lines is refused: the
/// model answered something other than the rubric.
pub fn accept_rewrite(original: &str, reply: &str) -> Result<String, RewriteError> {
    let trimmed = js::trim(reply);
    if trimmed.is_empty() {
        return Err(RewriteError::Empty);
    }
    let criteria = |text: &str| {
        text.split('\n')
            .filter(|line| CRITERION_LINE.is_match(line))
            .count()
    };
    let (kept, before) = (criteria(reply), criteria(original));
    if before > 0 && (kept as f64) < before as f64 * 0.7 {
        let squashed: String = trimmed.chars().take(300).collect::<String>();
        let preview = squashed.split_whitespace().collect::<Vec<_>>().join(" ");
        let ellipsis = if reply.chars().count() > 300 {
            "…"
        } else {
            ""
        };
        return Err(RewriteError::LostCriteria {
            kept,
            original: before,
            preview: format!("{preview}{ellipsis}"),
        });
    }
    Ok(trimmed.to_owned())
}

/// Puts back the `[N%]` weights of `original`'s category headers where the
/// rewrite dropped them.
pub fn restore_category_weights(rewritten: &str, original: &str) -> String {
    let mut weights: HashMap<String, &str> = HashMap::new();
    for line in original.split('\n') {
        if let Some(found) = CATEGORY_HEADER.captures(js::trim(line))
            && let Some(weight) = found.get(2)
        {
            weights.insert(js::trim(&found[1]).to_lowercase(), weight.as_str());
        }
    }
    if weights.is_empty() {
        return rewritten.to_owned();
    }
    rewritten
        .split('\n')
        .map(|line| {
            let Some(found) = CATEGORY_HEADER.captures(js::trim(line)) else {
                return line.to_owned();
            };
            let name = js::trim(&found[1]);
            match weights.get(&name.to_lowercase()) {
                Some(weight) if found.get(2).is_none() => {
                    // The original prints the number as JavaScript would.
                    let number = js::parse_float(weight);
                    format!("## {name} [{}%]", js::Json::Number(number).to_js_string())
                }
                _ => line.to_owned(),
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUBRIC: &str = "## Concept [60%]\nNames the theorem (0pts): States the CLT clearly.\nGives conditions (0pts): Large n.\n\n## Communication [40%]\nVocabulary (0pts): Uses course terms.";

    #[test]
    fn there_is_nothing_to_rewrite_at_the_neutral_setting() {
        assert_eq!(leniency_rewrite_prompt(RUBRIC, 50), None);
    }

    #[test]
    fn the_prompt_names_the_direction_and_distance() {
        let lenient = leniency_rewrite_prompt(RUBRIC, 0).unwrap();
        assert!(lenient.starts_with(
            "Rewrite the following rubric criteria to be 50% more lenient — make criteria easier to satisfy"
        ));
        assert!(
            lenient.contains("- Rewrite ONLY the criterion description text to be more lenient\n")
        );
        assert!(lenient.contains(&format!("ORIGINAL RUBRIC:\n{RUBRIC}\n\nREWRITTEN RUBRIC:")));
        assert!(lenient.ends_with("REWRITTEN RUBRIC:"));

        let strict = leniency_rewrite_prompt(RUBRIC, 80).unwrap();
        assert!(strict.contains("to be 30% more strict — make criteria harder to satisfy"));
        assert!(strict.contains("to be more strict\n"));
    }

    #[test]
    fn a_usable_rewrite_is_trimmed_and_accepted() {
        let reply = format!("\n{}\n\n", RUBRIC.replace("clearly", "roughly"));
        let accepted = accept_rewrite(RUBRIC, &reply).unwrap();
        assert!(accepted.starts_with("## Concept [60%]"));
        assert!(accepted.contains("roughly"));
    }

    #[test]
    fn an_empty_or_gutted_rewrite_is_refused() {
        assert_eq!(accept_rewrite(RUBRIC, "  \n"), Err(RewriteError::Empty));
        // Two of three criteria lines is under the 70% floor.
        let two =
            "Sure! Here is the rubric:\nNames the theorem (0pts): a\nGives conditions (0pts): b";
        assert!(matches!(
            accept_rewrite(RUBRIC, two),
            Err(RewriteError::LostCriteria {
                kept: 2,
                original: 3,
                ..
            })
        ));
        // The point value may come back spelled differently.
        let all =
            "Names the theorem (0 points): a\nGives conditions (0 pt): b\nVocabulary ( 0pts ): c";
        assert_eq!(accept_rewrite(RUBRIC, all).unwrap(), all);
        // A rubric with no point lines cannot lose any.
        assert_eq!(
            accept_rewrite("Explain the CLT.", "Anything").unwrap(),
            "Anything"
        );
    }

    #[test]
    fn dropped_weights_are_put_back_on_matching_headers() {
        let rewritten = "## concept\nNames the theorem (0pts): Mentions the CLT.\n\n## Communication [40%]\nVocabulary (0pts): Some course terms.\n\n## New Section\nx";
        assert_eq!(
            restore_category_weights(rewritten, RUBRIC),
            "## concept [60%]\nNames the theorem (0pts): Mentions the CLT.\n\n## Communication [40%]\nVocabulary (0pts): Some course terms.\n\n## New Section\nx"
        );
        // Nothing to restore when the original had no weights.
        assert_eq!(
            restore_category_weights(rewritten, "## Concept\nx"),
            rewritten
        );
    }

    #[test]
    fn restored_weights_print_as_javascript_prints_numbers() {
        let original = "## A [33.4%]\nx\n## B [25.0%]\ny";
        assert_eq!(
            restore_category_weights("## A\nx\n## B\ny", original),
            "## A [33.4%]\nx\n## B [25%]\ny"
        );
    }
}
