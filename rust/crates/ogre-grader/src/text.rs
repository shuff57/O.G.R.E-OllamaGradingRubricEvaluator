//! Small text helpers that have to behave as JavaScript does, because the
//! grading server's prompts and parsers were written against it.

use ogre_core::StudentWork;

/// How much of an AI reply is quoted in a warning.
const SNIPPET_CHARS: usize = 120;

/// The characters JavaScript's `trim` and `\s` treat as whitespace. Unlike
/// Rust's, the set has U+FEFF and lacks U+0085.
pub(crate) const JS_WHITESPACE_CLASS: &str = r"[\t\n\x0B\x0C\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]";

fn is_js_whitespace(c: char) -> bool {
    c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
}

pub(crate) fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

pub(crate) fn is_blank(text: &str) -> bool {
    js_trim(text).is_empty()
}

/// A number as a JavaScript template literal prints it. Exact for the
/// scores and percentages this crate formats; JavaScript's exponent forms
/// for very large and very small magnitudes are not reproduced.
pub(crate) fn js_number(value: f64) -> String {
    if value == 0.0 {
        "0".to_owned()
    } else if value.is_infinite() {
        if value > 0.0 { "Infinity" } else { "-Infinity" }.to_owned()
    } else {
        value.to_string()
    }
}

/// The student's name, or "Student 7" for a student without one.
pub(crate) fn display_name(student: Option<&StudentWork>, index: usize) -> String {
    match student.map(|s| s.name.as_str()).filter(|n| !n.is_empty()) {
        Some(name) => name.to_owned(),
        None => format!("Student {index}"),
    }
}

/// The start of an AI reply on one line, for quoting in a warning.
pub(crate) fn snippet(reply: &str) -> String {
    let mut words = reply.split_whitespace();
    let Some(first) = words.next() else {
        return "(empty reply)".to_owned();
    };
    let mut line = first.to_owned();
    for word in words {
        line.push(' ');
        line.push_str(word);
    }
    match line.char_indices().nth(SNIPPET_CHARS) {
        Some((end, _)) => format!("{}…", &line[..end]),
        None => line,
    }
}

pub(crate) fn plural(count: usize, noun: &str) -> String {
    if count == 1 {
        format!("1 {noun}")
    } else {
        format!("{count} {noun}s")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_follows_javascript_trim() {
        assert!(is_blank(""));
        assert!(is_blank(" \t\r\n\u{a0}\u{feff}\u{2028}"));
        assert!(!is_blank("\u{85}"));
        assert!(!is_blank(" x "));
        assert_eq!(js_trim("\u{feff} a b \n"), "a b");
    }

    #[test]
    fn numbers_print_like_template_literals() {
        assert_eq!(js_number(10.0), "10");
        assert_eq!(js_number(3.8), "3.8");
        assert_eq!(js_number(12.5), "12.5");
        assert_eq!(js_number(-0.0), "0");
        assert_eq!(js_number(f64::NAN), "NaN");
        assert_eq!(js_number(f64::INFINITY), "Infinity");
    }

    #[test]
    fn snippets_are_one_short_line() {
        assert_eq!(snippet("  \n "), "(empty reply)");
        assert_eq!(
            snippet("I am\n  sorry,\tI cannot."),
            "I am sorry, I cannot."
        );
        let long = "é".repeat(200);
        let cut = snippet(&long);
        assert_eq!(cut.chars().count(), SNIPPET_CHARS + 1);
        assert!(cut.ends_with('…'));
    }

    #[test]
    fn nameless_students_get_a_numbered_name() {
        let student = StudentWork {
            index: 3,
            name: String::new(),
            response: String::new(),
            prompt: None,
        };
        assert_eq!(display_name(Some(&student), 3), "Student 3");
        assert_eq!(display_name(None, 9), "Student 9");
    }
}
