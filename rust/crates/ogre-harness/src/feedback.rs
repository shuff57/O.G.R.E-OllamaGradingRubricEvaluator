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
/// lines, no markup. What the student reads is what was written: nothing is
/// escaped, so maths and underscores come through as they are.
pub fn plain_text(html: &str) -> String {
    to_text(html, false)
}

/// Feedback as text a teacher can edit without losing its shape: as
/// [`plain_text`], with `**bold**` and `*emphasis*` marked. Put it back with
/// [`html_from_text`].
pub fn editable_text(html: &str) -> String {
    to_text(html, true)
}

/// The tags [`to_text`] gives a shape in text. Others are dropped and their
/// words kept.
const TEXT_TAGS: [&str; 10] = [
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "blockquote",
    "strong",
    "b",
    "em",
    "i",
];

/// Text in the making: finished blocks, and the one being written.
#[derive(Default)]
struct Blocks {
    /// Each with whether it follows the one before without a blank line.
    done: Vec<(String, bool)>,
    current: String,
    /// What the next block starts with, such as a list marker.
    prefix: String,
    tight: bool,
    /// How many quotations the block is inside.
    quoted: usize,
}

impl Blocks {
    fn end_block(&mut self) {
        let lines: Vec<&str> = self
            .current
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        if lines.is_empty() {
            self.current.clear();
            return;
        }
        let quote = "> ".repeat(self.quoted);
        let mut block = String::new();
        for (at, line) in lines.iter().enumerate() {
            if at > 0 {
                block.push('\n');
            }
            block.push_str(&quote);
            if at == 0 {
                block.push_str(&self.prefix);
            }
            block.push_str(line);
        }
        self.done.push((block, self.tight));
        self.current.clear();
        self.prefix.clear();
        self.tight = false;
    }

    /// Closes a mark such as `**`, keeping it against the words it marks.
    fn close_mark(&mut self, mark: &str) {
        let words = self.current.trim_end().len();
        let space = self.current.len() > words;
        self.current.truncate(words);
        self.current.push_str(mark);
        if space {
            self.current.push(' ');
        }
    }

    fn finish(mut self) -> String {
        self.end_block();
        let mut text = String::new();
        for (at, (block, tight)) in self.done.iter().enumerate() {
            if at > 0 {
                text.push_str(if *tight { "\n" } else { "\n\n" });
            }
            text.push_str(block);
        }
        text
    }
}

fn to_text(html: &str, marks: bool) -> String {
    let html = clean(html, &TEXT_TAGS);
    let mut out = Blocks::default();
    // One entry per open list: whether it is numbered, and how many items
    // it has had.
    let mut lists: Vec<(bool, usize)> = Vec::new();
    // A mark was just opened: the space after it belongs before it.
    let mut opened: Option<&str> = None;
    let mut rest = html.as_str();
    while !rest.is_empty() {
        let Some(tag_at) = rest.find('<') else {
            push_words(&mut out, rest, &mut opened);
            break;
        };
        push_words(&mut out, &rest[..tag_at], &mut opened);
        let Some(tag_end) = rest[tag_at..].find('>') else {
            break;
        };
        let tag = &rest[tag_at + 1..tag_at + tag_end];
        rest = &rest[tag_at + tag_end + 1..];
        let (closing, name) = match tag.strip_prefix('/') {
            Some(name) => (true, name),
            None => (false, tag),
        };
        let name = name
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or_default();
        match (name, closing) {
            ("br", _) => out.current.push('\n'),
            ("p", _) => out.end_block(),
            ("blockquote", false) => {
                out.end_block();
                out.quoted += 1;
            }
            ("blockquote", true) => {
                out.end_block();
                out.quoted = out.quoted.saturating_sub(1);
            }
            ("ul" | "ol", false) => {
                out.end_block();
                lists.push((name == "ol", 0));
            }
            ("ul" | "ol", true) => {
                out.end_block();
                lists.pop();
            }
            ("li", false) => {
                out.end_block();
                let depth = lists.len().saturating_sub(1);
                let indent = "  ".repeat(depth);
                let count = match lists.last_mut() {
                    Some((numbered, count)) => {
                        *count += 1;
                        out.prefix = if *numbered {
                            format!("{indent}{count}. ")
                        } else {
                            format!("{indent}- ")
                        };
                        *count
                    }
                    // An item outside any list is still an item.
                    None => {
                        out.prefix = "- ".to_owned();
                        1
                    }
                };
                // Items stand on lines of their own, with no blank between:
                // only the first of an outermost list has one before it.
                out.tight = count > 1 || depth > 0;
            }
            ("li", true) => out.end_block(),
            ("strong" | "b", closing) if marks => {
                if closing {
                    out.close_mark("**");
                } else {
                    out.current.push_str("**");
                    opened = Some("**");
                }
            }
            ("em" | "i", closing) if marks => {
                if closing {
                    out.close_mark("*");
                } else {
                    out.current.push('*');
                    opened = Some("*");
                }
            }
            _ => {}
        }
    }
    out.finish()
}

/// Adds the words between two tags, with runs of space as one space and
/// character references as the characters they stand for.
fn push_words(out: &mut Blocks, words: &str, opened: &mut Option<&str>) {
    if words.is_empty() {
        return;
    }
    let mut text = String::with_capacity(words.len());
    let mut spaced = false;
    for c in words.chars() {
        if c.is_whitespace() && c != '\u{a0}' {
            spaced = true;
        } else {
            if spaced {
                text.push(' ');
            }
            spaced = false;
            text.push(c);
        }
    }
    if spaced {
        text.push(' ');
    }
    let text = text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace('\u{a0}', " ")
        .replace("&amp;", "&");
    if let Some(mark) = opened.take()
        && let Some(words) = text.strip_prefix(' ')
    {
        // "<b> word</b>" is " **word**", not "** word**".
        let at = out.current.len() - mark.len();
        out.current.insert(at, ' ');
        out.current.push_str(words);
        return;
    }
    out.current.push_str(&text);
}

/// One line of text as HTML: `**bold**` and `*emphasis*` become tags, and
/// everything else is the characters it is.
fn inline_html(line: &str) -> String {
    use std::sync::LazyLock;

    use regex::Regex;
    static BOLD: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\*\*([^\s*](?:[^*]*[^\s*])?)\*\*").expect("pattern is valid")
    });
    // An asterisk that opens emphasis starts a word and the one that closes
    // it ends one, so that "3 * 4" and "a*b*c" stay as they are.
    static EMPHASIS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(^|[\s(\["'>])\*([^\s*](?:[^*]*[^\s*])?)\*($|[\s.,;:!?)\]"'<])"#)
            .expect("pattern is valid")
    });
    let escaped = line
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let mut html = BOLD
        .replace_all(&escaped, "<strong>$1</strong>")
        .into_owned();
    // One that ends where the next begins is found on the next pass.
    loop {
        let next = EMPHASIS.replace_all(&html, "$1<em>$2</em>$3").into_owned();
        if next == html {
            return html;
        }
        html = next;
    }
}

/// What a line of edited feedback starts.
enum Line<'a> {
    Blank,
    Bullet(&'a str),
    Numbered(usize, &'a str),
    Quoted(&'a str),
    Words,
}

fn line_kind(line: &str) -> Line<'_> {
    let line = line.trim();
    if line.is_empty() {
        return Line::Blank;
    }
    for bullet in ["- ", "* ", "\u{2022} "] {
        if let Some(item) = line.strip_prefix(bullet) {
            return Line::Bullet(item.trim_start());
        }
    }
    if let Some(quoted) = line.strip_prefix('>') {
        return Line::Quoted(quoted.trim_start());
    }
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if (1..=3).contains(&digits)
        && let Some(item) = line[digits..]
            .strip_prefix(". ")
            .or_else(|| line[digits..].strip_prefix(") "))
        && let Ok(number) = line[..digits].parse()
    {
        return Line::Numbered(number, item.trim_start());
    }
    Line::Words
}

/// Edited feedback as HTML: the inverse of [`editable_text`].
///
/// A blank line ends a paragraph. Lines that start with `- ` are a list, as
/// are lines numbered from 1 upward; lines that start with `>` are a
/// quotation. Nothing in the text can become any other markup.
pub fn html_from_text(text: &str) -> String {
    enum Open {
        Nothing,
        Paragraph(Vec<String>),
        List { numbered: bool, items: Vec<String> },
        Quotation(Vec<String>),
    }
    fn close(open: &mut Open, html: &mut String) {
        match std::mem::replace(open, Open::Nothing) {
            Open::Nothing => {}
            Open::Paragraph(lines) => *html += &format!("<p>{}</p>", lines.join("<br>")),
            Open::Quotation(lines) => {
                *html += &format!("<blockquote><p>{}</p></blockquote>", lines.join("<br>"));
            }
            Open::List { numbered, items } => {
                let tag = if numbered { "ol" } else { "ul" };
                let items: String = items
                    .iter()
                    .map(|item| format!("<li>{item}</li>"))
                    .collect();
                *html += &format!("<{tag}>{items}</{tag}>");
            }
        }
    }

    let mut html = String::new();
    let mut open = Open::Nothing;
    for line in text.lines() {
        match (line_kind(line), &mut open) {
            (Line::Blank, _) => close(&mut open, &mut html),
            (
                Line::Bullet(item),
                Open::List {
                    numbered: false,
                    items,
                },
            ) => items.push(inline_html(item)),
            (Line::Bullet(item), _) => {
                close(&mut open, &mut html);
                open = Open::List {
                    numbered: false,
                    items: vec![inline_html(item)],
                };
            }
            // A numbered list counts from 1. "2. " on its own is a sentence
            // that happens to start with a number.
            (
                Line::Numbered(number, item),
                Open::List {
                    numbered: true,
                    items,
                },
            ) if number == items.len() + 1 => items.push(inline_html(item)),
            (Line::Numbered(1, item), _) => {
                close(&mut open, &mut html);
                open = Open::List {
                    numbered: true,
                    items: vec![inline_html(item)],
                };
            }
            (Line::Quoted(words), Open::Quotation(lines)) => lines.push(inline_html(words)),
            (Line::Quoted(words), _) => {
                close(&mut open, &mut html);
                open = Open::Quotation(vec![inline_html(words)]);
            }
            (Line::Numbered(..) | Line::Words, open) => {
                let words = inline_html(line.trim());
                match open {
                    Open::Paragraph(lines) => lines.push(words),
                    // A line under a list item carries the item on.
                    Open::List { items, .. } => {
                        if let Some(item) = items.last_mut() {
                            *item += &format!("<br>{words}");
                        }
                    }
                    _ => {
                        close(open, &mut html);
                        *open = Open::Paragraph(vec![words]);
                    }
                }
            }
        }
    }
    close(&mut open, &mut html);
    html
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

    const TYPICAL: &str = "<p>Hi Kai,</p><ul><li><strong>Concept:</strong> Correct. You named the standard error.</li><li><strong>Direction:</strong> Missing. Say that it <em>shrinks</em>.</li></ul><p>Good start.</p>";

    #[test]
    fn editable_text_keeps_the_shape_and_gives_it_back() {
        let text = editable_text(TYPICAL);
        assert_eq!(
            text,
            "Hi Kai,\n\n- **Concept:** Correct. You named the standard error.\n- **Direction:** Missing. Say that it *shrinks*.\n\nGood start."
        );
        assert_eq!(html_from_text(&text), TYPICAL);

        // An edit changes the words it changes and nothing else.
        let edited = text.replace("Good start.", "Good start, Kai.");
        assert_eq!(
            html_from_text(&edited),
            TYPICAL.replace("Good start.", "Good start, Kai.")
        );
    }

    #[test]
    fn maths_and_odd_characters_are_left_exactly_as_written() {
        let html = "<p>x_1 * y_2 and \\( a^2 \\) and $5 * 3$, a*b*c, 2 &lt; 3 &amp; 4 &gt; 1</p>";
        let text = "x_1 * y_2 and \\( a^2 \\) and $5 * 3$, a*b*c, 2 < 3 & 4 > 1";
        assert_eq!(editable_text(html), text);
        assert_eq!(plain_text(html), text);
        assert_eq!(html_from_text(text), html);
    }

    #[test]
    fn plain_text_has_no_marks_and_no_escapes() {
        assert_eq!(
            plain_text(TYPICAL),
            "Hi Kai,\n\n- Concept: Correct. You named the standard error.\n- Direction: Missing. Say that it shrinks.\n\nGood start."
        );
        assert_eq!(
            plain_text("<p>a<br>b</p><ol><li>one</li><li>two</li></ol>"),
            "a\nb\n\n1. one\n2. two"
        );
        assert_eq!(
            plain_text("<blockquote><p>As you wrote</p></blockquote><p>Yes.</p>"),
            "> As you wrote\n\nYes."
        );
        assert_eq!(
            plain_text("<p>Hi<script>alert(1)</script> there</p>"),
            "Hi there"
        );
    }

    #[test]
    fn marks_sit_against_their_words() {
        assert_eq!(
            editable_text("<p><strong>Score: </strong>8</p>"),
            "**Score:** 8"
        );
        assert_eq!(
            editable_text("<p>It<b> shrinks</b>.</p>"),
            "It **shrinks**."
        );
        assert_eq!(
            html_from_text("**Score:** 8, *nearly* there, *one* *two*"),
            "<p><strong>Score:</strong> 8, <em>nearly</em> there, <em>one</em> <em>two</em></p>"
        );
    }

    #[test]
    fn edited_text_can_only_become_plain_formatting() {
        assert_eq!(
            html_from_text("<script>alert(1)</script>\n<b onclick=x>hi</b>"),
            "<p>&lt;script&gt;alert(1)&lt;/script&gt;<br>&lt;b onclick=x&gt;hi&lt;/b&gt;</p>"
        );
        assert_eq!(html_from_text("  \n\n"), "");
    }

    #[test]
    fn lists_quotations_and_lines_come_back_as_they_were_typed() {
        assert_eq!(
            html_from_text(
                "First line\nsecond line\n\n1. one\n2. two\n\n> quoted\n\n- a\n  carried on\n- b"
            ),
            "<p>First line<br>second line</p><ol><li>one</li><li>two</li></ol><blockquote><p>quoted</p></blockquote><ul><li>a<br>carried on</li><li>b</li></ul>"
        );
        // A sentence that starts with a number is not a list.
        assert_eq!(
            html_from_text("2. is the answer"),
            "<p>2. is the answer</p>"
        );
        assert_eq!(editable_text("<p>2. is the answer</p>"), "2. is the answer");
    }
}
