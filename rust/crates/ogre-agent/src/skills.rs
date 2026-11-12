//! Skills and site profiles: markdown files of instructions the teacher has
//! installed, and how the ones that apply are put into the agent's prompt.
//!
//! A skill's text is trusted the way the teacher's own request is: it goes
//! into the system prompt as instructions. Fetching or installing skills from
//! the network is not done here.

use std::cmp::Ordering;
use std::path::Path;
use std::sync::LazyLock;
use std::time::{Duration, SystemTime};

use regex::Regex;

use crate::frontmatter;
use crate::site_guide::{LearnedCorrection, convert_profile_to_json};

/// Where a skill came from, which decides whose advice wins for a site.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillSource {
    /// A file in the teacher's skills folder.
    Local,
    /// Written by the teacher in the app.
    Created,
    /// A site profile shipped with OGRE.
    SiteProfile,
    /// Installed from elsewhere.
    Marketplace,
}

/// One installed skill or site profile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    /// The whole file, front matter included.
    pub content: String,
    pub source: SkillSource,
    /// Whether the teacher has switched the skill on. Only active skills are
    /// injected as skills; a site profile guides its site either way.
    pub active: bool,
    /// Parts of an address this skill is about, such as `myopenmath.com`.
    /// A skill with any of these is a site profile.
    pub url_patterns: Vec<String>,
    pub learned_corrections: Vec<LearnedCorrection>,
    pub created_at: Option<SystemTime>,
    pub updated_at: Option<SystemTime>,
}

impl Skill {
    /// Builds a skill from a markdown file's text. `fallback_name` (a folder
    /// or file name) is used when the text names nothing.
    pub fn from_markdown(
        id: impl Into<String>,
        fallback_name: &str,
        content: &str,
        source: SkillSource,
    ) -> Self {
        let parsed = parse_skill_markdown(content);
        let (matter, _) = frontmatter::split(content);
        Self {
            id: id.into(),
            name: if parsed.name.is_empty() {
                fallback_name.to_owned()
            } else {
                parsed.name
            },
            description: parsed.description,
            content: content.to_owned(),
            source,
            active: matter.flag("active").unwrap_or(false),
            url_patterns: parsed.url_patterns.unwrap_or_default(),
            learned_corrections: Vec::new(),
            created_at: None,
            updated_at: None,
        }
    }
}

/// A skill as a teacher writes one: what the form of a skill editor holds.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SkillDraft {
    pub name: String,
    /// One line on what the skill is for.
    pub description: String,
    /// Parts of the addresses it guides the agent on. Empty for a skill
    /// that is not about a site.
    pub sites: Vec<String>,
    /// What the agent should know, in Markdown.
    pub body: String,
}

impl SkillDraft {
    /// Reads a skill file into the form. Entries of its heading block other
    /// than the name, the description and the sites are not carried over.
    pub fn from_markdown(raw: &str) -> Self {
        let parsed = parse_skill_markdown(raw);
        let (matter, body) = frontmatter::split(raw);
        Self {
            name: parsed.name,
            description: matter.text("description").unwrap_or_default().to_owned(),
            sites: parsed.url_patterns.unwrap_or_default(),
            body: body.trim().to_owned(),
        }
    }

    /// The skill as a file that [`Skill::from_markdown`] reads back.
    pub fn to_markdown(&self) -> String {
        let quoted = |text: &str| {
            let one_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
            format!(
                "\"{}\"",
                one_line.replace('\\', "\\\\").replace('"', "\\\"")
            )
        };
        let mut file = format!("---\nname: {}\n", quoted(&self.name));
        if !self.description.trim().is_empty() {
            file += &format!("description: {}\n", quoted(&self.description));
        }
        let sites: Vec<&str> = self
            .sites
            .iter()
            .map(|site| site.trim())
            .filter(|site| !site.is_empty())
            .collect();
        if !sites.is_empty() {
            file += "urlPatterns:\n";
            for site in sites {
                file += &format!("  - {}\n", quoted(site));
            }
        }
        file + &format!("---\n\n{}\n", self.body.trim())
    }
}

/// What a skill file says about itself.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedSkill {
    pub name: String,
    pub description: String,
    /// The whole file as given.
    pub content: String,
    pub author: Option<String>,
    pub tags: Option<Vec<String>>,
    pub url_patterns: Option<Vec<String>>,
}

static FIRST_HEADING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^#\s+(.+)$").expect("pattern is a valid constant"));
static BLANK_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\n\s*\n").expect("pattern is a valid constant"));

/// Reads a skill file: front matter first, then the first heading for a
/// missing name and the first paragraph for a missing description.
pub fn parse_skill_markdown(raw: &str) -> ParsedSkill {
    if raw.trim().is_empty() {
        return ParsedSkill {
            content: raw.to_owned(),
            ..ParsedSkill::default()
        };
    }
    let (matter, body) = frontmatter::split(raw);

    let name = matter.text("name").map(str::to_owned).unwrap_or_else(|| {
        match FIRST_HEADING.captures(body) {
            Some(heading) => heading[1].trim().to_owned(),
            None => body
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .unwrap_or_default()
                .to_owned(),
        }
    });
    let description = matter
        .text("description")
        .map(str::to_owned)
        .unwrap_or_else(|| {
            BLANK_LINE
                .split(body)
                .map(str::trim)
                .find(|paragraph| !paragraph.is_empty() && !paragraph.starts_with('#'))
                .map(|paragraph| paragraph.replace('\n', " "))
                .unwrap_or_default()
        });

    ParsedSkill {
        name,
        description,
        content: raw.to_owned(),
        author: matter.text("author").map(str::to_owned),
        tags: matter.list("tags").map(<[String]>::to_vec),
        url_patterns: matter.list("urlPatterns").map(<[String]>::to_vec),
    }
}

/// Loads every skill in `dir`: each `<folder>/SKILL.md`, and each `.md` file
/// directly inside. Files that cannot be read, or are empty, are skipped.
/// Skills come back sorted by name.
///
/// A skill is active only if its front matter says `active: true`; the app
/// is expected to set [`Skill::active`] from the teacher's own choices.
pub fn load_skills_dir(dir: &Path, source: SkillSource) -> std::io::Result<Vec<Skill>> {
    let mut skills = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let (file, label) = if path.is_dir() {
            (path.join("SKILL.md"), path.file_name())
        } else if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            (path.clone(), path.file_stem())
        } else {
            continue;
        };
        let Some(label) = label.and_then(|label| label.to_str()) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        if content.trim().is_empty() {
            continue;
        }
        let mut skill = Skill::from_markdown(label, label, &content, source);
        if let Ok(metadata) = std::fs::metadata(&file) {
            skill.created_at = metadata.created().ok();
            skill.updated_at = metadata.modified().ok();
        }
        skills.push(skill);
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    Ok(skills)
}

/// The site profiles shipped with OGRE: MyOpenMath and Aeries.
pub fn bundled_site_profiles() -> Vec<Skill> {
    [
        ("myopenmath", include_str!("../profiles/myopenmath.md")),
        ("aeries", include_str!("../profiles/aeries.md")),
    ]
    .into_iter()
    .map(|(name, content)| {
        Skill::from_markdown(
            format!("bundled-{name}"),
            name,
            content,
            SkillSource::SiteProfile,
        )
    })
    .collect()
}

impl Skill {
    /// The parts of addresses this skill is for. A pattern may hold several,
    /// with commas between.
    pub fn sites(&self) -> impl Iterator<Item = &str> {
        self.url_patterns
            .iter()
            .flat_map(|pattern| pattern.split(','))
            .map(str::trim)
            .filter(|pattern| !pattern.is_empty())
    }
}

fn matches_url(skill: &Skill, lower_url: &str) -> bool {
    skill
        .sites()
        .any(|pattern| lower_url.contains(&pattern.to_lowercase()))
}

/// The skills whose URL patterns occur in `url`, ignoring case.
pub fn find_matching_profiles<'a>(url: &str, skills: &'a [Skill]) -> Vec<&'a Skill> {
    let lower_url = url.to_lowercase();
    skills
        .iter()
        .filter(|skill| matches_url(skill, &lower_url))
        .collect()
}

const MODIFIED_AFTER: Duration = Duration::from_secs(30 * 24 * 60 * 60);

/// Lower wins: the teacher's own profiles, then a shipped profile they have
/// edited, then a shipped profile as shipped, then anything else.
fn precedence(skill: &Skill) -> u8 {
    match skill.source {
        SkillSource::Created | SkillSource::Local => 1,
        SkillSource::SiteProfile => {
            let edited = skill
                .created_at
                .zip(skill.updated_at)
                .and_then(|(created, updated)| updated.duration_since(created).ok())
                .is_some_and(|gap| gap > MODIFIED_AFTER);
            if edited { 2 } else { 3 }
        }
        SkillSource::Marketplace => 4,
    }
}

/// Picks the one profile to use when several match an address: by source,
/// then the longest (most specific) pattern, then the most recently updated.
pub fn select_best_profile<'a>(matches: &[&'a Skill]) -> Option<&'a Skill> {
    let pattern_len = |skill: &Skill| skill.url_patterns.join(",").len();
    matches.iter().copied().min_by(|a, b| {
        precedence(a)
            .cmp(&precedence(b))
            .then_with(|| pattern_len(b).cmp(&pattern_len(a)))
            .then_with(|| match (a.updated_at, b.updated_at) {
                (Some(a), Some(b)) => b.cmp(&a),
                _ => Ordering::Equal,
            })
    })
}

/// The block that puts skills into the prompt, in the order given. Empty when
/// there are none.
pub fn build_skill_injection<'a>(skills: impl IntoIterator<Item = &'a Skill>) -> String {
    skills
        .into_iter()
        .map(|skill| {
            format!(
                "\n\n--- SKILL: {} ---\n{}\n--- END SKILL ---\n\n",
                skill.name, skill.content
            )
        })
        .collect()
}

/// The site guide block for `url`: the best matching profile as compact
/// JSON, with any learned corrections. Empty when no profile matches.
pub fn build_site_context_injection(url: &str, skills: &[Skill]) -> String {
    let Some(best) = select_best_profile(&find_matching_profiles(url, skills)) else {
        return String::new();
    };
    let mut guide = convert_profile_to_json(&best.content);
    if guide.site.is_empty() {
        guide.site.clone_from(&best.name);
    }
    guide
        .learned_corrections
        .clone_from(&best.learned_corrections);
    guide.format_for_agent()
}

/// What the installed skills contribute to the prompt for one address.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SkillContext {
    /// Name of the site profile chosen for the address.
    pub profile_name: Option<String>,
    /// From [`build_site_context_injection`].
    pub site_guide: String,
    /// The active skills, from [`build_skill_injection`].
    pub installed_skill: String,
}

/// Selects what applies at `url`: the best matching site profile as the site
/// guide, and as skills every active skill, by name, that is either not tied
/// to any address or tied to this one.
pub fn skill_context_for(url: &str, skills: &[Skill]) -> SkillContext {
    let lower_url = url.to_lowercase();
    let mut active: Vec<&Skill> = skills
        .iter()
        .filter(|skill| skill.active)
        .filter(|skill| skill.sites().next().is_none() || matches_url(skill, &lower_url))
        .collect();
    active.sort_by(|a, b| a.name.cmp(&b.name));

    SkillContext {
        profile_name: select_best_profile(&find_matching_profiles(url, skills))
            .map(|best| best.name.clone()),
        site_guide: build_site_context_injection(url, skills),
        installed_skill: build_skill_injection(active),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── skill-parser.test.ts ────────────────────────────────────────────

    #[test]
    fn reads_name_description_author_and_tags_from_front_matter() {
        let raw = "---\nname: My Awesome Skill\ndescription: This skill does amazing things\n\
                   author: John Doe\ntags:\n  - productivity\n  - automation\n---\n\n\
                   # My Awesome Skill\n\nThis is the body content of the skill.\n\
                   It can have multiple paragraphs.\n\n## Features\n- Feature 1\n- Feature 2\n";
        let parsed = parse_skill_markdown(raw);
        assert_eq!(parsed.name, "My Awesome Skill");
        assert_eq!(parsed.description, "This skill does amazing things");
        assert_eq!(parsed.author.as_deref(), Some("John Doe"));
        assert_eq!(
            parsed.tags,
            Some(vec!["productivity".to_owned(), "automation".to_owned()])
        );
        assert_eq!(parsed.content, raw);
    }

    #[test]
    fn front_matter_with_only_name_and_description() {
        let parsed = parse_skill_markdown(
            "---\nname: Simple Skill\ndescription: A simple skill\n---\n\nBody content here.",
        );
        assert_eq!(parsed.name, "Simple Skill");
        assert_eq!(parsed.description, "A simple skill");
        assert_eq!(parsed.author, None);
        assert_eq!(parsed.tags, None);
    }

    #[test]
    fn uses_the_first_heading_and_paragraph_without_front_matter() {
        let parsed = parse_skill_markdown(
            "# Skill From Heading\n\nThis is the first paragraph that becomes the description.\n\nMore content follows.",
        );
        assert_eq!(parsed.name, "Skill From Heading");
        assert_eq!(
            parsed.description,
            "This is the first paragraph that becomes the description."
        );

        let parsed = parse_skill_markdown(
            "# Another Skill\n\nThe first paragraph is used as the description.\nIt can span multiple sentences.\n\nSecond paragraph is not part of description.",
        );
        assert_eq!(parsed.name, "Another Skill");
        assert_eq!(
            parsed.description,
            "The first paragraph is used as the description. It can span multiple sentences."
        );
    }

    #[test]
    fn uses_the_first_line_as_the_name_when_there_is_no_heading() {
        let parsed = parse_skill_markdown(
            "This is a skill without a heading.\n\nThe description comes from the first paragraph.",
        );
        assert_eq!(parsed.name, "This is a skill without a heading.");
        assert!(parsed.description.contains("skill without a heading"));
    }

    #[test]
    fn empty_and_blank_content_have_no_name_or_description() {
        let parsed = parse_skill_markdown("");
        assert_eq!(
            (parsed.name.as_str(), parsed.description.as_str()),
            ("", "")
        );
        assert_eq!(parsed.content, "");
        let parsed = parse_skill_markdown("   \n\n   \t\n   ");
        assert_eq!(
            (parsed.name.as_str(), parsed.description.as_str()),
            ("", "")
        );
    }

    #[test]
    fn front_matter_with_no_body() {
        let raw = "---\nname: Name Only\ndescription: Desc only\n---";
        let parsed = parse_skill_markdown(raw);
        assert_eq!(parsed.name, "Name Only");
        assert_eq!(parsed.description, "Desc only");
        assert_eq!(parsed.content, raw);
    }

    #[test]
    fn reads_url_patterns() {
        let with = parse_skill_markdown(
            "---\nname: My Skill\ndescription: A skill\nurlPatterns:\n  - myopenmath.com\n  - mom.example.com\n---\n\nBody content.",
        );
        assert_eq!(
            with.url_patterns,
            Some(vec![
                "myopenmath.com".to_owned(),
                "mom.example.com".to_owned()
            ])
        );
        let without =
            parse_skill_markdown("---\nname: My Skill\ndescription: A skill\n---\n\nBody content.");
        assert_eq!(without.url_patterns, None);
        let empty = parse_skill_markdown(
            "---\nname: My Skill\ndescription: A skill\nurlPatterns: []\n---\n\nBody content.",
        );
        assert_eq!(empty.url_patterns, Some(Vec::new()));
    }

    // ── skills-api.test.ts ──────────────────────────────────────────────

    fn profile(name: &str, pattern: &str) -> Skill {
        Skill {
            id: format!("skill-{name}"),
            name: name.to_owned(),
            description: String::new(),
            content: "MOM content".to_owned(),
            source: SkillSource::SiteProfile,
            active: false,
            url_patterns: vec![pattern.to_owned()],
            learned_corrections: Vec::new(),
            created_at: Some(day(0)),
            updated_at: Some(day(0)),
        }
    }

    fn day(n: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(n * 24 * 60 * 60)
    }

    fn names(found: &[&Skill]) -> Vec<String> {
        found.iter().map(|skill| skill.name.clone()).collect()
    }

    #[test]
    fn finds_profiles_whose_pattern_is_in_the_address() {
        let profiles = [
            profile("MOM Guide", "myopenmath.com"),
            profile("Aeries Guide", "aeries.net"),
            profile("Mixed Case", "MyOpenMath.com"),
            profile("Several", "canvas.example, chicousd.aeries.net"),
        ];
        assert_eq!(
            names(&find_matching_profiles(
                "https://www.myopenmath.com/course/123",
                &profiles
            )),
            ["MOM Guide", "Mixed Case"]
        );
        assert_eq!(
            names(&find_matching_profiles(
                "https://chicousd.aeries.net/teacher",
                &profiles
            )),
            ["Aeries Guide", "Several"]
        );
        assert!(find_matching_profiles("https://canvas.instructure.com", &profiles).is_empty());
    }

    #[test]
    fn formats_active_skills_with_delimiters() {
        assert_eq!(build_skill_injection([]), "");

        let mut react = profile("React Best Practices", "");
        react.content = "# React\nUse hooks.".into();
        assert_eq!(
            build_skill_injection([&react]),
            "\n\n--- SKILL: React Best Practices ---\n# React\nUse hooks.\n--- END SKILL ---\n\n"
        );

        let mut ts = profile("TypeScript", "");
        ts.content = "TS content".into();
        let both = build_skill_injection([&react, &ts]);
        assert!(both.contains("--- SKILL: React Best Practices ---"));
        assert!(both.contains("--- SKILL: TypeScript ---\nTS content\n--- END SKILL ---"));
    }

    const MOM_GUIDE: &str = "---\nname: \"MOM Guide\"\nbaseUrl: \"https://www.myopenmath.com\"\n\
        role: \"teacher\"\nurlPatterns:\n  - \"myopenmath.com\"\n---\n\
        # MyOpenMath — Agent Navigation Guide\n## Selectors\n\
        | Assignment link | `a[href*=\"assess2\"]` | This is a detailed explanation of how to use this selector in various contexts |\n\
        ## Navigation\n- `https://www.myopenmath.com/course/123`\n- `/assess2/teacher/gb-view.php?cid={cid}`\n\
        ## Workflows\n1. Open gradebook and review all assignments before making changes\n\
        ## Gotchas & Tips\n- Use teacher account for all operations\n- Save frequently to avoid session timeout";

    fn guide_json(injection: &str) -> serde_json::Value {
        let json = injection
            .lines()
            .nth(1)
            .expect("the JSON is the second line");
        serde_json::from_str(json).expect("valid JSON")
    }

    #[test]
    fn no_site_guide_when_no_profile_matches() {
        let profiles = [profile("MOM Guide", "myopenmath.com")];
        assert_eq!(
            build_site_context_injection("https://canvas.instructure.com", &profiles),
            ""
        );
    }

    #[test]
    fn the_site_guide_is_a_json_block_with_every_key() {
        let mut mom = profile("MOM Guide", "myopenmath.com");
        mom.content = MOM_GUIDE.into();
        let injection =
            build_site_context_injection("https://www.myopenmath.com/course/123", &[mom.clone()]);
        assert!(injection.starts_with("--- SITE GUIDE (JSON): MOM Guide ---\n"));
        assert!(injection.ends_with("\n--- END SITE GUIDE ---"));

        let guide = guide_json(&injection);
        for key in [
            "site",
            "baseUrl",
            "role",
            "urlPatterns",
            "selectors",
            "navigation",
            "workflows",
            "gotchas",
        ] {
            assert!(guide.get(key).is_some(), "{key}");
        }
        assert_eq!(guide["site"], "MOM Guide");
        assert_eq!(guide["role"], "teacher");
        assert_eq!(
            guide["selectors"]["assignment_link"],
            "a[href*=\"assess2\"]"
        );
        assert_eq!(
            guide["gotchas"][0],
            "Use teacher account for all operations"
        );
        assert!(
            injection.len() < mom.content.len(),
            "the guide is smaller than the profile"
        );
    }

    #[test]
    fn a_profile_with_no_name_of_its_own_takes_the_skills_name() {
        let mut bare = profile("Fallback Name", "myopenmath.com");
        bare.content = "\n".into();
        let injection = build_site_context_injection("https://myopenmath.com", &[bare]);
        assert!(injection.starts_with("--- SITE GUIDE (JSON): Fallback Name ---"));
    }

    #[test]
    fn only_the_best_matching_profile_becomes_the_site_guide() {
        let mut generic = profile("Generic Guide", "myopenmath.com");
        generic.content = "---\nname: \"Generic Guide\"\n---\n# Generic".into();
        let mut specific = profile("Specific Guide", "myopenmath.com/course");
        specific.content = "---\nname: \"Specific Guide\"\n---\n# Specific".into();
        let injection = build_site_context_injection(
            "https://www.myopenmath.com/course/123",
            &[generic, specific],
        );
        assert!(injection.contains("--- SITE GUIDE (JSON): Specific Guide ---"));
        assert!(!injection.contains("Generic Guide"));
    }

    #[test]
    fn learned_corrections_follow_the_site_guide() {
        let mut mom = profile("MOM Guide", "myopenmath.com");
        mom.learned_corrections = vec![LearnedCorrection {
            action: "click".into(),
            target: "save".into(),
            correct_selector: "#quicksavebtn".into(),
            scope_hint: None,
            notes: None,
            timestamp: String::new(),
        }];
        let injection = build_site_context_injection("https://myopenmath.com", &[mom]);
        assert!(injection.contains(
            "--- LEARNED CORRECTIONS: MOM content ---\n• [click] save: use selector `#quicksavebtn`"
        ));
    }

    // ── profile-precedence.test.ts ──────────────────────────────────────

    fn best(skills: &[Skill]) -> Option<&str> {
        let all: Vec<&Skill> = skills.iter().collect();
        select_best_profile(&all).map(|skill| skill.id.as_str())
    }

    fn sourced(id: &str, source: SkillSource, pattern: &str, created: u64, updated: u64) -> Skill {
        Skill {
            id: id.to_owned(),
            source,
            created_at: Some(day(created)),
            updated_at: Some(day(updated)),
            ..profile(id, pattern)
        }
    }

    #[test]
    fn best_profile_of_none_or_one() {
        assert_eq!(best(&[]), None);
        assert_eq!(best(&[profile("only", "a.com")]), Some("skill-only"));
    }

    #[test]
    fn the_teachers_own_profiles_beat_shipped_ones() {
        let bundled = sourced("bundled", SkillSource::SiteProfile, "myopenmath.com", 0, 0);
        let created = sourced("created", SkillSource::Created, "myopenmath.com", 0, 0);
        let local = sourced("local", SkillSource::Local, "myopenmath.com", 0, 0);
        assert_eq!(best(&[bundled.clone(), created]), Some("created"));
        assert_eq!(best(&[bundled, local]), Some("local"));
    }

    #[test]
    fn the_longer_pattern_wins_at_equal_precedence() {
        let short = sourced("short", SkillSource::SiteProfile, "myopenmath.com", 0, 0);
        let long = sourced(
            "long",
            SkillSource::SiteProfile,
            "myopenmath.com/course",
            0,
            0,
        );
        assert_eq!(best(&[short, long]), Some("long"));
    }

    #[test]
    fn the_newer_profile_wins_when_all_else_is_equal() {
        let older = sourced("older", SkillSource::Created, "myopenmath.com", 0, 1);
        let newer = sourced("newer", SkillSource::Created, "myopenmath.com", 0, 20);
        assert_eq!(best(&[older, newer]), Some("newer"));
    }

    #[test]
    fn a_shipped_profile_edited_long_after_it_was_made_beats_a_pristine_one() {
        let pristine = sourced("pristine", SkillSource::SiteProfile, "myopenmath.com", 0, 0);
        let edited = sourced("edited", SkillSource::SiteProfile, "myopenmath.com", 0, 45);
        assert_eq!(best(&[pristine.clone(), edited.clone()]), Some("edited"));
        // Thirty days exactly is not long enough.
        let recent = sourced(
            "recent",
            SkillSource::SiteProfile,
            "myopenmath.com/x",
            0,
            30,
        );
        assert_eq!(best(&[edited.clone(), recent]), Some("edited"));

        let created = sourced("created", SkillSource::Created, "myopenmath.com", 0, 0);
        assert_eq!(best(&[edited, created]), Some("created"));
    }

    #[test]
    fn profiles_without_patterns_or_dates_are_handled() {
        let mut none = sourced("none", SkillSource::SiteProfile, "", 0, 0);
        none.url_patterns.clear();
        none.updated_at = None;
        let some = sourced("some", SkillSource::SiteProfile, "myopenmath.com", 0, 0);
        assert_eq!(best(&[none, some]), Some("some"));

        let market = sourced(
            "market",
            SkillSource::Marketplace,
            "myopenmath.com/long/pattern",
            0,
            99,
        );
        let shipped = sourced("shipped", SkillSource::SiteProfile, "myopenmath.com", 0, 0);
        assert_eq!(best(&[market, shipped]), Some("shipped"));
    }

    // ── Loading and selection ───────────────────────────────────────────

    #[test]
    fn the_bundled_profiles_are_site_profiles_for_their_sites() {
        let bundled = bundled_site_profiles();
        assert_eq!(bundled.len(), 2);
        assert!(
            bundled
                .iter()
                .all(|p| p.source == SkillSource::SiteProfile && !p.active)
        );
        assert_eq!(bundled[0].url_patterns, ["myopenmath.com"]);
        assert_eq!(
            names(&find_matching_profiles(
                "https://chicousd.aeries.net/teacher/",
                &bundled
            ))
            .len(),
            1
        );
        let context = skill_context_for(
            "https://www.myopenmath.com/course/course.php?cid=1",
            &bundled,
        );
        assert_eq!(
            context.profile_name.as_deref(),
            Some("MyOpenMath — Knowledge Profile")
        );
        assert!(
            context
                .site_guide
                .starts_with("--- SITE GUIDE (JSON): MyOpenMath ---")
        );
        assert_eq!(
            context.installed_skill, "",
            "a profile is not a skill until switched on"
        );
    }

    #[test]
    fn active_skills_apply_everywhere_unless_tied_to_another_site() {
        let mut tone = profile("Tone", "");
        tone.url_patterns.clear();
        tone.active = true;
        tone.content = "Be kind.".into();
        let mut aeries = profile("Aeries tips", "aeries.net");
        aeries.active = true;
        let mut off = profile("Switched off", "");
        off.url_patterns.clear();
        let mut alpha = profile("Alpha", "myopenmath.com");
        alpha.active = true;
        let skills = [tone, aeries, off, alpha];

        let context = skill_context_for("https://www.myopenmath.com/", &skills);
        let order: Vec<&str> = context
            .installed_skill
            .lines()
            .filter(|line| line.starts_with("--- SKILL:"))
            .collect();
        assert_eq!(order, ["--- SKILL: Alpha ---", "--- SKILL: Tone ---"]);
        assert_eq!(context.profile_name.as_deref(), Some("Alpha"));

        let nowhere = skill_context_for("", &skills);
        assert_eq!(nowhere.profile_name, None);
        assert_eq!(nowhere.site_guide, "");
        assert!(nowhere.installed_skill.contains("--- SKILL: Tone ---"));
        assert!(!nowhere.installed_skill.contains("Alpha"));
    }

    #[test]
    fn loads_skills_from_a_folder() {
        let dir = std::env::temp_dir().join(format!("ogre-agent-skills-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("grading-tone")).unwrap();
        std::fs::create_dir_all(dir.join("empty-folder")).unwrap();
        std::fs::write(
            dir.join("grading-tone/SKILL.md"),
            "---\nname: Zeta Tone\ndescription: How to phrase feedback\nactive: true\n---\nBe specific.",
        )
        .unwrap();
        std::fs::write(
            dir.join("canvas.md"),
            "---\nurlPatterns:\n  - canvas.example\n---\n# Canvas notes\n\nUse SpeedGrader.",
        )
        .unwrap();
        std::fs::write(dir.join("blank.md"), "  \n").unwrap();
        std::fs::write(dir.join("notes.txt"), "not a skill").unwrap();

        let skills = load_skills_dir(&dir, SkillSource::Local).unwrap();
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(
            names(&skills.iter().collect::<Vec<_>>()),
            ["Canvas notes", "Zeta Tone"]
        );
        let canvas = &skills[0];
        assert_eq!(canvas.id, "canvas");
        assert_eq!(canvas.description, "Use SpeedGrader.");
        assert_eq!(canvas.url_patterns, ["canvas.example"]);
        assert!(!canvas.active);
        assert_eq!(canvas.source, SkillSource::Local);
        assert!(canvas.updated_at.is_some());
        let tone = &skills[1];
        assert_eq!(tone.id, "grading-tone");
        assert!(tone.active);
        assert_eq!(tone.description, "How to phrase feedback");

        assert!(load_skills_dir(&dir.join("missing"), SkillSource::Local).is_err());
    }

    #[test]
    fn a_skill_written_in_the_form_reads_back_as_written() {
        let draft = SkillDraft {
            name: "Late \"work\" \\ policy".to_owned(),
            description: "  How this class\n treats late work. ".to_owned(),
            sites: vec![" schoology.com ".to_owned(), String::new()],
            body: "\n# Late work\n\nTake a point off for each day late.\n".to_owned(),
        };
        let file = draft.to_markdown();
        assert!(
            file.starts_with("---\nname: \"Late \\\"work\\\" \\\\ policy\"\n"),
            "{file}"
        );
        assert!(file.ends_with("---\n\n# Late work\n\nTake a point off for each day late.\n"));

        let read = SkillDraft::from_markdown(&file);
        assert_eq!(read.name, "Late \"work\" \\ policy");
        assert_eq!(read.description, "How this class treats late work.");
        assert_eq!(read.sites, ["schoology.com"]);
        assert_eq!(
            read.body,
            "# Late work\n\nTake a point off for each day late."
        );
        // Saved again, nothing moves.
        assert_eq!(read.to_markdown(), file);

        let skill = Skill::from_markdown("late", "late", &file, SkillSource::Local);
        assert_eq!(skill.name, read.name);
        assert_eq!(skill.url_patterns, ["schoology.com"]);
    }

    #[test]
    fn a_plain_file_fills_the_form_without_inventing_a_description() {
        let draft = SkillDraft::from_markdown("# Rounding\n\nRound to two places.\n");
        assert_eq!(draft.name, "Rounding");
        assert_eq!(draft.description, "");
        assert!(draft.sites.is_empty());
        assert_eq!(draft.body, "# Rounding\n\nRound to two places.");
        // Without sites or a description the heading block is the name alone.
        assert_eq!(
            draft.to_markdown(),
            "---\nname: \"Rounding\"\n---\n\n# Rounding\n\nRound to two places.\n"
        );
    }
}
