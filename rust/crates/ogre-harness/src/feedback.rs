//! Making AI-written feedback safe to put on someone's grading page.

use std::collections::HashSet;

/// Reduces feedback HTML to plain formatting: paragraphs, lists, emphasis.
/// Scripts, event handlers, links, images and styling are all dropped, so the
/// result can be inserted into a page the teacher is logged in to.
pub fn safe_html(html: &str) -> String {
    clean(
        html,
        &[
            "p",
            "br",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "ul",
            "ol",
            "li",
            "blockquote",
            "sub",
            "sup",
            "code",
        ],
    )
}

/// Feedback for a plain text box: paragraphs and list items on their own
/// lines, no markup.
pub fn plain_text(html: &str) -> String {
    let blocks_only = clean(html, &["p", "br", "ul", "ol", "li", "blockquote"]);
    htmd::convert(&blocks_only)
        .map(|text| text.trim().to_owned())
        .unwrap_or_else(|_| clean(html, &[]).trim().to_owned())
}

fn clean(html: &str, tags: &[&'static str]) -> String {
    ammonia::Builder::default()
        .tags(tags.iter().copied().collect())
        .generic_attributes(HashSet::new())
        .tag_attributes(Default::default())
        .link_rel(None)
        .clean(html)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_plain_formatting() {
        let html = "<p>Good work, <strong>Kai</strong>.</p><ul><li>Define SE</li></ul>";
        assert_eq!(safe_html(html), html);
    }

    #[test]
    fn drops_scripts_handlers_links_and_styles() {
        assert_eq!(
            safe_html("<p onclick=\"steal()\">Hi<script>alert(1)</script></p>"),
            "<p>Hi</p>"
        );
        assert_eq!(safe_html("<img src=x onerror=alert(1)>ok"), "ok");
        assert_eq!(
            safe_html("<a href=\"javascript:alert(1)\">click</a>"),
            "click"
        );
        assert_eq!(
            safe_html("<p style=\"position:fixed\">x</p><iframe src=\"//evil\"></iframe>"),
            "<p>x</p>"
        );
        assert_eq!(
            safe_html("<svg><script>alert(1)</script></svg>after"),
            "after"
        );
    }

    #[test]
    fn text_that_looks_like_markup_stays_text() {
        assert_eq!(
            safe_html("<p>if x &lt; 3 then y > 2</p>"),
            "<p>if x &lt; 3 then y &gt; 2</p>"
        );
    }

    #[test]
    fn plain_text_puts_blocks_on_their_own_lines() {
        assert_eq!(
            plain_text("<p>Good <strong>start</strong>.</p><p>Next: define SE.</p>"),
            "Good start.\n\nNext: define SE."
        );
        assert_eq!(
            plain_text("<p>x &lt; 3</p><script>alert(1)</script>"),
            "x < 3"
        );
    }
}
