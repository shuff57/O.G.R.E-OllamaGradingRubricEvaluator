//! The rules that decide, from the live page and not from anything the AI
//! says, when an action must wait for the teacher and when it is refused.
//!
//! # When approval is forced in auto mode
//!
//! * `runJS`, always.
//! * `navigate` to an address whose site (scheme, host and port) is not the
//!   one the task started on, nor one the teacher has since approved going to.
//! * Any click, key press, typing or editor write while the page itself is on
//!   such a site.
//! * `click` and `triple_click` when the element, the control it sits in, or
//!   whatever covers it at the click point
//!   - is a submit button (`<input type=submit|image>`, or a `<button>` of
//!     type submit inside a form) or a form's reset button,
//!   - has a word from [`COMMIT_WORDS`] in its text, label, id, name, classes,
//!     `onclick` or link address, or one of [`COMMIT_FRAGMENTS`] anywhere in
//!     its id, name, `onclick` or link address (ids such as `quicksavebtn`
//!     have no word breaks),
//!   - is a link to another site,
//!   - is a frame (`iframe`, `frame`, `object`, `embed`) or has a shadow root,
//!     because what the click lands on inside cannot be checked.
//! * `pressKey` when the focused element would be activated by Enter or Space
//!   and falls under the click rule; when Enter is pressed in an `<input>` of
//!   a form (which submits it); any key but Tab and Escape while a score
//!   field has the focus; and any key at all while a frame has the focus.
//! * `type` into a score field: a text field, dropdown or editable region
//!   with a word from [`SCORE_WORDS`] in its id, name, label, placeholder or
//!   classes, `score` or `grade` anywhere in the first four, or that only
//!   takes numbers.
//! * `type` with `clear` into a multi-line or rich text field that is not empty.
//! * Anything done to an element matching a caller-supplied protected
//!   selector (but Tab and Escape may still be pressed there).
//! * Anything done to an element that was guessed because the AI's selector
//!   matched nothing.
//!
//! # What is refused outright
//!
//! * Typing into a password field, or pressing any key but Tab, Escape and
//!   Enter while one has the focus.
//! * `navigate` to anything but an `http`, `https` or `file` address.

use std::fmt;

use url::Url;

use crate::action::{Action, ScrollDirection};
use crate::page::{ElementInfo, Target};

/// Words that mark a control as one that saves, sends or destroys something.
/// Matched against whole words, in their common inflections.
pub const COMMIT_WORDS: [&str; 38] = [
    "save",
    "submit",
    "delete",
    "remove",
    "post",
    "publish",
    "send",
    "update",
    "apply",
    "confirm",
    "finalize",
    "release",
    "discard",
    "erase",
    "destroy",
    "trash",
    "archive",
    "reset",
    "clear",
    "drop",
    "unenroll",
    "withdraw",
    "overwrite",
    "replace",
    "import",
    "upload",
    "sync",
    "credit",
    "excuse",
    "exempt",
    "regrade",
    "override",
    "purchase",
    "checkout",
    "pay",
    "buy",
    "logout",
    "signout",
];

/// Matched anywhere inside an id, name, `onclick` or link address.
pub const COMMIT_FRAGMENTS: [&str; 5] = ["save", "submit", "delete", "remove", "publish"];

/// Words that mark a field as holding a score.
pub const SCORE_WORDS: [&str; 12] = [
    "score",
    "scores",
    "grade",
    "grades",
    "point",
    "points",
    "pts",
    "mark",
    "marks",
    "credit",
    "percent",
    "percentage",
];

const SCORE_FRAGMENTS: [&str; 2] = ["score", "grade"];

/// Why an action has to wait for the teacher even in auto mode.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApprovalReason {
    RunsJavaScript,
    /// The action would take the browser to another site.
    LeavesSite {
        to: String,
    },
    /// The page is already on a site the task did not start on.
    OffSite {
        site: String,
    },
    /// The control submits, saves or deletes; `what` says how that was told.
    Commits {
        what: String,
    },
    /// The field holds a score or grade.
    EditsScore {
        what: String,
    },
    /// Existing text in a comment or feedback box would be replaced.
    ReplacesText,
    /// The element matches a protected selector.
    Protected,
    /// The input would go into a frame or shadow root, where it cannot be
    /// seen what receives it.
    Unseen {
        what: String,
    },
    /// The AI's selector matched nothing; the element is a best guess.
    GuessedTarget {
        how: String,
    },
}

impl ApprovalReason {
    /// Whether two reasons are of the same kind, whatever their details.
    pub fn same_kind(&self, other: &Self) -> bool {
        std::mem::discriminant(self) == std::mem::discriminant(other)
    }
}

impl fmt::Display for ApprovalReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RunsJavaScript => f.write_str("it runs JavaScript written by the AI in the page"),
            Self::LeavesSite { to } => {
                write!(f, "it leaves the site the task started on, for {to}")
            }
            Self::OffSite { site } => write!(
                f,
                "the page is on {site}, which is not the site the task started on"
            ),
            Self::Commits { what } => write!(f, "it may submit, save or delete: {what}"),
            Self::EditsScore { what } => write!(f, "it changes a score or grade: {what}"),
            Self::ReplacesText => f.write_str("it replaces text that is already in the box"),
            Self::Protected => f.write_str("the element is marked as needing approval"),
            Self::Unseen { what } => write!(
                f,
                "it goes into {what}, whose contents cannot be checked from here"
            ),
            Self::GuessedTarget { how } => write!(
                f,
                "the element is a guess, because what the AI named was not found ({how})"
            ),
        }
    }
}

/// The site of an address: scheme, host and port for `http` and `https`, and
/// one shared site for all local files. Other addresses belong to no site.
pub(crate) fn site_of(address: &str) -> Option<String> {
    let url = Url::parse(address).ok()?;
    match url.scheme() {
        "http" | "https" => Some(url.origin().ascii_serialization()),
        "file" => Some("file://".to_owned()),
        _ => None,
    }
}

/// The sites the agent may move within without asking.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct SiteScope {
    allowed: Vec<String>,
}

impl SiteScope {
    pub(crate) fn starting_at(address: &str) -> Self {
        Self {
            allowed: site_of(address).into_iter().collect(),
        }
    }

    pub(crate) fn allows(&self, address: &str) -> bool {
        site_of(address).is_some_and(|site| self.allowed.contains(&site))
    }

    /// Adds the site of an address the teacher approved going to.
    pub(crate) fn allow(&mut self, address: &str) {
        if let Some(site) = site_of(address)
            && !self.allowed.contains(&site)
        {
            self.allowed.push(site);
        }
    }
}

/// Makes the address in a `navigate` action absolute. `Err` carries the
/// reason an address is never opened.
pub(crate) fn navigation_target(written: &str, page_url: &str) -> Result<Url, String> {
    let written = written.trim();
    let url = match Url::parse(written) {
        Ok(url) => url,
        Err(url::ParseError::RelativeUrlWithoutBase) => Url::parse(page_url)
            .and_then(|base| base.join(written))
            .map_err(|_| format!("Not a valid address: {written}"))?,
        Err(e) => return Err(format!("Not a valid address: {written} ({e})")),
    };
    match url.scheme() {
        "http" | "https" | "file" => Ok(url),
        scheme => Err(format!(
            "Refusing to navigate to a {scheme}: address. Only http, https and file addresses can be opened."
        )),
    }
}

/// Lowercase words of `text`, split at anything that is not a letter or digit
/// and at the capital in `camelCase`.
fn words(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut previous_lower = false;
    for ch in text.chars() {
        if !ch.is_alphanumeric() {
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
            previous_lower = false;
            continue;
        }
        if ch.is_uppercase() && previous_lower && !current.is_empty() {
            out.push(std::mem::take(&mut current));
        }
        previous_lower = ch.is_lowercase();
        current.extend(ch.to_lowercase());
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

/// Whether `word` is `base` or one of its inflections: saves, saved, saving,
/// submitted, applies.
fn inflects(word: &str, base: &str) -> bool {
    let Some(rest) = word.strip_prefix(base) else {
        let stem = &base[..base.len() - 1];
        return match base.as_bytes()[base.len() - 1] {
            b'e' => word.strip_prefix(stem) == Some("ing"),
            b'y' => matches!(word.strip_prefix(stem), Some("ies" | "ied")),
            _ => false,
        };
    };
    if matches!(rest, "" | "s" | "d" | "es" | "ed" | "ing") {
        return true;
    }
    // A doubled final consonant: submitted, dropping.
    let last = &base[base.len() - 1..];
    rest.strip_prefix(last)
        .is_some_and(|rest| matches!(rest, "ed" | "ing"))
}

fn find_word(texts: &[&str], vocabulary: &[&'static str]) -> Option<&'static str> {
    let found: Vec<String> = texts.iter().flat_map(|text| words(text)).collect();
    // "log out" and "sign out" are two words on a button.
    let joined = found.join(" ");
    if vocabulary.contains(&"logout") {
        if joined.contains("log out") {
            return Some("logout");
        }
        if joined.contains("sign out") {
            return Some("signout");
        }
    }
    vocabulary
        .iter()
        .copied()
        .find(|base| found.iter().any(|word| inflects(word, base)))
}

fn find_fragment(texts: &[&str], fragments: &[&'static str]) -> Option<&'static str> {
    let lowered: Vec<String> = texts.iter().map(|text| text.to_lowercase()).collect();
    fragments
        .iter()
        .copied()
        .find(|fragment| lowered.iter().any(|text| text.contains(fragment)))
}

/// The part of a link that says what it does: path and query, not the host.
fn link_action(href: &str) -> String {
    match Url::parse(href) {
        Ok(url) => format!("{}?{}", url.path(), url.query().unwrap_or_default()),
        Err(_) => href.to_owned(),
    }
}

fn opt(text: &Option<String>) -> &str {
    text.as_deref().unwrap_or_default()
}

/// Says why a click on `info` could submit, save or delete, if it could.
pub(crate) fn commits(info: &ElementInfo) -> Option<String> {
    let kind = info.kind.as_deref().unwrap_or_default();
    match (info.tag.as_str(), kind) {
        ("input", "submit" | "image") => return Some("it is a submit button".to_owned()),
        ("button", "submit") if info.in_form => {
            return Some("it is a form's submit button".to_owned());
        }
        ("input" | "button", "reset") if info.in_form => {
            return Some("it is a reset button, which clears the form".to_owned());
        }
        _ => {}
    }
    let link = info.href.as_deref().map(link_action).unwrap_or_default();
    let classes = info.classes.join(" ");
    let worded = [
        info.text.as_str(),
        opt(&info.label),
        opt(&info.id),
        opt(&info.name),
        &classes,
        opt(&info.onclick),
        &link,
    ];
    if let Some(word) = find_word(&worded, &COMMIT_WORDS) {
        return Some(format!("its text or name says \"{word}\""));
    }
    let named = [opt(&info.id), opt(&info.name), opt(&info.onclick), &link];
    find_fragment(&named, &COMMIT_FRAGMENTS)
        .map(|fragment| format!("its name contains \"{fragment}\""))
}

/// Whether text can be typed into the element.
pub(crate) fn is_text_entry(info: &ElementInfo) -> bool {
    match info.tag.as_str() {
        "textarea" => true,
        "input" => !matches!(
            info.kind.as_deref().unwrap_or("text"),
            "submit"
                | "button"
                | "reset"
                | "image"
                | "checkbox"
                | "radio"
                | "file"
                | "hidden"
                | "range"
                | "color"
        ),
        _ => info.editable || info.role.as_deref() == Some("textbox"),
    }
}

/// Says why `info` looks like a score or grade field, if it does.
pub(crate) fn score_field(info: &ElementInfo) -> Option<String> {
    if !(is_text_entry(info) || info.tag == "select") {
        return None;
    }
    let classes = info.classes.join(" ");
    let named = [
        opt(&info.id),
        opt(&info.name),
        opt(&info.label),
        opt(&info.placeholder),
    ];
    let worded = [named[0], named[1], named[2], named[3], classes.as_str()];
    if let Some(word) = find_word(&worded, &SCORE_WORDS) {
        return Some(format!("its label or name says \"{word}\""));
    }
    if let Some(fragment) = find_fragment(&named, &SCORE_FRAGMENTS) {
        return Some(format!("its name contains \"{fragment}\""));
    }
    let numeric = info.kind.as_deref() == Some("number")
        || matches!(info.input_mode.as_deref(), Some("numeric" | "decimal"));
    numeric.then(|| "it only takes numbers".to_owned())
}

/// The DOM name of a key, whatever the AI called it.
pub(crate) fn normalize_key(key: &str) -> String {
    match key.trim() {
        "Space" | "Spacebar" | "space" => " ".to_owned(),
        "Return" | "enter" | "return" => "Enter".to_owned(),
        "Esc" | "esc" | "escape" => "Escape".to_owned(),
        "tab" => "Tab".to_owned(),
        other => other.to_owned(),
    }
}

fn harmless_in_a_field(key: &str) -> bool {
    matches!(key, "Tab" | "Escape")
}

/// Says why the action is never carried out, if it is not.
pub(crate) fn refusal(action: &Action, target: Option<&Target>) -> Option<String> {
    match (action, target) {
        (Action::Type { .. }, Some(target)) if target.element.password => Some(
            "Refusing to type into a password field. Passwords are for the teacher to enter."
                .to_owned(),
        ),
        (Action::Type { .. }, Some(target)) if !is_text_entry(&target.element) => Some(format!(
            "Cannot type into {}: it is not a text field.",
            target.element.describe()
        )),
        (Action::PressKey { key }, Some(focused)) if focused.element.password => {
            let key = normalize_key(key);
            (!harmless_in_a_field(&key) && key != "Enter").then(|| {
                "Refusing to press keys while a password field has the focus. Passwords are for the teacher to enter."
                    .to_owned()
            })
        }
        _ => None,
    }
}

fn click_reasons(info: &ElementInfo, scope: &SiteScope, reasons: &mut Vec<ApprovalReason>) {
    if let Some(why) = commits(info) {
        reasons.push(ApprovalReason::Commits {
            what: format!("{} ({why})", info.describe()),
        });
    }
    if let Some(href) = &info.href
        && let Some(site) = site_of(href)
        && !scope.allows(href)
    {
        reasons.push(ApprovalReason::LeavesSite { to: site });
    }
    if info.opaque {
        reasons.push(ApprovalReason::Unseen {
            what: info.describe(),
        });
    }
}

/// Every reason the action needs approval even in auto mode. `target` is the
/// element the action names, or for `pressKey` the element with the focus.
pub(crate) fn forced_approval(
    action: &Action,
    target: Option<&Target>,
    scope: &SiteScope,
    page_url: &str,
) -> Vec<ApprovalReason> {
    let mut reasons = Vec::new();

    let acts_on_page = matches!(
        action,
        Action::Click { .. }
            | Action::TripleClick { .. }
            | Action::Type { .. }
            | Action::PressKey { .. }
            | Action::WriteCodeMirror { .. }
    );
    if acts_on_page && !scope.allows(page_url) {
        reasons.push(ApprovalReason::OffSite {
            site: site_of(page_url).unwrap_or_else(|| page_url.to_owned()),
        });
    }

    match action {
        Action::RunJs { .. } => reasons.push(ApprovalReason::RunsJavaScript),
        Action::Navigate { url } => {
            if let Ok(url) = navigation_target(url, page_url)
                && !scope.allows(url.as_str())
            {
                reasons.push(ApprovalReason::LeavesSite {
                    to: site_of(url.as_str()).unwrap_or_else(|| url.to_string()),
                });
            }
        }
        Action::Click { .. } | Action::TripleClick { .. } => {
            if let Some(target) = target {
                for info in target.click_recipients() {
                    click_reasons(info, scope, &mut reasons);
                }
            }
        }
        Action::Type { clear, .. } => {
            if let Some(target) = target {
                // Typing starts with a click on the field, which lands on
                // whatever covers it.
                if let Some(cover) = &target.covered_by {
                    click_reasons(cover, scope, &mut reasons);
                }
                if let Some(why) = score_field(&target.element) {
                    reasons.push(ApprovalReason::EditsScore {
                        what: format!("{} ({why})", target.element.describe()),
                    });
                }
                let prose = target.element.tag == "textarea"
                    || target.element.editable
                    || target.element.role.as_deref() == Some("textbox");
                if *clear && prose && target.element.empty == Some(false) {
                    reasons.push(ApprovalReason::ReplacesText);
                }
            }
        }
        Action::PressKey { key } => {
            if let Some(focused) = target {
                let key = normalize_key(key);
                let element = &focused.element;
                if matches!(key.as_str(), "Enter" | " ") {
                    for info in [Some(element), focused.control.as_ref()]
                        .into_iter()
                        .flatten()
                    {
                        click_reasons(info, scope, &mut reasons);
                    }
                }
                if element.opaque {
                    reasons.push(ApprovalReason::Unseen {
                        what: element.describe(),
                    });
                }
                if key == "Enter" && element.tag == "input" && element.in_form {
                    reasons.push(ApprovalReason::Commits {
                        what: format!("pressing Enter in {} submits its form", element.describe()),
                    });
                }
                if !harmless_in_a_field(&key)
                    && let Some(why) = score_field(element)
                {
                    reasons.push(ApprovalReason::EditsScore {
                        what: format!("{} ({why})", element.describe()),
                    });
                }
            }
        }
        _ => {}
    }

    if acts_on_page && let Some(target) = target {
        let passive_key =
            matches!(action, Action::PressKey { key } if harmless_in_a_field(&normalize_key(key)));
        if target.protected && !passive_key {
            reasons.push(ApprovalReason::Protected);
        }
        if let Some(how) = &target.guessed {
            reasons.push(ApprovalReason::GuessedTarget { how: how.clone() });
        }
    }

    let mut unique: Vec<ApprovalReason> = Vec::new();
    for reason in reasons {
        if !unique.iter().any(|kept| kept.same_kind(&reason)) {
            unique.push(reason);
        }
    }
    unique
}

/// What the action will do, in words for the teacher.
pub(crate) fn describe_action(action: &Action, target: Option<&Target>) -> String {
    let element = || match target {
        Some(target) => target.describe(),
        None => action
            .selector()
            .map_or_else(|| "the page".to_owned(), |written| format!("\"{written}\"")),
    };
    match action {
        Action::Click { .. } => format!("Click {}", element()),
        Action::TripleClick { .. } => format!("Click {} and select all of its text", element()),
        Action::Type { text, clear, .. } => {
            let how = if *clear {
                ", replacing what is there"
            } else {
                ", adding to what is there"
            };
            format!("Type {text:?} into {}{how}", element())
        }
        Action::Scroll { direction, amount } => {
            let direction = match direction {
                ScrollDirection::Up => "up",
                ScrollDirection::Down => "down",
                ScrollDirection::Left => "left",
                ScrollDirection::Right => "right",
            };
            format!("Scroll {direction} by {amount} pixels")
        }
        Action::ScrollIntoView { text } => format!("Scroll to the text {text:?}"),
        Action::ReadText { selector: None } => "Read the text of the page".to_owned(),
        Action::ReadText { selector: Some(_) } => format!("Read the text of {}", element()),
        Action::Screenshot => "Take a picture of the page".to_owned(),
        Action::WaitFor { selector, .. } => format!("Wait for \"{selector}\" to appear"),
        Action::Navigate { url } => format!("Go to {url}"),
        Action::RunJs { code } => format!("Run this JavaScript in the page:\n{code}"),
        Action::Sleep { ms } => format!("Wait {ms} ms"),
        Action::PressKey { key } => match target {
            Some(focused) => format!(
                "Press the {key} key while {} has the keyboard focus",
                focused.describe()
            ),
            None => format!("Press the {key} key (nothing has the keyboard focus)"),
        },
        Action::WriteCodeMirror { value, .. } => format!(
            "Replace the contents of the code editor {} with {} characters of new text",
            element(),
            value.chars().count()
        ),
        Action::Done { success, message } => {
            let how = if *success {
                "finished"
            } else {
                "could not be finished"
            };
            format!("Report that the task {how}: {message}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(tag: &str) -> ElementInfo {
        ElementInfo {
            tag: tag.to_owned(),
            ..ElementInfo::default()
        }
    }

    fn target(element: ElementInfo) -> Target {
        Target {
            ref_id: "e1".into(),
            selector: "#x".into(),
            element,
            control: None,
            covered_by: None,
            protected: false,
            guessed: None,
            x: 10.0,
            y: 10.0,
            has_box: true,
            in_viewport: true,
        }
    }

    const HOME: &str = "https://www.myopenmath.com/course/gradeallq2.php?cid=1";

    type Tweak = fn(&mut ElementInfo);

    fn kinds(action: &Action, target: Option<&Target>) -> Vec<&'static str> {
        let scope = SiteScope::starting_at(HOME);
        forced_approval(action, target, &scope, HOME)
            .iter()
            .map(|reason| match reason {
                ApprovalReason::RunsJavaScript => "js",
                ApprovalReason::LeavesSite { .. } => "leaves",
                ApprovalReason::OffSite { .. } => "offsite",
                ApprovalReason::Commits { .. } => "commits",
                ApprovalReason::EditsScore { .. } => "score",
                ApprovalReason::ReplacesText => "replaces",
                ApprovalReason::Protected => "protected",
                ApprovalReason::Unseen { .. } => "unseen",
                ApprovalReason::GuessedTarget { .. } => "guessed",
            })
            .collect()
    }

    fn click() -> Action {
        Action::Click {
            selector: "e1".into(),
        }
    }

    fn typing(clear: bool) -> Action {
        Action::Type {
            selector: "e1".into(),
            text: "8".into(),
            clear,
        }
    }

    fn key(key: &str) -> Action {
        Action::PressKey { key: key.into() }
    }

    #[test]
    fn splits_words_at_punctuation_and_camel_case() {
        assert_eq!(
            words("btn-save_all quickSave HTMLPost x2"),
            ["btn", "save", "all", "quick", "save", "htmlpost", "x2"]
        );
        assert!(words("  ").is_empty());
    }

    #[test]
    fn matches_inflections_but_not_longer_words() {
        for word in ["save", "saves", "saved", "saving"] {
            assert!(inflects(word, "save"), "{word}");
        }
        for word in [
            "submitted",
            "submitting",
            "dropped",
            "applies",
            "applied",
            "posted",
        ] {
            let base = COMMIT_WORDS.iter().find(|base| inflects(word, base));
            assert!(base.is_some(), "{word}");
        }
        for word in [
            "dropdown",
            "clearfix",
            "postpone",
            "poster",
            "payload",
            "important",
            "async",
            "sender",
            "savers",
        ] {
            let base = COMMIT_WORDS.iter().find(|base| inflects(word, base));
            assert_eq!(base, None, "{word}");
        }
    }

    #[test]
    fn submit_controls_commit_by_their_structure() {
        let mut submit = info("input");
        submit.kind = Some("submit".into());
        assert!(commits(&submit).is_some());

        let mut button = info("button");
        button.kind = Some("submit".into());
        button.text = "Go".into();
        assert_eq!(
            commits(&button),
            None,
            "a submit-type button outside a form does nothing"
        );
        button.in_form = true;
        assert!(commits(&button).is_some());

        let mut plain = info("button");
        plain.kind = Some("button".into());
        plain.in_form = true;
        plain.text = "Show hint".into();
        assert_eq!(commits(&plain), None);

        let mut reset = info("input");
        reset.kind = Some("reset".into());
        reset.in_form = true;
        assert!(commits(&reset).is_some());
    }

    #[test]
    fn controls_commit_by_what_they_are_called() {
        let mut quick_save = info("button");
        quick_save.kind = Some("button".into());
        quick_save.id = Some("quicksavebtn".into());
        assert_eq!(
            commits(&quick_save).as_deref(),
            Some("its name contains \"save\"")
        );

        let cases: [(&str, Tweak); 9] = [
            ("text", |e| e.text = "Post grades".into()),
            ("label", |e| e.label = Some("Delete assignment".into())),
            ("classes", |e| {
                e.classes = vec!["btn".into(), "btn-remove".into()]
            }),
            ("onclick", |e| e.onclick = Some("deleteItem(3)".into())),
            ("href", |e| {
                e.href = Some("https://www.myopenmath.com/course/delete.php?id=3".into())
            }),
            ("javascript href", |e| {
                e.href = Some("javascript:submitForm()".into())
            }),
            ("two words", |e| e.text = "Log Out".into()),
            ("quick grade", |e| e.text = "Full credit".into()),
            ("camel id", |e| e.id = Some("btnUpdateAll".into())),
        ];
        for (what, set) in cases {
            let mut link = info("a");
            set(&mut link);
            assert!(commits(&link).is_some(), "{what}");
        }

        let harmless: [(&str, Tweak); 5] = [
            ("menu", |e| {
                e.classes = vec!["dropdown-toggle".into(), "clearfix".into()]
            }),
            ("text", |e| e.text = "View gradebook".into()),
            ("host is not the action", |e| {
                e.href = Some("https://save.example.com/list".into())
            }),
            ("id", |e| e.id = Some("nextStudent".into())),
            ("important", |e| e.text = "Important dates".into()),
        ];
        for (what, set) in harmless {
            let mut link = info("a");
            set(&mut link);
            assert_eq!(commits(&link), None, "{what}");
        }
    }

    #[test]
    fn clicking_a_committing_control_needs_approval() {
        let mut save = info("button");
        save.text = "Quick Save".into();
        assert_eq!(kinds(&click(), Some(&target(save.clone()))), ["commits"]);
        assert_eq!(
            kinds(
                &Action::TripleClick {
                    selector: "e1".into()
                },
                Some(&target(save.clone()))
            ),
            ["commits"]
        );

        // The icon inside the button, and the button under an overlay, count too.
        let mut icon = target(info("span"));
        icon.control = Some(save.clone());
        assert_eq!(kinds(&click(), Some(&icon)), ["commits"]);
        let mut covered = target(info("div"));
        covered.covered_by = Some(save);
        assert_eq!(kinds(&click(), Some(&covered)), ["commits"]);

        let mut next = info("a");
        next.text = "Next student".into();
        next.href = Some("https://www.myopenmath.com/course/gradeallq2.php?stu=2".into());
        assert!(kinds(&click(), Some(&target(next))).is_empty());
    }

    #[test]
    fn a_link_to_another_site_needs_approval() {
        let mut away = info("a");
        away.text = "Help".into();
        away.href = Some("https://help.example.com/".into());
        assert_eq!(kinds(&click(), Some(&target(away.clone()))), ["leaves"]);

        // Focused and activated from the keyboard, it is the same link.
        assert_eq!(
            kinds(&key("Enter"), Some(&target(away.clone()))),
            ["leaves"]
        );
        assert!(kinds(&key("Tab"), Some(&target(away))).is_empty());

        let mut mail = info("a");
        mail.href = Some("mailto:someone@example.com".into());
        assert!(kinds(&click(), Some(&target(mail))).is_empty());
    }

    #[test]
    fn typing_into_a_score_field_needs_approval() {
        let mut by_label = info("input");
        by_label.kind = Some("text".into());
        by_label.label = Some("Score for part 1".into());
        let mut by_id = info("input");
        by_id.id = Some("scorebox3".into());
        let mut by_class = info("textarea");
        by_class.classes = vec!["points".into()];
        let mut numeric = info("input");
        numeric.kind = Some("number".into());
        let mut decimal = info("input");
        decimal.input_mode = Some("decimal".into());
        let mut rating = info("select");
        rating.name = Some("grade".into());
        for field in [by_label, by_id, by_class, numeric, decimal, rating] {
            assert_eq!(
                kinds(&typing(false), Some(&target(field.clone()))),
                ["score"],
                "{field:?}"
            );
        }

        let mut search = info("input");
        search.kind = Some("search".into());
        search.placeholder = Some("Find a student".into());
        assert!(kinds(&typing(true), Some(&target(search))).is_empty());

        // A button named "grade" is not a field.
        let mut button = info("button");
        button.id = Some("grade".into());
        assert_eq!(score_field(&button), None);
    }

    #[test]
    fn keys_pressed_in_a_score_field_need_approval_except_tab_and_escape() {
        let mut score = info("input");
        score.label = Some("Score".into());
        let focused = target(score);
        for pressed in ["5", "Backspace", "Delete", "ArrowUp"] {
            assert_eq!(kinds(&key(pressed), Some(&focused)), ["score"], "{pressed}");
        }
        assert!(kinds(&key("Tab"), Some(&focused)).is_empty());
        assert!(kinds(&key("Escape"), Some(&focused)).is_empty());
    }

    #[test]
    fn enter_and_space_on_a_committing_control_need_approval() {
        let mut save = info("button");
        save.text = "Save".into();
        let focused = target(save);
        assert_eq!(kinds(&key("Enter"), Some(&focused)), ["commits"]);
        assert_eq!(kinds(&key("Space"), Some(&focused)), ["commits"]);
        assert!(kinds(&key("Tab"), Some(&focused)).is_empty());
        assert!(kinds(&key("a"), Some(&focused)).is_empty());
        assert!(kinds(&key("Enter"), None).is_empty());
    }

    #[test]
    fn enter_in_a_form_field_needs_approval_because_it_submits_the_form() {
        let mut field = info("input");
        field.kind = Some("text".into());
        field.name = Some("q".into());
        assert!(kinds(&key("Enter"), Some(&target(field.clone()))).is_empty());
        field.in_form = true;
        assert_eq!(
            kinds(&key("Enter"), Some(&target(field.clone()))),
            ["commits"]
        );
        assert!(kinds(&key("a"), Some(&target(field))).is_empty());

        let mut multi = info("textarea");
        multi.in_form = true;
        assert!(kinds(&key("Enter"), Some(&target(multi))).is_empty());
    }

    #[test]
    fn input_into_a_frame_or_shadow_root_needs_approval() {
        let mut frame = info("iframe");
        frame.opaque = true;
        assert_eq!(kinds(&click(), Some(&target(frame.clone()))), ["unseen"]);
        // With the focus inside the frame, every key goes somewhere unseen.
        assert_eq!(kinds(&key("Tab"), Some(&target(frame.clone()))), ["unseen"]);
        // A frame lying over the element takes the click.
        let mut under = target(info("a"));
        under.covered_by = Some(frame);
        assert_eq!(kinds(&click(), Some(&under)), ["unseen"]);
        assert_eq!(kinds(&typing(false), Some(&under)), ["unseen"]);
    }

    #[test]
    fn enter_on_a_checkbox_in_a_form_submits_it_too() {
        let mut checkbox = info("input");
        checkbox.kind = Some("checkbox".into());
        checkbox.in_form = true;
        assert_eq!(
            kinds(&key("Enter"), Some(&target(checkbox.clone()))),
            ["commits"]
        );
        assert!(kinds(&key(" "), Some(&target(checkbox))).is_empty());
    }

    #[test]
    fn replacing_existing_prose_needs_approval() {
        let mut feedback = info("div");
        feedback.editable = true;
        feedback.role = Some("textbox".into());
        feedback.empty = Some(false);
        assert_eq!(
            kinds(&typing(true), Some(&target(feedback.clone()))),
            ["replaces"]
        );
        assert!(kinds(&typing(false), Some(&target(feedback.clone()))).is_empty());
        feedback.empty = Some(true);
        assert!(kinds(&typing(true), Some(&target(feedback))).is_empty());
    }

    #[test]
    fn run_js_always_needs_approval() {
        let run = Action::RunJs { code: "1".into() };
        assert_eq!(kinds(&run, None), ["js"]);
    }

    #[test]
    fn navigating_needs_approval_only_when_it_leaves_the_site() {
        let go = |url: &str| kinds(&Action::Navigate { url: url.into() }, None);
        assert!(go("https://www.myopenmath.com/course/course.php?cid=1").is_empty());
        assert!(go("/course/course.php?cid=1").is_empty());
        assert!(go("gb-view.php").is_empty());
        assert_eq!(go("https://myopenmath.com/"), ["leaves"], "another host");
        assert_eq!(
            go("http://www.myopenmath.com/"),
            ["leaves"],
            "another scheme"
        );
        assert_eq!(
            go("https://www.myopenmath.com:8443/"),
            ["leaves"],
            "another port"
        );
        assert_eq!(go("https://www.myopenmath.com.evil.example/"), ["leaves"]);
        assert_eq!(go("file:///etc/passwd"), ["leaves"]);
    }

    #[test]
    fn a_task_started_on_no_site_has_to_ask_before_going_anywhere() {
        let scope = SiteScope::starting_at("about:blank");
        let go = Action::Navigate {
            url: "https://www.myopenmath.com/".into(),
        };
        assert_eq!(forced_approval(&go, None, &scope, "about:blank").len(), 1);

        let mut approved = scope.clone();
        approved.allow("https://www.myopenmath.com/index.php");
        assert!(forced_approval(&go, None, &approved, "about:blank").is_empty());
    }

    #[test]
    fn acting_on_a_page_of_another_site_needs_approval() {
        let scope = SiteScope::starting_at(HOME);
        let elsewhere = "https://other.example.com/page";
        let link = target(info("a"));
        for action in [
            click(),
            typing(false),
            key("a"),
            Action::WriteCodeMirror {
                selector: "e1".into(),
                value: "x".into(),
            },
        ] {
            let reasons = forced_approval(&action, Some(&link), &scope, elsewhere);
            assert!(
                reasons
                    .iter()
                    .any(|r| matches!(r, ApprovalReason::OffSite { .. })),
                "{action:?}"
            );
        }
        let read = Action::ReadText { selector: None };
        assert!(forced_approval(&read, None, &scope, elsewhere).is_empty());
    }

    #[test]
    fn local_files_are_one_site() {
        let scope = SiteScope::starting_at("file:///tmp/a.html");
        assert!(scope.allows("file:///tmp/b.html"));
        assert!(!scope.allows("https://example.com/"));
    }

    #[test]
    fn protected_and_guessed_targets_need_approval() {
        let mut protected = target(info("div"));
        protected.protected = true;
        assert_eq!(kinds(&click(), Some(&protected)), ["protected"]);
        assert_eq!(kinds(&key("5"), Some(&protected)), ["protected"]);
        assert!(kinds(&key("Tab"), Some(&protected)).is_empty());

        let mut guessed = target(info("a"));
        guessed.guessed = Some("Fuzzy matched via tag-position-heuristic".into());
        assert_eq!(kinds(&click(), Some(&guessed)), ["guessed"]);
    }

    #[test]
    fn looking_never_needs_approval() {
        let mut save = info("button");
        save.text = "Save".into();
        let save = target(save);
        let looking = [
            Action::ReadText {
                selector: Some("e1".into()),
            },
            Action::Screenshot,
            Action::Scroll {
                direction: crate::ScrollDirection::Down,
                amount: 100.0,
            },
            Action::ScrollIntoView {
                text: "Save".into(),
            },
            Action::WaitFor {
                selector: "#x".into(),
                timeout_ms: None,
            },
            Action::Sleep { ms: 10 },
            Action::Done {
                success: true,
                message: "ok".into(),
            },
        ];
        for action in looking {
            assert!(action.is_read_only());
            assert!(kinds(&action, Some(&save)).is_empty(), "{action:?}");
        }
    }

    #[test]
    fn passwords_are_never_typed() {
        let mut password = info("input");
        password.kind = Some("password".into());
        password.password = true;
        let field = target(password);
        assert!(refusal(&typing(false), Some(&field)).is_some());
        assert!(refusal(&key("a"), Some(&field)).is_some());
        assert!(refusal(&key("Backspace"), Some(&field)).is_some());
        assert_eq!(refusal(&key("Tab"), Some(&field)), None);
        assert_eq!(refusal(&click(), Some(&field)), None);
    }

    #[test]
    fn typing_is_refused_on_things_that_are_not_text_fields() {
        let mut button = info("button");
        button.text = "Save".into();
        let refused = refusal(&typing(false), Some(&target(button))).unwrap();
        assert!(refused.contains("not a text field"), "{refused}");

        let mut checkbox = info("input");
        checkbox.kind = Some("checkbox".into());
        assert!(refusal(&typing(false), Some(&target(checkbox))).is_some());
        assert_eq!(
            refusal(&typing(false), Some(&target(info("textarea")))),
            None
        );
    }

    #[test]
    fn only_web_and_file_addresses_are_opened() {
        assert!(navigation_target("javascript:alert(1)", HOME).is_err());
        assert!(navigation_target("data:text/html,<script>x</script>", HOME).is_err());
        assert!(navigation_target("chrome://settings", HOME).is_err());
        assert!(navigation_target("about:blank", HOME).is_err());
        assert_eq!(
            navigation_target(" gb.php?cid=1 ", HOME).unwrap().as_str(),
            "https://www.myopenmath.com/course/gb.php?cid=1"
        );
        assert!(
            navigation_target("gb.php", "").is_err(),
            "no page to be relative to"
        );
    }

    #[test]
    fn describes_actions_for_the_teacher() {
        let mut score = info("input");
        score.label = Some("Score".into());
        score.value = Some("3.5".into());
        assert_eq!(
            describe_action(&typing(true), Some(&target(score))),
            "Type \"8\" into the text box \"Score\" (currently \"3.5\"), replacing what is there"
        );
        assert_eq!(describe_action(&click(), None), "Click \"e1\"");
        assert_eq!(
            describe_action(
                &Action::Scroll {
                    direction: crate::ScrollDirection::Down,
                    amount: 300.0
                },
                None
            ),
            "Scroll down by 300 pixels"
        );
        assert_eq!(
            describe_action(&key("Enter"), None),
            "Press the Enter key (nothing has the keyboard focus)"
        );
    }
}
