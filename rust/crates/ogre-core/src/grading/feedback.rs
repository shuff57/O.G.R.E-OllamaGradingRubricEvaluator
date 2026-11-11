//! Clean-up and checks applied to the feedback text an AI returns.

use std::sync::LazyLock;

use regex::Regex;

use super::js::{self, WS};
use super::pattern;

static GREETING: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"(?i-u:<p>){WS}*(?i-u:Hi|Hello){WS}+[^<]*?(?i-u:</p>)"
    ))
});
static HTML_TAG: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u:<(?:p|strong|blockquote|em)\b)"));
static BOLD: LazyLock<Regex> = LazyLock::new(|| pattern(r"\*\*([^*\n]+)\*\*"));
// The original's `^` is multiline, and JavaScript ends a line at any of
// these four characters.
static QUOTE_LINE: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"(?:^|[\n\r\x{{2028}}\x{{2029}}]){WS}*>{WS}+")));

static TO_IMPROVE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r"(?i-u:<em>){WS}*(?i-u:To improve:){WS}*((?s:.)*?)(?i-u:</em>)"
    ))
});
static TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"<[^>]+>"));
static BLOCKQUOTE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?i-u:<blockquote)(?s:.)*?(?i-u:</blockquote>)"));
static NEGATIVE_VERDICT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u:\b(?:incorrect|partial(?:ly)?|incomplete|not correct|not fully|missing|did not|didn't|does not|doesn't|wrong|error|rather than|instead of)\b)",
    )
});
static NON_ACTIONABLE_IMPROVEMENT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"^(?i-u:n/?a|none|nothing|no (?:specific )?improvements?(?: needed)?|keep (?:up|it up))[.!]?$",
    )
});
static NO_RESPONSE: LazyLock<Regex> = LazyLock::new(|| pattern("(?i-u:no response submitted)"));
static STRONG_TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i-u:<strong\b)"));

/// The student's first name from "Last, First" or "First Last".
pub fn extract_first_name(name: &str) -> &str {
    let raw = js::trim(name);
    let given = match raw.split_once(',') {
        Some((_, after_comma)) => js::trim(after_comma),
        None => raw,
    };
    given.split(js::is_whitespace).next().unwrap_or("")
}

/// Rewrites a leading "Hi <whatever>," paragraph to greet the student by
/// first name. Models echo the "Last, First" name from the student header.
pub(crate) fn normalize_greeting(html: &str, name: &str) -> String {
    let first_name = extract_first_name(name);
    let Some(greeting) = GREETING.find(html).filter(|_| !first_name.is_empty()) else {
        return html.to_owned();
    };
    let (start, end) = (greeting.start(), greeting.end());
    // The original passes the name through `String.replace`, which expands
    // `$` patterns in it.
    let replacement = js::expand_replacement(&format!("<p>Hi {first_name},</p>"), html, start, end);
    format!("{}{replacement}{}", &html[..start], &html[end..])
}

/// Converts markdown feedback to the HTML the prompt asked for. Some models
/// drop the HTML format on long inputs. Feedback that already has HTML tags,
/// or no markdown, is returned unchanged.
pub(crate) fn normalize_feedback_html(feedback: &str) -> String {
    if HTML_TAG.is_match(feedback) || !(BOLD.is_match(feedback) || QUOTE_LINE.is_match(feedback)) {
        return feedback.to_owned();
    }
    let mut html = String::new();
    for line in feedback.split('\n') {
        let line = js::trim(line);
        if line.is_empty() {
            continue;
        }
        let line = italicize(&BOLD.replace_all(line, "<strong>${1}</strong>"));
        let quoted = line
            .strip_prefix('>')
            .filter(|rest| rest.starts_with(js::is_whitespace));
        match quoted {
            Some(quote) => {
                html += &format!("<blockquote>{}</blockquote>", js::trim_start(quote));
            }
            None => html += &format!("<p>{line}</p>"),
        }
    }
    html
}

/// Turns `*text*` into `<em>text</em>`.
///
/// Written by hand because the original pattern,
/// `/(^|[^*])\*([^*\n]+)\*(?!\*)/g`, needs a lookahead.
fn italicize(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    let mut at_start = true;
    while let Some(c) = rest.chars().next() {
        let after_c = &rest[c.len_utf8()..];
        let matched = match emphasis(rest).filter(|_| at_start) {
            Some(found) => Some(("", found)),
            None if c != '*' => emphasis(after_c).map(|found| (&rest[..c.len_utf8()], found)),
            None => None,
        };
        at_start = false;
        match matched {
            Some((before, (text, remainder))) => {
                out += &format!("{before}<em>{text}</em>");
                rest = remainder;
            }
            None => {
                out.push(c);
                rest = after_c;
            }
        }
    }
    out
}

/// Matches `*text*` at the start of `s`, where the closing star is not
/// followed by another. Returns the text and what follows the closing star.
fn emphasis(s: &str) -> Option<(&str, &str)> {
    let body = s.strip_prefix('*')?;
    let len = body.find(['*', '\n']).filter(|&len| len > 0)?;
    let remainder = body[len..].strip_prefix('*')?;
    (!remainder.starts_with('*')).then_some((&body[..len], remainder))
}

/// True when the feedback names at least one concrete deficiency: a "To
/// improve" line that says something, or a negative verdict.
pub fn feedback_names_specific_deficiency(feedback: &str) -> bool {
    let actionable = TO_IMPROVE.captures_iter(feedback).any(|improvement| {
        let stripped = TAG.replace_all(&improvement[1], "");
        let text = js::trim(&stripped);
        !text.is_empty() && !NON_ACTIONABLE_IMPROVEMENT.is_match(text)
    });
    if actionable {
        return true;
    }
    // Only the grader's verdicts count: a student quote containing "instead
    // of" is not a finding.
    let without_quotes = BLOCKQUOTE.replace_all(feedback, " ");
    let verdicts = TAG.replace_all(&without_quotes, " ");
    NEGATIVE_VERDICT.is_match(&verdicts)
}

/// Raises a sub-maximum score to full credit when the per-requirement
/// feedback flags no deficiency: a deduction the feedback cannot explain is
/// not applied.
///
/// Empty submissions and feedback without requirement sections keep their
/// score, since those are legitimately below full credit.
pub fn reconcile_score_with_feedback(score: f64, feedback: &str, max_score: f64) -> f64 {
    let max = js::or_number(max_score, 10.0);
    let unexplained = score < max
        && !NO_RESPONSE.is_match(feedback)
        && STRONG_TAG.is_match(feedback)
        && !feedback_names_specific_deficiency(feedback);
    if unexplained { max } else { score }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_name_from_either_order() {
        assert_eq!(extract_first_name("Avery, Sam Lee"), "Sam");
        assert_eq!(extract_first_name("  Sam Avery "), "Sam");
        assert_eq!(extract_first_name("Avery,"), "");
        assert_eq!(extract_first_name("Avery, Jr., Sam"), "Jr.,");
        assert_eq!(extract_first_name(""), "");
    }

    #[test]
    fn greeting_is_rewritten_to_first_name() {
        assert_eq!(
            normalize_greeting("<p>Hi Avery, Sam,</p><p>Good.</p>", "Avery, Sam"),
            "<p>Hi Sam,</p><p>Good.</p>"
        );
        assert_eq!(
            normalize_greeting("<P> hello  there </P>rest", "Sam"),
            "<p>Hi Sam,</p>rest"
        );
        assert_eq!(normalize_greeting("<p>Hi,</p>", "Sam"), "<p>Hi,</p>");
        assert_eq!(normalize_greeting("<p>Hi you,</p>", ""), "<p>Hi you,</p>");
    }

    #[test]
    fn greeting_expands_dollar_patterns_like_the_original() {
        assert_eq!(
            normalize_greeting("<p>Hi x,</p>!", "$& $$"),
            "<p>Hi <p>Hi x,</p>,</p>!"
        );
    }

    #[test]
    fn markdown_feedback_becomes_html() {
        let markdown = "Hi Sam,\r\n\r\n**Explains light**\n> You said: \"light\"\nCorrect, *mostly*.\n*To improve: add detail*";
        assert_eq!(
            normalize_feedback_html(markdown),
            "<p>Hi Sam,</p><p><strong>Explains light</strong></p><blockquote>You said: \"light\"</blockquote><p>Correct, <em>mostly</em>.</p><p><em>To improve: add detail</em></p>"
        );
    }

    #[test]
    fn html_and_plain_feedback_are_left_alone() {
        let html = "<p>**kept**</p>";
        assert_eq!(normalize_feedback_html(html), html);
        assert_eq!(normalize_feedback_html("Good *work*."), "Good *work*.");
        assert_eq!(normalize_feedback_html("a > b"), "a > b");
    }

    #[test]
    fn quote_marker_after_a_carriage_return_counts_as_markdown() {
        assert_eq!(
            normalize_feedback_html("intro\r> quoted"),
            "<p>intro\r> quoted</p>"
        );
    }

    #[test]
    fn italics_respect_the_no_following_star_rule() {
        assert_eq!(italicize("*a*"), "<em>a</em>");
        assert_eq!(italicize("x *a* y *b*"), "x <em>a</em> y <em>b</em>");
        assert_eq!(italicize("**a**"), "**a**");
        assert_eq!(italicize("*a**"), "*a**");
        assert_eq!(italicize("2 * 3 * 4"), "2 <em> 3 </em> 4");
        assert_eq!(italicize("é*a*"), "é<em>a</em>");
        assert_eq!(italicize("**"), "**");
    }
}
