//! Reads the `---` block at the top of a skill file.
//!
//! Skill files use a small part of YAML: `key: value`, quoted strings, lists
//! written as `- item` lines or `[a, b]`, and `|` or `>` blocks. That part is
//! read here; a line that fits none of it is skipped, never an error.

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Field {
    Text(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct FrontMatter(Vec<(String, Field)>);

impl FrontMatter {
    fn get(&self, key: &str) -> Option<&Field> {
        self.0
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, field)| field)
    }

    /// A text value, trimmed; `None` if absent, empty or a list.
    pub(crate) fn text(&self, key: &str) -> Option<&str> {
        match self.get(key)? {
            Field::Text(text) => Some(text.trim()).filter(|text| !text.is_empty()),
            Field::List(_) => None,
        }
    }

    pub(crate) fn list(&self, key: &str) -> Option<&[String]> {
        match self.get(key)? {
            Field::List(items) => Some(items),
            Field::Text(_) => None,
        }
    }

    pub(crate) fn flag(&self, key: &str) -> Option<bool> {
        match self.text(key)?.to_ascii_lowercase().as_str() {
            "true" | "yes" | "on" => Some(true),
            "false" | "no" | "off" => Some(false),
            _ => None,
        }
    }
}

/// Splits a document into its front matter and the text after it. A document
/// that does not open with a `---` line, or never closes the block, has no
/// front matter and is all body.
pub(crate) fn split(raw: &str) -> (FrontMatter, &str) {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let Some(after_open) = text.strip_prefix("---").and_then(|rest| {
        rest.strip_prefix("\r\n")
            .or_else(|| rest.strip_prefix('\n'))
    }) else {
        return (FrontMatter::default(), raw);
    };

    let mut offset = 0;
    for line in after_open.split_inclusive('\n') {
        if line.trim_end() == "---" {
            let block = &after_open[..offset];
            let body = &after_open[offset + line.len()..];
            return (parse(block), body);
        }
        offset += line.len();
    }
    (FrontMatter::default(), raw)
}

fn parse(block: &str) -> FrontMatter {
    let lines: Vec<&str> = block.lines().collect();
    let mut fields = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        index += 1;
        let Some((key, rest)) = top_level_key(line) else {
            continue;
        };
        let rest = rest.trim();

        let field = if rest.is_empty() {
            let mut items = Vec::new();
            while let Some(item) = lines.get(index).and_then(|next| list_item(next)) {
                items.push(scalar(item));
                index += 1;
            }
            if items.is_empty() {
                Field::Text(String::new())
            } else {
                Field::List(items)
            }
        } else if let Some(inner) = rest.strip_prefix('[').and_then(|r| r.strip_suffix(']')) {
            Field::List(flow_items(inner))
        } else if matches!(rest, "|" | "|-" | "|+" | ">" | ">-" | ">+") {
            let mut block_lines = Vec::new();
            while let Some(next) = lines.get(index) {
                if !next.trim().is_empty() && !next.starts_with([' ', '\t']) {
                    break;
                }
                block_lines.push(next.trim());
                index += 1;
            }
            let joiner = if rest.starts_with('|') { "\n" } else { " " };
            Field::Text(block_lines.join(joiner).trim().to_owned())
        } else {
            Field::Text(scalar(rest))
        };
        fields.push((key.to_owned(), field));
    }
    FrontMatter(fields)
}

/// `key: rest` starting in the first column.
fn top_level_key(line: &str) -> Option<(&str, &str)> {
    if line.starts_with([' ', '\t', '#', '-']) {
        return None;
    }
    let (key, rest) = line.split_once(':')?;
    let valid = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    // `key:value` without a space is not a mapping in YAML.
    (valid && (rest.is_empty() || rest.starts_with([' ', '\t']))).then_some((key, rest))
}

fn list_item(line: &str) -> Option<&str> {
    let item = line.trim_start().strip_prefix('-')?;
    (item.is_empty() || item.starts_with(' ')).then(|| item.trim())
}

fn flow_items(inner: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    for ch in inner.chars() {
        match quote {
            Some(open) if ch == open => {
                quote = None;
                current.push(ch);
            }
            Some(_) => current.push(ch),
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                current.push(ch);
            }
            None if ch == ',' => items.push(std::mem::take(&mut current)),
            None => current.push(ch),
        }
    }
    items.push(current);
    items
        .iter()
        .map(|item| scalar(item.trim()))
        .filter(|item| !item.is_empty())
        .collect()
}

fn scalar(written: &str) -> String {
    let written = written.trim();
    if let Some(inner) = written
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
        .filter(|_| written.len() >= 2)
    {
        return unescape(inner);
    }
    if let Some(inner) = written
        .strip_prefix('\'')
        .and_then(|rest| rest.strip_suffix('\''))
        .filter(|_| written.len() >= 2)
    {
        return inner.replace("''", "'");
    }
    // An unquoted value ends at a comment.
    match written.find(" #") {
        Some(comment) => written[..comment].trim_end().to_owned(),
        None => written.to_owned(),
    }
}

fn unescape(inner: &str) -> String {
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(ch) = chars.next() {
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('u') => {
                let code: String = chars.by_ref().take(4).collect();
                match u32::from_str_radix(&code, 16).ok().and_then(char::from_u32) {
                    Some(decoded) => out.push(decoded),
                    None => out.push_str(&code),
                }
            }
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_scalars_lists_and_blocks() {
        let raw = "---\n\
                   name: \"MyOpenMath \\u2014 Knowledge Profile\"\n\
                   description: 'It''s a guide'   \n\
                   role: instructor # the teacher\n\
                   active: true\n\
                   # a comment\n\
                   urlPatterns:\n  - \"myopenmath.com\"\n  - mom.example.com\n\
                   tags: [grading, \"a, b\", ]\n\
                   empty: []\n\
                   notes: >\n  folded\n  text\n\
                   ---\n# Body\n";
        let (matter, body) = split(raw);
        assert_eq!(matter.text("name"), Some("MyOpenMath — Knowledge Profile"));
        assert_eq!(matter.text("description"), Some("It's a guide"));
        assert_eq!(matter.text("role"), Some("instructor"));
        assert_eq!(matter.flag("active"), Some(true));
        assert_eq!(
            matter.list("urlPatterns"),
            Some(&["myopenmath.com".to_owned(), "mom.example.com".to_owned()][..])
        );
        assert_eq!(
            matter.list("tags"),
            Some(&["grading".to_owned(), "a, b".to_owned()][..])
        );
        assert_eq!(matter.list("empty"), Some(&[][..]));
        assert_eq!(matter.text("notes"), Some("folded text"));
        assert_eq!(matter.text("missing"), None);
        assert_eq!(body, "# Body\n");
    }

    #[test]
    fn a_document_without_a_closed_block_is_all_body() {
        for raw in [
            "# Title\n\ntext",
            "---\nname: Broken\n- [unterminated\n\n# Header\nNot really structured",
            "--- not a delimiter\nname: x\n---\n",
            "",
        ] {
            let (matter, body) = split(raw);
            assert_eq!(matter, FrontMatter::default(), "{raw:?}");
            assert_eq!(body, raw);
        }
    }

    #[test]
    fn the_block_may_end_the_file_and_use_windows_line_endings() {
        let (matter, body) = split("---\nname: Name Only\n---");
        assert_eq!(matter.text("name"), Some("Name Only"));
        assert_eq!(body, "");

        let (matter, body) =
            split("---\r\nname: Win\r\nurlPatterns:\r\n  - a.com\r\n---\r\nBody\r\n");
        assert_eq!(matter.text("name"), Some("Win"));
        assert_eq!(matter.list("urlPatterns"), Some(&["a.com".to_owned()][..]));
        assert_eq!(body, "Body\r\n");
    }

    #[test]
    fn lines_it_does_not_understand_are_skipped() {
        let (matter, _) = split("---\nname: Kept\n  stray: indented\n???\nurl:https://x\n---\n");
        assert_eq!(matter.text("name"), Some("Kept"));
        assert_eq!(matter.text("stray"), None);
        assert_eq!(matter.text("url"), None);
    }
}
