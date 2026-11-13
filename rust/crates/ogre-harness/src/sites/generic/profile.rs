//! What OGRE has been taught about one site's grading page.

use std::collections::BTreeMap;

use ogre_core::FeedbackKind;
use serde::{Deserialize, Serialize};

/// The profile format this build reads and writes.
pub const PROFILE_VERSION: u32 = 1;

/// A teacher-made description of a site's grading page: which pages it
/// applies to and where the students, score boxes and feedback boxes are.
///
/// A profile is plain data and may be stale. It only drives a page once
/// [`super::validate_profile`] has passed against that page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteProfile {
    pub version: u32,
    pub id: String,
    /// The site's name as the teacher knows it.
    pub name: String,
    pub url: UrlRule,
    pub page: PageMap,
}

/// Why a stored profile could not be loaded.
#[derive(Debug, thiserror::Error)]
pub enum ProfileError {
    #[error("the profile is not valid JSON for a site profile: {0}")]
    Json(#[from] serde_json::Error),
    #[error(
        "the profile was saved by a newer OGRE (format {found}, this one reads up to {supported})"
    )]
    NewerVersion { found: u32, supported: u32 },
}

impl SiteProfile {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        url: UrlRule,
        page: PageMap,
    ) -> Self {
        Self {
            version: PROFILE_VERSION,
            id: id.into(),
            name: name.into(),
            url,
            page,
        }
    }

    /// A profile for the page at `url`, named after its host and matching
    /// exactly that host and path.
    pub fn for_page(url: &str, page: PageMap) -> Self {
        let rule = UrlRule::for_page(url);
        let name = if rule.host.is_empty() {
            "Local page".to_owned()
        } else {
            rule.host.clone()
        };
        // A local file is named for itself, not for the folders it is in.
        let id = if rule.host.is_empty() {
            slug(&format!(
                "local {}",
                rule.path.rsplit('/').next().unwrap_or_default()
            ))
        } else {
            slug(&format!("{} {}", rule.host, rule.path))
        };
        Self::new(id, name, rule, page)
    }

    /// Reads a stored profile, refusing one written by a newer format.
    pub fn from_json(json: &str) -> Result<Self, ProfileError> {
        let profile: Self = serde_json::from_str(json)?;
        if profile.version > PROFILE_VERSION {
            return Err(ProfileError::NewerVersion {
                found: profile.version,
                supported: PROFILE_VERSION,
            });
        }
        Ok(profile)
    }

    pub fn to_json(&self) -> String {
        // A profile is strings, numbers and maps with string keys.
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}

/// Which pages a profile applies to: a host and a path, never a substring of
/// the whole address.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UrlRule {
    /// The exact host name, or `*.example.edu` for any subdomain of it.
    /// Empty matches only addresses without a host, such as local files.
    pub host: String,
    /// The path, where `*` stands for any run of characters. The query and
    /// fragment are not part of the path.
    pub path: String,
    /// Query parameters that must be present with exactly these values.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub query: BTreeMap<String, String>,
}

impl UrlRule {
    pub fn new(host: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            host: host.into(),
            path: path.into(),
            query: BTreeMap::new(),
        }
    }

    /// The rule that matches exactly the host and path of `url`.
    pub fn for_page(url: &str) -> Self {
        match UrlParts::parse(url) {
            Some(parts) => Self::new(parts.host, parts.path),
            None => Self::new("", url),
        }
    }

    pub fn matches(&self, url: &str) -> bool {
        let Some(parts) = UrlParts::parse(url) else {
            return false;
        };
        self.host_matches(&parts.host)
            && glob_matches(&self.path, parts.path)
            && self.query.iter().all(|(key, value)| {
                parts
                    .query
                    .split('&')
                    .filter_map(|pair| pair.split_once('='))
                    .any(|(k, v)| k == key && v == value)
            })
    }

    fn host_matches(&self, host: &str) -> bool {
        let rule = self.host.to_ascii_lowercase();
        match rule.strip_prefix("*.") {
            Some(parent) => host
                .strip_suffix(parent)
                .is_some_and(|rest| rest.ends_with('.')),
            None => host == rule,
        }
    }
}

struct UrlParts<'a> {
    /// Lower case, without user name or port.
    host: String,
    path: &'a str,
    query: &'a str,
}

impl<'a> UrlParts<'a> {
    fn parse(url: &'a str) -> Option<Self> {
        let (_scheme, rest) = url.split_once("://")?;
        let rest = rest.split('#').next().unwrap_or(rest);
        let (rest, query) = rest.split_once('?').unwrap_or((rest, ""));
        let (authority, path) = match rest.find('/') {
            Some(at) => rest.split_at(at),
            None => (rest, "/"),
        };
        // `https://trusted.example@evil.example/` is a page on evil.example.
        let host = authority.rsplit('@').next().unwrap_or(authority);
        let host = match host.strip_prefix('[') {
            Some(v6) => v6.split(']').next().unwrap_or(v6),
            None => host.split(':').next().unwrap_or(host),
        };
        Some(Self {
            host: host.to_ascii_lowercase(),
            path,
            query,
        })
    }
}

/// Whole-string match where `*` in `pattern` stands for any run of characters.
fn glob_matches(pattern: &str, text: &str) -> bool {
    let mut pieces = pattern.split('*');
    let first = pieces.next().unwrap_or_default();
    let Some(mut rest) = text.strip_prefix(first) else {
        return false;
    };
    let mut pieces = pieces.peekable();
    if pieces.peek().is_none() {
        return rest.is_empty();
    }
    while let Some(piece) = pieces.next() {
        if pieces.peek().is_none() {
            return rest.ends_with(piece);
        }
        match rest.find(piece) {
            Some(at) => rest = &rest[at + piece.len()..],
            None => return false,
        }
    }
    true
}

fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-');
    if out.is_empty() {
        "site".to_owned()
    } else {
        out.to_owned()
    }
}

/// Where things are on the grading page, as CSS selectors.
///
/// Rust cannot tell whether a selector is valid CSS; that, like everything
/// else here, is checked against the page by [`super::validate_profile`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PageMap {
    /// Matches one element per student, page-wide. `None` for a page that
    /// shows a single student: the other selectors then apply to the whole
    /// page.
    pub student_section: Option<String>,
    /// The element holding the student's name. This and every selector below
    /// is looked up inside the student's section.
    pub student_name: String,
    pub score_input: String,
    /// `None` when the page does not show what the question is out of.
    pub max_score: Option<MaxScoreRule>,
    pub feedback: Option<FeedbackBox>,
    /// The element holding the student's answer.
    pub response: String,
    /// The question as shown to this student, on sites that show it per student.
    pub prompt: Option<String>,
    pub save: Option<SaveRule>,
    /// A selector for the frame the grading page is shown in, when it is
    /// inside a frame of the page the teacher has open. Every other
    /// selector is then looked up in what that frame shows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<String>,
    /// The button that shows the next student, on a site that shows one
    /// student at a time. With it OGRE reads every student from the one
    /// shown to the last, and goes back to each to write.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_student: Option<ButtonRule>,
    /// The button that shows the student before. Only needed on a site
    /// whose students do not each have an address of their own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_student: Option<ButtonRule>,
}

impl PageMap {
    /// True for a page that shows one student and has a way to the next:
    /// its students are read by going through them.
    pub fn steps_through_students(&self) -> bool {
        self.student_section.is_none() && self.next_student.is_some()
    }

    /// True if the map says how a finished save looks. Without that OGRE
    /// never clicks the save button.
    pub fn confirms_saves(&self) -> bool {
        self.save
            .as_ref()
            .is_some_and(|save| save.success.is_some())
    }
}

/// How to find the points a question is out of.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "from", rename_all = "snake_case", deny_unknown_fields)]
pub enum MaxScoreRule {
    /// An element inside the student's section. `pattern` is a regular
    /// expression whose first group is the number; without it the first
    /// number in the element's text is used.
    Selector {
        selector: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pattern: Option<String>,
    },
    /// A regular expression tried on the score box's label, then on the text
    /// around the box, moving outwards to the student's section. Its first
    /// group is the number.
    NearbyText { pattern: String },
    /// The same for every student.
    Fixed { value: f64 },
}

impl MaxScoreRule {
    /// Matches "/ 10" and "out of 10", but not the "/12" of a date or a fraction.
    pub const USUAL_PATTERN: &'static str = r"(?:(?<![\w.])/|\bout of)\s*(\d+(?:\.\d+)?)";

    /// The rule that fits most pages: a "/ 10" or "out of 10" near the box.
    pub fn usual() -> Self {
        Self::NearbyText {
            pattern: Self::USUAL_PATTERN.to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeedbackBox {
    pub selector: String,
    pub kind: FeedbackKind,
    /// A hidden form field the site posts instead of the visible box. Only
    /// used when the box has no rich text editor that keeps it up to date.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hidden_field: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveRule {
    pub button: ButtonRule,
    /// How the page shows that a save went through. Without it OGRE never
    /// clicks the button: the teacher saves in the browser.
    pub success: Option<SaveSuccess>,
}

/// How to find one button of the page, such as its save button.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "by", rename_all = "snake_case", deny_unknown_fields)]
pub enum ButtonRule {
    /// A page-wide selector.
    Selector { selector: String },
    /// The button's whole label, ignoring case.
    Text { text: String },
}

/// The page's confirmation of a save: an element that becomes visible and,
/// if `pattern` is set, whose text matches that regular expression.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveSuccess {
    pub selector: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> SiteProfile {
        SiteProfile::new(
            "example-lms",
            "Example LMS",
            UrlRule::new("lms.example.edu", "/course/*/grade"),
            PageMap {
                student_section: Some("article[id^=\"sub-\"]".into()),
                student_name: "strong.submitter".into(),
                score_input: "input.pts-input".into(),
                max_score: Some(MaxScoreRule::Selector {
                    selector: ".pts-label".into(),
                    pattern: None,
                }),
                feedback: Some(FeedbackBox {
                    selector: "textarea.comments".into(),
                    kind: FeedbackKind::Textarea,
                    hidden_field: None,
                }),
                response: "section.sub-body".into(),
                prompt: None,
                save: Some(SaveRule {
                    button: ButtonRule::Text {
                        text: "Save All Grades".into(),
                    },
                    success: Some(SaveSuccess {
                        selector: "#status".into(),
                        pattern: Some("^Saved".into()),
                    }),
                }),
                frame: None,
                next_student: None,
                previous_student: None,
            },
        )
    }

    #[test]
    fn a_profile_survives_a_round_trip_through_json() {
        let profile = sample();
        let json = profile.to_json();
        assert_eq!(SiteProfile::from_json(&json).unwrap(), profile);

        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["version"], 1);
        assert_eq!(value["url"]["host"], "lms.example.edu");
        assert_eq!(value["page"]["max_score"]["from"], "selector");
        assert_eq!(value["page"]["feedback"]["kind"], "textarea");
        assert_eq!(value["page"]["save"]["button"]["by"], "text");
    }

    #[test]
    fn every_way_of_finding_the_maximum_round_trips() {
        for rule in [
            MaxScoreRule::usual(),
            MaxScoreRule::Fixed { value: 12.5 },
            MaxScoreRule::Selector {
                selector: ".max".into(),
                pattern: Some(r"of (\d+)".into()),
            },
        ] {
            let json = serde_json::to_string(&rule).unwrap();
            assert_eq!(
                serde_json::from_str::<MaxScoreRule>(&json).unwrap(),
                rule,
                "{json}"
            );
        }
        assert_eq!(
            serde_json::to_string(&MaxScoreRule::Fixed { value: 10.0 }).unwrap(),
            r#"{"from":"fixed","value":10.0}"#
        );
    }

    #[test]
    fn a_minimal_profile_loads_with_its_optional_parts_absent() {
        let json = r##"{
            "version": 1, "id": "x", "name": "X",
            "url": { "host": "x.example", "path": "/grade" },
            "page": {
                "student_section": null, "student_name": "h2", "score_input": "#score",
                "max_score": null, "feedback": null, "response": "#work",
                "prompt": null, "save": null
            }
        }"##;
        let profile = SiteProfile::from_json(json).unwrap();
        assert_eq!(profile.page.student_section, None);
        assert!(profile.url.query.is_empty());
        assert_eq!(SiteProfile::from_json(&profile.to_json()).unwrap(), profile);
    }

    #[test]
    fn a_profile_from_a_newer_format_or_with_unknown_parts_is_refused() {
        let mut newer = sample();
        newer.version = PROFILE_VERSION + 1;
        let err = SiteProfile::from_json(&newer.to_json()).unwrap_err();
        assert!(
            matches!(err, ProfileError::NewerVersion { found: 2, .. }),
            "{err}"
        );

        let json = sample()
            .to_json()
            .replace("\"id\"", "\"colour\": 1, \"id\"");
        assert!(matches!(
            SiteProfile::from_json(&json),
            Err(ProfileError::Json(_))
        ));
        assert!(matches!(
            SiteProfile::from_json("{\"id\": \"x\"}"),
            Err(ProfileError::Json(_))
        ));
    }

    #[test]
    fn a_rule_matches_its_host_and_path_and_nothing_else() {
        let rule = UrlRule::new("www.myopenmath.com", "/course/gradeallq2.php");
        assert!(rule.matches("https://www.myopenmath.com/course/gradeallq2.php?stu=0&cid=1#top"));
        assert!(rule.matches("https://WWW.MyOpenMath.com:8443/course/gradeallq2.php"));

        // The old profiles matched any address containing the pattern.
        for other in [
            "https://evil.example/?next=www.myopenmath.com/course/gradeallq2.php",
            "https://evil.example/www.myopenmath.com/course/gradeallq2.php",
            "https://www.myopenmath.com.evil.example/course/gradeallq2.php",
            "https://www.myopenmath.com@evil.example/course/gradeallq2.php",
            "https://notwww.myopenmath.com/course/gradeallq2.php",
            "https://www.myopenmath.com/course/gradeallq2.php.bak",
            "https://www.myopenmath.com/course/Gradeallq2.php",
            "https://www.myopenmath.com/course/gradebook.php",
            "www.myopenmath.com/course/gradeallq2.php",
            "",
        ] {
            assert!(!rule.matches(other), "{other}");
        }
    }

    #[test]
    fn a_rule_can_cover_subdomains_and_path_patterns() {
        let rule = UrlRule::new("*.instructure.com", "/courses/*/gradebook/speed_grader");
        assert!(rule.matches("https://school.instructure.com/courses/42/gradebook/speed_grader"));
        assert!(
            rule.matches("https://a.b.instructure.com/courses/42/x/gradebook/speed_grader?s=1")
        );
        assert!(!rule.matches("https://instructure.com/courses/42/gradebook/speed_grader"));
        assert!(!rule.matches("https://evilinstructure.com/courses/42/gradebook/speed_grader"));
        assert!(!rule.matches("https://school.instructure.com/courses/42/gradebook"));
        assert!(
            !rule.matches("https://school.instructure.com/x/courses/42/gradebook/speed_grader")
        );

        assert!(glob_matches("*", "/anything"));
        assert!(glob_matches("/a*", "/a"));
        assert!(glob_matches("/a*c*e", "/abcde"));
        assert!(!glob_matches("/a*c*e", "/abcd"));
        assert!(!glob_matches("/a", "/ab"));
    }

    #[test]
    fn a_rule_can_require_query_values() {
        let mut rule = UrlRule::new("moodle.example.edu", "/mod/assign/view.php");
        rule.query.insert("action".into(), "grading".into());
        assert!(rule.matches("https://moodle.example.edu/mod/assign/view.php?id=7&action=grading"));
        assert!(!rule.matches("https://moodle.example.edu/mod/assign/view.php?id=7"));
        assert!(!rule.matches("https://moodle.example.edu/mod/assign/view.php?action=grader"));

        let json = serde_json::to_string(&rule).unwrap();
        assert_eq!(serde_json::from_str::<UrlRule>(&json).unwrap(), rule);
    }

    #[test]
    fn a_profile_made_for_a_page_matches_that_page_only() {
        let page = sample().page;
        let profile = SiteProfile::for_page(
            "https://lms.example.edu/course/7/grade?student=12#q2",
            page.clone(),
        );
        assert_eq!(profile.version, PROFILE_VERSION);
        assert_eq!(profile.name, "lms.example.edu");
        assert_eq!(profile.id, "lms-example-edu-course-7-grade");
        assert_eq!(
            profile.url,
            UrlRule::new("lms.example.edu", "/course/7/grade")
        );
        assert!(
            profile
                .url
                .matches("https://lms.example.edu/course/7/grade?student=13")
        );
        assert!(
            !profile
                .url
                .matches("https://lms.example.edu/course/8/grade")
        );

        let local = SiteProfile::for_page("file:///tmp/fixtures/simple-batch.html", page);
        assert_eq!(local.name, "Local page");
        assert_eq!(local.id, "local-simple-batch-html");
        assert_eq!(
            local.url,
            UrlRule::new("", "/tmp/fixtures/simple-batch.html")
        );
        assert!(local.url.matches("file:///tmp/fixtures/simple-batch.html"));
        assert!(!local.url.matches("https://tmp/fixtures/simple-batch.html"));
    }
}
