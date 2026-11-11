//! The structured site guide: a compact JSON view of a site profile written
//! in markdown, which is what the AI is given instead of the full text.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize, Serializer};
use url::Url;

use crate::frontmatter::{self, FrontMatter};

/// A correction learned in an agent training session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LearnedCorrection {
    /// The action this corrects: `click`, `type`, `scroll`, `navigate`.
    pub action: String,
    /// What the agent was trying to reach.
    pub target: String,
    pub correct_selector: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    /// ISO 8601 time the correction was saved.
    #[serde(default)]
    pub timestamp: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Workflow {
    pub name: String,
    pub steps: Vec<String>,
}

/// What a site profile says, reduced to what the agent acts on.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteGuide {
    pub site: String,
    pub base_url: String,
    /// The teacher's role on the site, such as `instructor`.
    pub role: String,
    pub url_patterns: Vec<String>,
    /// Descriptive name and CSS selector, in the order the profile gives them.
    #[serde(serialize_with = "as_map")]
    pub selectors: Vec<(String, String)>,
    /// Page name and address, which may hold `{param}` placeholders.
    #[serde(serialize_with = "as_map")]
    pub navigation: Vec<(String, String)>,
    pub workflows: Vec<Workflow>,
    pub gotchas: Vec<String>,
    #[serde(rename = "learned_corrections", skip_serializing_if = "Vec::is_empty")]
    pub learned_corrections: Vec<LearnedCorrection>,
}

fn as_map<S: Serializer>(entries: &[(String, String)], serializer: S) -> Result<S::Ok, S::Error> {
    let mut map = serializer.serialize_map(Some(entries.len()))?;
    for (key, value) in entries {
        map.serialize_entry(key, value)?;
    }
    map.end()
}

impl SiteGuide {
    /// The block injected into the agent's prompt.
    pub fn format_for_agent(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "{}".to_owned());
        let site = &self.site;
        let mut out = format!("--- SITE GUIDE (JSON): {site} ---\n{json}\n--- END SITE GUIDE ---");
        if !self.learned_corrections.is_empty() {
            let lines: Vec<String> = self
                .learned_corrections
                .iter()
                .map(|c| {
                    let scope = c
                        .scope_hint
                        .as_deref()
                        .filter(|hint| !hint.is_empty())
                        .map(|hint| format!(" (scope: {hint})"))
                        .unwrap_or_default();
                    let notes = c
                        .notes
                        .as_deref()
                        .filter(|notes| !notes.is_empty())
                        .map(|notes| format!(" — {notes}"))
                        .unwrap_or_default();
                    format!(
                        "• [{}] {}: use selector `{}`{scope}{notes}",
                        c.action, c.target, c.correct_selector
                    )
                })
                .collect();
            out.push_str(&format!(
                "\n\n--- LEARNED CORRECTIONS: {site} ---\n{}\n--- END LEARNED CORRECTIONS ---",
                lines.join("\n")
            ));
        }
        out
    }
}

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("pattern is a valid constant")
}

static INLINE_CODE: LazyLock<Regex> = LazyLock::new(|| regex(r"`([^`\n]+)`"));
static HEADING: LazyLock<Regex> = LazyLock::new(|| regex(r"^(#{2,6})\s+(.+)$"));
static ORDERED_STEP: LazyLock<Regex> = LazyLock::new(|| regex(r"^(\d+)\.\s+(.+)$"));
static BULLET: LazyLock<Regex> = LazyLock::new(|| regex(r"^[-*]\s+(.+)$"));
static TITLE: LazyLock<Regex> = LazyLock::new(|| regex(r"(?m)^#\s+(.+)$"));
static PROFILE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?i)\s*[—-]\s*Knowledge Profile\s*$"));
static GUIDE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?i)\s*[—-]\s*Agent Navigation Guide\s*$"));
static BASE_URL_LINE: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?i)\*\*Base URL(?: pattern)?\*\*:\s*`([^`]+)`"));
static FIRST_HTTP: LazyLock<Regex> = LazyLock::new(|| regex(r#"(?i)https?://[^\s`)'"<>]+"#));
static ROLE_LINE: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)\*\*Role\*\*:\s*([^\n]+)"));
static URLS_IN_TEXT: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r#"https?://[^\s`)'"<>]+|/[A-Za-z0-9._~\-{}]+(?:/[A-Za-z0-9._~\-{}]+)*(?:\?[A-Za-z0-9._~\-{}=&]+)?"#,
    )
});
static SELECTOR_LIKE: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"(?i)^(#|\.|input\b|button\b|select\b|table\b|nav\b|div\b|span\b|a\[|\[data-|\[aria-|\[id|\[type|td\[|th\[)",
    )
});
static NAVIGATION_HINT: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?i)(\.php|\.aspx|\?|\{.+\}|/teacher|/course|/assess2)"));
static HTTP_PREFIX: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)^https?://"));
static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| regex(r"`([^`]+)`"));
static BOLD: LazyLock<Regex> = LazyLock::new(|| regex(r"\*\*([^*]+)\*\*"));
static ITALIC: LazyLock<Regex> = LazyLock::new(|| regex(r"\*([^*]+)\*"));
static LINK: LazyLock<Regex> = LazyLock::new(|| regex(r"\[([^\]]+)\]\(([^)]+)\)"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| regex(r"\s+"));
static NOT_KEY: LazyLock<Regex> = LazyLock::new(|| regex(r"[^a-z0-9]+"));
static NOT_ALNUM: LazyLock<Regex> = LazyLock::new(|| regex(r"[^a-zA-Z0-9]+"));
static TIPS: LazyLock<Regex> = LazyLock::new(|| regex(r"tips|gotchas"));
static TEACHER: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)\bteacher\b"));
static INSTRUCTOR: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)\binstructor\b"));

/// Reads a markdown site profile into a [`SiteGuide`]. Never fails: whatever
/// cannot be found is left empty.
pub fn convert_profile_to_json(markdown: &str) -> SiteGuide {
    if markdown.trim().is_empty() {
        return SiteGuide::default();
    }
    let (matter, content) = frontmatter::split(markdown);
    SiteGuide {
        site: site_name(&matter, content),
        base_url: base_url(&matter, content),
        role: role(&matter, content),
        url_patterns: matter
            .list("urlPatterns")
            .unwrap_or_default()
            .iter()
            .map(|pattern| pattern.trim().to_owned())
            .filter(|pattern| !pattern.is_empty())
            .collect(),
        selectors: selectors(content),
        navigation: navigation(content),
        workflows: workflows(content),
        gotchas: gotchas(content),
        learned_corrections: Vec::new(),
    }
}

fn site_name(matter: &FrontMatter, content: &str) -> String {
    if let Some(name) = matter.text("name") {
        return PROFILE_SUFFIX.replace(name, "").trim().to_owned();
    }
    if let Some(title) = TITLE.captures(content) {
        return GUIDE_SUFFIX.replace(title[1].trim(), "").trim().to_owned();
    }
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_owned()
}

fn base_url(matter: &FrontMatter, content: &str) -> String {
    if let Some(url) = matter.text("baseUrl") {
        return url.to_owned();
    }
    if let Some(line) = BASE_URL_LINE.captures(content) {
        return line[1].trim().to_owned();
    }
    FIRST_HTTP
        .find(content)
        .map(|found| found.as_str().to_owned())
        .unwrap_or_default()
}

fn role(matter: &FrontMatter, content: &str) -> String {
    if let Some(role) = matter.text("role") {
        return role.to_owned();
    }
    if let Some(line) = ROLE_LINE.captures(content) {
        return cleanup(&line[1]);
    }
    let lowered = content.to_lowercase();
    if lowered.contains("as a teacher") {
        "teacher"
    } else if lowered.contains("as an instructor") {
        "instructor"
    } else if TEACHER.is_match(content) {
        "teacher"
    } else if INSTRUCTOR.is_match(content) {
        "instructor"
    } else {
        ""
    }
    .to_owned()
}

fn selectors(content: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();

    // Table rows first: the first cell names the selectors in the row.
    for line in content.lines() {
        if !line.contains('|') || !line.contains('`') {
            continue;
        }
        let cells: Vec<&str> = line
            .split('|')
            .map(str::trim)
            .filter(|cell| !cell.is_empty())
            .collect();
        if cells.len() < 2 {
            continue;
        }
        let description = cleanup(cells[0]);
        for selector in inline_code(&cells.join(" | ")) {
            if !is_selector_like(&selector) || !seen.insert(selector.clone()) {
                continue;
            }
            let base = if description.is_empty() {
                selector_key(&selector)
            } else {
                description.clone()
            };
            let key = unique_key(&found, &base);
            found.push((key, selector));
        }
    }

    for code in inline_code(content) {
        if !is_selector_like(&code) || !seen.insert(code.clone()) {
            continue;
        }
        let key = unique_key(&found, &selector_key(&code));
        found.push((key, code));
    }
    found
}

fn navigation(content: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    let mut heading = "navigation".to_owned();

    for line in content.lines() {
        if let Some(title) = HEADING.captures(line.trim()) {
            heading = cleanup(&title[2]);
        }
        let in_code = inline_code(line);
        let in_text = URLS_IN_TEXT.find_iter(line).map(|m| m.as_str().to_owned());
        for candidate in in_code.into_iter().chain(in_text) {
            if !is_navigation_like(&candidate) || !seen.insert(candidate.clone()) {
                continue;
            }
            let heading = if heading.is_empty() {
                "navigation"
            } else {
                &heading
            };
            let key = unique_key(&found, &navigation_key(&candidate, heading));
            found.push((key, candidate));
        }
    }
    found
}

fn workflows(content: &str) -> Vec<Workflow> {
    fn flush(name: &str, steps: &mut Vec<String>, out: &mut Vec<Workflow>) {
        // A single numbered line is a note, not a procedure.
        if steps.len() >= 2 {
            let name = cleanup(name);
            out.push(Workflow {
                name: if name.is_empty() {
                    "Workflow".to_owned()
                } else {
                    name
                },
                steps: std::mem::take(steps),
            });
        }
        steps.clear();
    }

    let mut out = Vec::new();
    let mut heading = "Workflow".to_owned();
    let mut name = "Workflow".to_owned();
    let mut steps: Vec<String> = Vec::new();

    for line in content.lines().map(str::trim) {
        if let Some(title) = HEADING.captures(line) {
            flush(&name, &mut steps, &mut out);
            heading = cleanup(&title[2]);
        } else if let Some(step) = ORDERED_STEP.captures(line) {
            if steps.is_empty() {
                name.clone_from(&heading);
            }
            let step = cleanup(&step[2]);
            if !step.is_empty() {
                steps.push(step);
            }
        } else if !steps.is_empty() && !line.is_empty() {
            flush(&name, &mut steps, &mut out);
        }
    }
    flush(&name, &mut steps, &mut out);
    out
}

fn gotchas(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_section = false;
    for line in content.lines().map(str::trim) {
        if let Some(title) = HEADING.captures(line) {
            in_section = TIPS.is_match(&title[2].to_lowercase());
            continue;
        }
        if !in_section {
            continue;
        }
        if let Some(bullet) = BULLET.captures(line) {
            let tip = cleanup(&bullet[1]);
            if !tip.is_empty() && !out.contains(&tip) {
                out.push(tip);
            }
        }
    }
    out
}

fn inline_code(text: &str) -> Vec<String> {
    INLINE_CODE
        .captures_iter(text)
        .map(|code| code[1].trim().to_owned())
        .filter(|code| !code.is_empty())
        .collect()
}

fn is_selector_like(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && !value.starts_with("role=") && SELECTOR_LIKE.is_match(value)
}

fn is_navigation_like(value: &str) -> bool {
    let value = value.trim();
    if value == "/" || HTTP_PREFIX.is_match(value) {
        return true;
    }
    value.starts_with('/') && NAVIGATION_HINT.is_match(value)
}

fn selector_key(selector: &str) -> String {
    let simplified = NOT_ALNUM.replace_all(selector, " ").trim().to_lowercase();
    let words: Vec<&str> = simplified.split_whitespace().take(4).collect();
    if words.is_empty() {
        "selector".to_owned()
    } else {
        words.join("_")
    }
}

fn navigation_key(address: &str, heading: &str) -> String {
    if HTTP_PREFIX.is_match(address) {
        return match Url::parse(address) {
            Ok(url) => match url
                .path_segments()
                .and_then(|mut s| s.rfind(|part| !part.is_empty()))
            {
                Some(last) => make_key(&format!("{heading} {last}")),
                None => make_key(&format!("{heading} home")),
            },
            Err(_) => make_key(&format!("{heading} url")),
        };
    }
    if address == "/" {
        return make_key(&format!("{heading} home"));
    }
    let path = address.split('?').next().unwrap_or_default();
    let tail = path
        .split('/')
        .rfind(|part| !part.is_empty())
        .unwrap_or("path");
    make_key(&format!("{heading} {tail}"))
}

fn unique_key(taken: &[(String, String)], base: &str) -> String {
    let has = |key: &str| taken.iter().any(|(existing, _)| existing == key);
    let base = make_key(base);
    let base = if base.is_empty() {
        "entry".to_owned()
    } else {
        base
    };
    if !has(&base) {
        return base;
    }
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|candidate| !has(candidate))
        .unwrap_or(base)
}

fn make_key(value: &str) -> String {
    let lowered = cleanup(value).to_lowercase();
    NOT_KEY
        .replace_all(&lowered, "_")
        .trim_matches('_')
        .to_owned()
}

/// Strips markdown markup and collapses whitespace.
fn cleanup(value: &str) -> String {
    let value = CODE_SPAN.replace_all(value, "$1");
    let value = BOLD.replace_all(&value, "$1");
    let value = ITALIC.replace_all(&value, "$1");
    let value = LINK.replace_all(&value, "$1");
    SPACES.replace_all(&value, " ").trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOM: &str = include_str!("../profiles/myopenmath.md");
    const AERIES: &str = include_str!("../profiles/aeries.md");

    // The cases of profile-json-converter.test.ts, against the same profiles.

    #[test]
    fn reads_the_bundled_myopenmath_profile() {
        let guide = convert_profile_to_json(MOM);
        assert!(
            guide.site.to_lowercase().contains("myopenmath"),
            "{}",
            guide.site
        );
        assert_eq!(guide.site, "MyOpenMath");
        assert_eq!(guide.base_url, "https://www.myopenmath.com");
        assert_eq!(guide.role, "instructor");
        assert_eq!(guide.url_patterns, ["myopenmath.com"]);
        assert!(
            guide.selectors.len() >= 5,
            "{} selectors",
            guide.selectors.len()
        );
        assert!(
            guide.navigation.len() >= 3,
            "{} navigation",
            guide.navigation.len()
        );
        assert!(guide.workflows.iter().any(|w| w.steps.len() >= 2));
        assert!(guide.gotchas.len() >= 3, "{} gotchas", guide.gotchas.len());
    }

    #[test]
    fn reads_the_bundled_aeries_profile() {
        let guide = convert_profile_to_json(AERIES);
        assert!(
            guide.selectors.len() >= 5,
            "{} selectors",
            guide.selectors.len()
        );
        assert!(
            guide.navigation.len() >= 3,
            "{} navigation",
            guide.navigation.len()
        );
        assert!(guide.gotchas.len() >= 3, "{} gotchas", guide.gotchas.len());
    }

    /// The `.guide.json` files are what the desktop app's converter
    /// (`profile-json-converter.ts`) produces for the same two profiles.
    #[test]
    fn matches_the_desktop_apps_converter_byte_for_byte() {
        for (profile, expected) in [
            (MOM, include_str!("../profiles/myopenmath.guide.json")),
            (AERIES, include_str!("../profiles/aeries.guide.json")),
        ] {
            let guide = serde_json::to_string(&convert_profile_to_json(profile)).unwrap();
            assert_eq!(guide, expected.trim_end());
        }
    }

    #[test]
    fn an_empty_profile_gives_an_empty_guide() {
        assert_eq!(convert_profile_to_json(""), SiteGuide::default());
        assert_eq!(convert_profile_to_json("  \n "), SiteGuide::default());
    }

    #[test]
    fn malformed_front_matter_does_not_stop_it() {
        let guide = convert_profile_to_json(
            "---\nname: Broken\n- [unterminated\n\n# Header\nNot really structured",
        );
        assert_eq!(guide.site, "Header");
        assert!(guide.selectors.is_empty() && guide.workflows.is_empty());
    }

    #[test]
    fn extracts_each_part_of_a_small_profile() {
        let markdown = [
            "---",
            "name: \"MOM Guide — Knowledge Profile\"",
            "urlPatterns:",
            "  - \"myopenmath.com\"",
            "---",
            "# MyOpenMath — Agent Navigation Guide",
            "- **Base URL**: `https://www.myopenmath.com`",
            "- **Role**: Instructor/teacher",
            "## Selectors",
            "| Element | Selector | Notes |",
            "| **Score** box | `input[name^=\"ud-\"]` | per student |",
            "| Save | `#quicksavebtn`, `button.save` | either works |",
            "| Save | `.fbbox` | |",
            "Also `role=link[name=\"Home\"]` and `div.question` in prose, and `plain words`.",
            "## Navigation",
            "- Gradebook: `/course/gradebook.php?cid={cid}`",
            "- Home is https://www.myopenmath.com/ and help at /help (not a page).",
            "## Grade one question",
            "1. Open the **gradebook**",
            "2. Click `Grade`",
            "",
            "3. Type the score",
            "Then stop.",
            "1. A lone numbered line",
            "## Tips & Gotchas",
            "- Save every 5 students",
            "* Scores accept `N/A`",
            "- Save every 5 students",
            "Not a bullet",
            "## Other",
            "- not a tip",
        ]
        .join("\n");
        let guide = convert_profile_to_json(&markdown);

        assert_eq!(guide.site, "MOM Guide");
        assert_eq!(guide.base_url, "https://www.myopenmath.com");
        assert_eq!(guide.role, "Instructor/teacher");
        assert_eq!(guide.url_patterns, ["myopenmath.com"]);
        let pairs = |entries: &[(String, String)]| -> Vec<(String, String)> { entries.to_vec() };
        assert_eq!(
            pairs(&guide.selectors),
            [
                ("score_box", "input[name^=\"ud-\"]"),
                ("save", "#quicksavebtn"),
                ("save_2", "button.save"),
                ("save_3", ".fbbox"),
                ("div_question", "div.question"),
            ]
            .map(|(k, v)| (k.to_owned(), v.to_owned()))
        );
        // "/teacher" out of "Instructor/teacher" is the desktop app's behaviour too.
        assert_eq!(
            pairs(&guide.navigation),
            [
                ("navigation_home", "https://www.myopenmath.com"),
                ("navigation_teacher", "/teacher"),
                (
                    "navigation_gradebook_php",
                    "/course/gradebook.php?cid={cid}"
                ),
                ("navigation_home_2", "https://www.myopenmath.com/"),
            ]
            .map(|(k, v)| (k.to_owned(), v.to_owned()))
        );
        assert_eq!(
            guide.workflows,
            [Workflow {
                name: "Grade one question".into(),
                steps: vec![
                    "Open the gradebook".into(),
                    "Click Grade".into(),
                    "Type the score".into()
                ],
            }]
        );
        assert_eq!(
            guide.gotchas,
            ["Save every 5 students", "Scores accept N/A"]
        );
    }

    #[test]
    fn formats_the_guide_as_one_json_block_with_keys_in_a_fixed_order() {
        let mut guide = SiteGuide {
            site: "MOM".into(),
            base_url: "https://m.example".into(),
            role: "teacher".into(),
            url_patterns: vec!["m.example".into()],
            selectors: vec![
                ("z_last".into(), "#z".into()),
                ("a_first".into(), "#a".into()),
            ],
            ..SiteGuide::default()
        };
        assert_eq!(
            guide.format_for_agent(),
            "--- SITE GUIDE (JSON): MOM ---\n\
             {\"site\":\"MOM\",\"baseUrl\":\"https://m.example\",\"role\":\"teacher\",\
             \"urlPatterns\":[\"m.example\"],\"selectors\":{\"z_last\":\"#z\",\"a_first\":\"#a\"},\
             \"navigation\":{},\"workflows\":[],\"gotchas\":[]}\n\
             --- END SITE GUIDE ---"
        );

        guide.learned_corrections = vec![
            LearnedCorrection {
                action: "click".into(),
                target: "save button".into(),
                correct_selector: "#quicksavebtn".into(),
                scope_hint: Some("form#mainform".into()),
                notes: Some("not the bottom one".into()),
                timestamp: "2026-01-01T00:00:00Z".into(),
            },
            LearnedCorrection {
                action: "type".into(),
                target: "score".into(),
                correct_selector: "input[name^=\"ud-\"]".into(),
                scope_hint: None,
                notes: None,
                timestamp: String::new(),
            },
        ];
        let formatted = guide.format_for_agent();
        assert!(formatted.contains("\"learned_corrections\":[{\"action\":\"click\""));
        assert!(formatted.ends_with(
            "\n\n--- LEARNED CORRECTIONS: MOM ---\n\
             • [click] save button: use selector `#quicksavebtn` (scope: form#mainform) — not the bottom one\n\
             • [type] score: use selector `input[name^=\"ud-\"]`\n\
             --- END LEARNED CORRECTIONS ---"
        ));
    }
}
