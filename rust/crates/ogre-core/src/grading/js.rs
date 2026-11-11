//! JavaScript semantics the grading logic was tuned against.
//!
//! The prompts and score maths were ported from JavaScript, where rounding,
//! number formatting, whitespace and string lengths all differ slightly from
//! Rust's defaults. Everything that has to match lives here.

use std::borrow::Cow;
use std::fmt;

/// `Math.round`: halves go toward positive infinity, where `f64::round` sends
/// them away from zero.
pub(crate) fn round(x: f64) -> f64 {
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// `Math.round(x * steps) / steps`.
pub(crate) fn round_to(x: f64, steps: f64) -> f64 {
    round(x * steps) / steps
}

/// `parseFloat(x.toFixed(2))`. `toFixed` breaks exact ties upward in
/// magnitude; Rust's formatter breaks them to even.
pub(crate) fn to_fixed_2(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    // A double sits exactly halfway between two hundredths only when it is an
    // odd number of eighths.
    let eighths = x.abs() * 8.0;
    if eighths.fract() == 0.0 && eighths % 2.0 == 1.0 {
        return ((x.abs() * 100.0).floor() + 1.0) / 100.0 * x.signum();
    }
    format!("{x:.2}").parse().unwrap_or(x)
}

/// `x || fallback` for numbers: zero and NaN are falsy.
pub(crate) fn or_number(x: f64, fallback: f64) -> f64 {
    if x.is_nan() || x == 0.0 { fallback } else { x }
}

/// Formats a number the way JavaScript string interpolation does.
pub(crate) struct Num(pub f64);

impl fmt::Display for Num {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let x = self.0;
        if x.is_nan() {
            return f.write_str("NaN");
        }
        if x.is_infinite() {
            return f.write_str(if x > 0.0 { "Infinity" } else { "-Infinity" });
        }
        if x == 0.0 {
            return f.write_str("0");
        }
        let magnitude = x.abs();
        if (1e-6..1e21).contains(&magnitude) {
            return write!(f, "{x}");
        }
        let scientific = format!("{x:e}");
        match scientific.split_once('e') {
            Some((mantissa, exponent)) if !exponent.starts_with('-') => {
                write!(f, "{mantissa}e+{exponent}")
            }
            _ => f.write_str(&scientific),
        }
    }
}

/// Characters `String.prototype.trim` and the regex class `\s` treat as
/// whitespace. Unlike Rust's `char::is_whitespace` this includes U+FEFF and
/// excludes U+0085.
pub(crate) fn is_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// The same set as [`is_whitespace`], as a regex character class.
pub(crate) const WS: &str = r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

pub(crate) fn trim(s: &str) -> &str {
    s.trim_matches(is_whitespace)
}

pub(crate) fn trim_start(s: &str) -> &str {
    s.trim_start_matches(is_whitespace)
}

/// `parseFloat`: reads the longest numeric prefix and gives NaN when there is
/// none.
pub(crate) fn parse_float(s: &str) -> f64 {
    let s = trim_start(s);
    let bytes = s.as_bytes();
    let digits_from = |mut i: usize| {
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        i
    };

    let sign_len = usize::from(matches!(bytes.first(), Some(b'+' | b'-')));
    if s[sign_len..].starts_with("Infinity") {
        return if bytes[0] == b'-' {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
    }

    let mut end = digits_from(sign_len);
    let int_digits = end - sign_len;
    let mut frac_digits = 0;
    if bytes.get(end) == Some(&b'.') {
        let frac_end = digits_from(end + 1);
        frac_digits = frac_end - end - 1;
        if int_digits + frac_digits > 0 {
            end = frac_end;
        }
    }
    if int_digits + frac_digits == 0 {
        return f64::NAN;
    }
    if matches!(bytes.get(end), Some(b'e' | b'E')) {
        let exp_start = end + 1 + usize::from(matches!(bytes.get(end + 1), Some(b'+' | b'-')));
        let exp_end = digits_from(exp_start);
        if exp_end > exp_start {
            end = exp_end;
        }
    }
    s[..end].parse().unwrap_or(f64::NAN)
}

/// `s.length`: UTF-16 code units, not bytes or chars.
pub(crate) fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `s.substring(0, max_units)`. JavaScript can cut a character outside the
/// Basic Multilingual Plane in half; a Rust string cannot hold the half, so it
/// becomes U+FFFD.
pub(crate) fn utf16_prefix(s: &str, max_units: usize) -> Cow<'_, str> {
    let mut units = 0;
    for (at, c) in s.char_indices() {
        let width = c.len_utf16();
        if units + width > max_units {
            if units == max_units {
                return Cow::Borrowed(&s[..at]);
            }
            return Cow::Owned(format!("{}\u{FFFD}", &s[..at]));
        }
        units += width;
    }
    Cow::Borrowed(s)
}

/// Expands the `$` patterns `String.prototype.replace` honours in a
/// replacement string, for a pattern with no capture groups.
pub(crate) fn expand_replacement(
    template: &str,
    haystack: &str,
    start: usize,
    end: usize,
) -> String {
    let mut out = String::with_capacity(template.len());
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '$' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('$') => out.push('$'),
            Some('&') => out.push_str(&haystack[start..end]),
            Some('`') => out.push_str(&haystack[..start]),
            Some('\'') => out.push_str(&haystack[end..]),
            _ => {
                out.push('$');
                continue;
            }
        }
        chars.next();
    }
    out
}

/// The index a property key denotes if JavaScript would treat it as an array
/// index, which decides where it sorts among an object's keys.
fn array_index(key: &str) -> Option<u32> {
    let canonical =
        key == "0" || (!key.starts_with('0') && key.bytes().all(|b| b.is_ascii_digit()));
    if !canonical {
        return None;
    }
    key.parse().ok().filter(|&n| n != u32::MAX)
}

/// Puts entries in the order `Object.entries` yields them: a repeated key
/// keeps its first position and last value, and integer-like keys come first
/// in ascending order.
pub(crate) fn object_order<V>(entries: Vec<(String, V)>) -> Vec<(String, V)> {
    let mut unique: Vec<(String, V)> = Vec::with_capacity(entries.len());
    for (key, value) in entries {
        match unique.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = value,
            None => unique.push((key, value)),
        }
    }
    if unique.iter().any(|(k, _)| array_index(k).is_some()) {
        unique.sort_by_key(|(k, _)| array_index(k).map_or((1, 0), |n| (0, n)));
    }
    unique
}

/// A parsed JSON value that keeps object keys in JavaScript's order, so that
/// sums over an AI response's `criterion_scores` add up in the same order.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

static NULL: Json = Json::Null;

impl Json {
    /// `JSON.parse`, with `None` where it throws.
    ///
    /// Written by hand so that it accepts exactly what JavaScript accepts:
    /// numbers too large for a double become infinity rather than an error.
    /// Two things differ. An unpaired `\u` surrogate escape becomes U+FFFD,
    /// since a Rust string cannot hold it, and nesting deeper than
    /// [`MAX_DEPTH`] is rejected to keep the stack bounded.
    pub(crate) fn parse(text: &str) -> Option<Json> {
        let mut parser = Parser {
            rest: text,
            depth: 0,
        };
        let value = parser.value()?;
        parser.skip_whitespace();
        parser.rest.is_empty().then_some(value)
    }

    /// Property access. A missing property reads as null, which is as falsy
    /// and as unparseable as JavaScript's `undefined`.
    pub(crate) fn get(&self, key: &str) -> &Json {
        match self {
            Json::Object(entries) => entries
                .iter()
                .find(|(k, _)| k == key)
                .map_or(&NULL, |(_, v)| v),
            _ => &NULL,
        }
    }

    pub(crate) fn is_truthy(&self) -> bool {
        match self {
            Json::Null => false,
            Json::Bool(b) => *b,
            Json::Number(n) => !n.is_nan() && *n != 0.0,
            Json::String(s) => !s.is_empty(),
            Json::Array(_) | Json::Object(_) => true,
        }
    }

    /// `String(value)`.
    pub(crate) fn to_js_string(&self) -> String {
        match self {
            Json::Null => "null".to_owned(),
            Json::Bool(b) => b.to_string(),
            Json::Number(n) => Num(*n).to_string(),
            Json::String(s) => s.clone(),
            Json::Array(items) => Json::join(items, ","),
            Json::Object(_) => "[object Object]".to_owned(),
        }
    }

    /// `items.join(separator)`: null elements become empty strings.
    pub(crate) fn join(items: &[Json], separator: &str) -> String {
        items
            .iter()
            .map(|item| match item {
                Json::Null => String::new(),
                other => other.to_js_string(),
            })
            .collect::<Vec<_>>()
            .join(separator)
    }

    /// `parseFloat(value)`.
    pub(crate) fn parse_float(&self) -> f64 {
        match self {
            Json::Number(n) => *n,
            other => parse_float(&other.to_js_string()),
        }
    }

    /// `Object.entries(value)` for objects and arrays.
    pub(crate) fn entries(&self) -> Vec<(Cow<'_, str>, &Json)> {
        match self {
            Json::Object(entries) => entries
                .iter()
                .map(|(k, v)| (Cow::Borrowed(k.as_str()), v))
                .collect(),
            Json::Array(items) => items
                .iter()
                .enumerate()
                .map(|(i, v)| (Cow::Owned(i.to_string()), v))
                .collect(),
            _ => Vec::new(),
        }
    }
}

const MAX_DEPTH: usize = 128;

struct Parser<'a> {
    rest: &'a str,
    depth: usize,
}

impl Parser<'_> {
    fn skip_whitespace(&mut self) {
        self.rest = self.rest.trim_start_matches([' ', '\t', '\n', '\r']);
    }

    fn eat(&mut self, token: &str) -> Option<()> {
        self.rest = self.rest.strip_prefix(token)?;
        Some(())
    }

    fn value(&mut self) -> Option<Json> {
        self.skip_whitespace();
        match self.rest.as_bytes().first()? {
            b'n' => self.eat("null").map(|()| Json::Null),
            b't' => self.eat("true").map(|()| Json::Bool(true)),
            b'f' => self.eat("false").map(|()| Json::Bool(false)),
            b'"' => self.string().map(Json::String),
            b'[' => self.nested(Self::array),
            b'{' => self.nested(Self::object),
            _ => self.number(),
        }
    }

    fn nested(&mut self, parse: fn(&mut Self) -> Option<Json>) -> Option<Json> {
        if self.depth == MAX_DEPTH {
            return None;
        }
        self.depth += 1;
        let value = parse(self);
        self.depth -= 1;
        value
    }

    fn array(&mut self) -> Option<Json> {
        self.eat("[")?;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.eat("]").is_some() {
            return Some(Json::Array(items));
        }
        loop {
            items.push(self.value()?);
            self.skip_whitespace();
            if self.eat("]").is_some() {
                return Some(Json::Array(items));
            }
            self.eat(",")?;
        }
    }

    fn object(&mut self) -> Option<Json> {
        self.eat("{")?;
        let mut entries = Vec::new();
        self.skip_whitespace();
        if self.eat("}").is_some() {
            return Some(Json::Object(entries));
        }
        loop {
            self.skip_whitespace();
            let key = self.string()?;
            self.skip_whitespace();
            self.eat(":")?;
            entries.push((key, self.value()?));
            self.skip_whitespace();
            if self.eat("}").is_some() {
                return Some(Json::Object(object_order(entries)));
            }
            self.eat(",")?;
        }
    }

    fn number(&mut self) -> Option<Json> {
        let bytes = self.rest.as_bytes();
        let digits_from = |mut i: usize| {
            while bytes.get(i).is_some_and(u8::is_ascii_digit) {
                i += 1;
            }
            i
        };

        let int_start = usize::from(bytes.first() == Some(&b'-'));
        let mut end = digits_from(int_start);
        let leading_zero = bytes.get(int_start) == Some(&b'0');
        if end == int_start || (leading_zero && end > int_start + 1) {
            return None;
        }
        if bytes.get(end) == Some(&b'.') {
            let frac_end = digits_from(end + 1);
            if frac_end == end + 1 {
                return None;
            }
            end = frac_end;
        }
        if matches!(bytes.get(end), Some(b'e' | b'E')) {
            let exp_start = end + 1 + usize::from(matches!(bytes.get(end + 1), Some(b'+' | b'-')));
            let exp_end = digits_from(exp_start);
            if exp_end == exp_start {
                return None;
            }
            end = exp_end;
        }
        let (literal, rest) = self.rest.split_at(end);
        self.rest = rest;
        literal.parse().ok().map(Json::Number)
    }

    fn string(&mut self) -> Option<String> {
        self.eat("\"")?;
        let mut out = String::new();
        loop {
            let special = self.rest.find(|c: char| c == '"' || c == '\\' || c < ' ')?;
            out.push_str(&self.rest[..special]);
            self.rest = &self.rest[special..];
            if self.eat("\"").is_some() {
                return Some(out);
            }
            self.eat("\\")?;
            let escape = self.rest.chars().next()?;
            self.rest = &self.rest[escape.len_utf8()..];
            match escape {
                '"' | '\\' | '/' => out.push(escape),
                'b' => out.push('\u{08}'),
                'f' => out.push('\u{0C}'),
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'u' => out.push(self.unicode_escape()?),
                _ => return None,
            }
        }
    }

    fn hex4(&mut self) -> Option<u32> {
        let digits = self.rest.get(..4)?;
        if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        self.rest = &self.rest[4..];
        u32::from_str_radix(digits, 16).ok()
    }

    /// The character for a `\uXXXX` escape whose `\u` is already consumed,
    /// joining a surrogate pair when the next escape completes it.
    fn unicode_escape(&mut self) -> Option<char> {
        let unit = self.hex4()?;
        if (0xD800..0xDC00).contains(&unit) {
            let before_low = self.rest;
            if self.eat("\\u").is_some() {
                match self.hex4() {
                    Some(low) if (0xDC00..0xE000).contains(&low) => {
                        return char::from_u32(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00));
                    }
                    _ => self.rest = before_low,
                }
            }
        }
        Some(char::from_u32(unit).unwrap_or(char::REPLACEMENT_CHARACTER))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_sends_halves_up() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert_eq!(round(-2.6), -3.0);
        assert_eq!(round(0.49999999999999994), 0.0);
        assert_eq!(round_to(0.25, 10.0), 0.3);
        assert_eq!(round_to(12.25, 2.0), 12.5);
    }

    #[test]
    fn to_fixed_breaks_ties_upward() {
        assert_eq!(to_fixed_2(0.125), 0.13);
        assert_eq!(to_fixed_2(8.375), 8.38);
        assert_eq!(to_fixed_2(-0.125), -0.13);
        // 1.005 is stored slightly below the tie, so it rounds down.
        assert_eq!(to_fixed_2(1.005), 1.0);
        assert_eq!(to_fixed_2(7.428571428571429), 7.43);
        assert!(to_fixed_2(f64::NAN).is_nan());
    }

    #[test]
    fn numbers_format_like_javascript() {
        let cases = [
            (10.0, "10"),
            (9.5, "9.5"),
            (-0.0, "0"),
            (0.1 + 0.2, "0.30000000000000004"),
            (1e21, "1e+21"),
            (1.5e-7, "1.5e-7"),
            (123456789012345680000.0, "123456789012345680000"),
            (0.000001, "0.000001"),
            (f64::NAN, "NaN"),
            (f64::NEG_INFINITY, "-Infinity"),
        ];
        for (value, expected) in cases {
            assert_eq!(Num(value).to_string(), expected);
        }
    }

    #[test]
    fn parse_float_reads_a_numeric_prefix() {
        assert_eq!(parse_float("10"), 10.0);
        assert_eq!(parse_float("  7.5 pts"), 7.5);
        assert_eq!(parse_float("8."), 8.0);
        assert_eq!(parse_float(".5"), 0.5);
        assert_eq!(parse_float("-3"), -3.0);
        assert_eq!(parse_float("+3"), 3.0);
        assert_eq!(parse_float("1e2x"), 100.0);
        assert_eq!(parse_float("1e"), 1.0);
        assert_eq!(parse_float("1.2.3"), 1.2);
        assert_eq!(parse_float("-Infinity"), f64::NEG_INFINITY);
        assert!(parse_float("").is_nan());
        assert!(parse_float("not a number").is_nan());
        assert!(parse_float(".").is_nan());
        assert!(parse_float("-").is_nan());
    }

    #[test]
    fn whitespace_matches_javascript_not_unicode() {
        assert_eq!(trim("\u{FEFF} x \u{A0}"), "x");
        assert_eq!(trim("\u{85}x"), "\u{85}x");
    }

    #[test]
    fn utf16_prefix_counts_code_units() {
        assert_eq!(utf16_prefix("abc", 2), "ab");
        assert_eq!(utf16_prefix("abc", 5), "abc");
        assert_eq!(utf16_prefix("a😀b", 3), "a😀");
        assert_eq!(utf16_prefix("a😀b", 2), "a\u{FFFD}");
        assert_eq!(utf16_len("a😀b"), 4);
    }

    #[test]
    fn replacement_patterns_expand() {
        assert_eq!(expand_replacement("<$$|$&|$1>", "xABy", 1, 3), "<$|AB|$1>");
        assert_eq!(expand_replacement("$`-$'", "xABy", 1, 3), "x-y");
    }

    #[test]
    fn json_parser_accepts_what_javascript_accepts() {
        assert_eq!(
            Json::parse(" [1e400, -0, 1.5E+2, 0.5e-1] ")
                .unwrap()
                .to_js_string(),
            "Infinity,0,150,0.05"
        );
        assert_eq!(
            Json::parse(r#""a\u00e9\ud83d\ude00\n\/\ud83dx\udc00""#),
            Some(Json::String(
                "a\u{e9}\u{1F600}\n/\u{FFFD}x\u{FFFD}".to_owned()
            ))
        );
        assert_eq!(Json::parse("{}"), Some(Json::Object(vec![])));
        assert_eq!(
            Json::parse("[[], {\"a\": [null, true, false]}]").map(|j| j.is_truthy()),
            Some(true)
        );
        let rejected = [
            "",
            "[1,]",
            "{\"a\":1,}",
            "01",
            "1.",
            ".5",
            "+1",
            "-",
            "1e",
            "tru",
            "nulll",
            "[1] x",
            "'a'",
            "{a: 1}",
            "\"tab\there\"",
            "\"\\q\"",
            "\"\\u12\"",
            "\"open",
            "[1 2]",
            "NaN",
            "\u{FEFF}[]",
            "\u{0B}1",
        ];
        for text in rejected {
            assert_eq!(Json::parse(text), None, "{text:?}");
        }
        assert!(
            Json::parse(&format!(
                "{}{}",
                "[".repeat(MAX_DEPTH),
                "]".repeat(MAX_DEPTH)
            ))
            .is_some()
        );
        assert!(
            Json::parse(&format!(
                "{}{}",
                "[".repeat(MAX_DEPTH + 1),
                "]".repeat(MAX_DEPTH + 1)
            ))
            .is_none()
        );
    }

    #[test]
    fn object_keys_follow_javascript_order() {
        let json = Json::parse(r#"{"b": 1, "2": 2, "a": 3, "1": 4, "b": 5, "01": 6}"#).unwrap();
        let keys: Vec<_> = json
            .entries()
            .into_iter()
            .map(|(k, _)| k.into_owned())
            .collect();
        assert_eq!(keys, ["1", "2", "b", "a", "01"]);
        assert_eq!(json.get("b"), &Json::Number(5.0));
    }

    #[test]
    fn values_stringify_like_javascript() {
        let json = Json::parse(r#"[null, true, 1.50, "x", [1, null, [2, 3]], {"a": 1}]"#).unwrap();
        assert_eq!(json.to_js_string(), ",true,1.5,x,1,,2,3,[object Object]");
        assert_eq!(Json::parse("[8]").unwrap().parse_float(), 8.0);
        assert!(Json::Null.parse_float().is_nan());
    }
}
