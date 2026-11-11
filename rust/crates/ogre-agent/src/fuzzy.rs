//! Recovers from a selector that matches nothing by looking for the listed
//! element it most plausibly meant.
//!
//! A match is a guess. The caller marks it as one, and the agent never acts
//! on a guess without the teacher's approval.

use std::sync::LazyLock;

use regex::Regex;

use crate::page::PageElement;

/// How a fuzzy match was found, most trustworthy first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FuzzyStrategy {
    TextContent,
    PartialIdOrClass,
    AriaLabel,
    /// The first listed element with the selector's tag name.
    TagPosition,
}

impl FuzzyStrategy {
    pub const fn name(self) -> &'static str {
        match self {
            Self::TextContent => "text-content",
            Self::PartialIdOrClass => "partial-id-or-class",
            Self::AriaLabel => "aria-label",
            Self::TagPosition => "tag-position-heuristic",
        }
    }
}

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("pattern is a valid constant")
}

static TEXT_PATTERNS: LazyLock<[Regex; 4]> = LazyLock::new(|| {
    [
        regex(r#"(?i):has-text\(["']([^"']+)["']\)"#),
        regex(r#"(?i):text\(["']([^"']+)["']\)"#),
        regex(r#"(?i)\[(?:title|alt|placeholder|value)=["']([^"']+)["']\]"#),
        regex(r#"["']([^"']{2,})["']"#),
    ]
});
static ID: LazyLock<Regex> = LazyLock::new(|| regex(r"#([A-Za-z0-9_-]+)"));
static CLASS: LazyLock<Regex> = LazyLock::new(|| regex(r"\.([A-Za-z0-9_-]+)"));
static ARIA_LABEL: LazyLock<Regex> =
    LazyLock::new(|| regex(r#"(?i)\[aria-label=["']([^"']+)["']\]"#));
static TAG: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)^([a-z][a-z0-9]*)"));

fn capture<'a>(pattern: &Regex, selector: &'a str) -> Option<&'a str> {
    Some(pattern.captures(selector)?.get(1)?.as_str())
}

fn by_text<'a>(selector: &str, elements: &'a [PageElement]) -> Option<&'a PageElement> {
    let text = TEXT_PATTERNS
        .iter()
        .find_map(|pattern| capture(pattern, selector))?;
    let needle = text.to_lowercase();
    elements
        .iter()
        .find(|el| el.info.text.to_lowercase().contains(&needle))
}

fn by_id_or_class<'a>(selector: &str, elements: &'a [PageElement]) -> Option<&'a PageElement> {
    if let Some(id) = capture(&ID, selector) {
        let anchor = format!("#{id}");
        let found = elements.iter().find(|el| {
            el.info.id.as_deref().is_some_and(|own| own.contains(id))
                || el.selector.contains(&anchor)
        });
        if found.is_some() {
            return found;
        }
    }
    CLASS.captures_iter(selector).find_map(|class| {
        let class = class.get(1)?.as_str();
        let dotted = format!(".{class}");
        elements.iter().find(|el| {
            el.info.classes.iter().any(|own| own == class) || el.selector.contains(&dotted)
        })
    })
}

fn by_aria_label<'a>(selector: &str, elements: &'a [PageElement]) -> Option<&'a PageElement> {
    let needle = capture(&ARIA_LABEL, selector)?.to_lowercase();
    elements.iter().find(|el| {
        let own = el.selector.to_lowercase();
        own.contains("aria-label") && own.contains(&needle)
    })
}

fn by_tag_position<'a>(selector: &str, elements: &'a [PageElement]) -> Option<&'a PageElement> {
    let tag = capture(&TAG, selector)?.to_lowercase();
    elements.iter().find(|el| el.info.tag == tag)
}

/// Looks for the listed element a failed selector most plausibly meant. Tries
/// four strategies in order and returns the first hit.
pub fn find_fuzzy_match<'a>(
    failed_selector: &str,
    elements: &'a [PageElement],
) -> Option<(&'a PageElement, FuzzyStrategy)> {
    if failed_selector.is_empty() {
        return None;
    }
    type Strategy = for<'e> fn(&str, &'e [PageElement]) -> Option<&'e PageElement>;
    let strategies: [(Strategy, FuzzyStrategy); 4] = [
        (by_text, FuzzyStrategy::TextContent),
        (by_id_or_class, FuzzyStrategy::PartialIdOrClass),
        (by_aria_label, FuzzyStrategy::AriaLabel),
        (by_tag_position, FuzzyStrategy::TagPosition),
    ];
    strategies
        .into_iter()
        .find_map(|(find, strategy)| Some((find(failed_selector, elements)?, strategy)))
}

/// A short explanation of why a fuzzy match was chosen.
pub fn fuzzy_match_reason(
    failed_selector: &str,
    matched: &PageElement,
    strategy: FuzzyStrategy,
) -> String {
    let element = if let Some(id) = &matched.info.id {
        format!("#{id}")
    } else if !matched.info.text.is_empty() {
        format!("\"{}\"", first_chars(&matched.info.text, 40))
    } else {
        format!("<{}>[{}]", matched.info.tag, matched.ref_id)
    };
    format!(
        "Fuzzy matched via {}: selector \"{}\" → {element}",
        strategy.name(),
        first_chars(failed_selector, 60)
    )
}

fn first_chars(text: &str, count: usize) -> &str {
    match text.char_indices().nth(count) {
        Some((end, _)) => &text[..end],
        None => text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::page::ElementInfo;

    fn element(n: usize, tag: &str, selector: &str, text: &str) -> PageElement {
        PageElement {
            ref_id: format!("e{n}"),
            selector: selector.to_owned(),
            in_viewport: true,
            info: ElementInfo {
                tag: tag.to_owned(),
                text: text.to_owned(),
                ..ElementInfo::default()
            },
        }
    }

    fn page() -> Vec<PageElement> {
        let mut submit = element(1, "button", "#submit-form-btn", "Submit");
        submit.info.id = Some("submit-form-btn".into());
        let mut cancel = element(2, "button", "div > button:nth-of-type(2)", "Cancel order");
        cancel.info.classes = vec!["btn".into(), "btn-cancel".into()];
        let search = element(3, "input", "input[aria-label=\"Search students\"]", "");
        let link = element(4, "a", "a.nav-home", "Home");
        vec![submit, cancel, search, link]
    }

    #[test]
    fn matches_by_text_first() {
        let page = page();
        let (found, strategy) = find_fuzzy_match("button:has-text(\"cancel\")", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e2", FuzzyStrategy::TextContent)
        );

        let (found, strategy) = find_fuzzy_match("a[title='home']", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e4", FuzzyStrategy::TextContent)
        );
    }

    #[test]
    fn matches_by_partial_id_then_by_class() {
        let page = page();
        let (found, strategy) = find_fuzzy_match("#submit", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e1", FuzzyStrategy::PartialIdOrClass)
        );
        // The class is known from the element even though its selector is positional.
        let (found, strategy) = find_fuzzy_match("span.btn-cancel", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e2", FuzzyStrategy::PartialIdOrClass)
        );
    }

    #[test]
    fn matches_by_aria_label() {
        let page = page();
        // The quoted label is first tried as text, which nothing contains.
        let (found, strategy) =
            find_fuzzy_match("textarea[aria-label=\"search students\"]", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e3", FuzzyStrategy::AriaLabel)
        );
    }

    #[test]
    fn falls_back_to_the_first_element_with_the_same_tag() {
        let page = page();
        let (found, strategy) = find_fuzzy_match("button[data-x]", &page).unwrap();
        assert_eq!(
            (found.ref_id.as_str(), strategy),
            ("e1", FuzzyStrategy::TagPosition)
        );
    }

    #[test]
    fn gives_up_when_nothing_is_close() {
        let page = page();
        assert_eq!(find_fuzzy_match("select[data-x]", &page), None);
        assert_eq!(find_fuzzy_match("", &page), None);
        assert_eq!(find_fuzzy_match("button", &[]), None);
    }

    #[test]
    fn explains_a_match() {
        let page = page();
        assert_eq!(
            fuzzy_match_reason("#submit", &page[0], FuzzyStrategy::PartialIdOrClass),
            "Fuzzy matched via partial-id-or-class: selector \"#submit\" → #submit-form-btn"
        );
        assert_eq!(
            fuzzy_match_reason("a.x", &page[3], FuzzyStrategy::TagPosition),
            "Fuzzy matched via tag-position-heuristic: selector \"a.x\" → \"Home\""
        );
        assert_eq!(
            fuzzy_match_reason("input.x", &page[2], FuzzyStrategy::TagPosition),
            "Fuzzy matched via tag-position-heuristic: selector \"input.x\" → <input>[e3]"
        );
    }
}
