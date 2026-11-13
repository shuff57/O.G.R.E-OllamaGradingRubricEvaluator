//! Working out a grading page's layout from its structure alone, without AI.
//!
//! Nothing here knows any particular site. It looks for rows that repeat and
//! each hold a score box, then for a name, an answer and a feedback box in
//! the same place in every row, and writes selectors that are true of all the
//! rows it was shown rather than of the first one.

use ogre_core::FeedbackKind;

use super::profile::{ButtonRule, FeedbackBox, MaxScoreRule, PageMap, SaveRule, SiteProfile};
use super::snapshot::{Snapshot, SnapshotNode as Node};

/// Below this the page does not look like a grading page at all.
const MIN_CONFIDENCE: f64 = 0.3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Every student is on the page at once.
    Batch,
    /// The page shows one student and has buttons to move between them.
    Sequential,
}

/// What the structure of a page suggests about how to grade on it.
#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    pub mode: Mode,
    pub candidates: Candidates,
    /// From 0 to 1: 0.4 for repeating rows, 0.3 for a score box, 0.2 for a
    /// name, 0.1 for a save button.
    pub confidence: f64,
    /// What was found, for showing to a person.
    pub pattern_name: String,
    /// How many students the page shows, when rows were found. A profile that
    /// reads a different number has the wrong student section.
    pub students_seen: Option<usize>,
}

/// The selectors proposed for each part of the page. Everything but the
/// section and the save button is relative to a student's section.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Candidates {
    pub student_section: Option<String>,
    pub student_name: Option<String>,
    pub score_input: Option<String>,
    pub max_score: Option<MaxScoreRule>,
    pub feedback: Option<FeedbackBox>,
    pub response: Option<String>,
    pub save_button: Option<ButtonRule>,
    /// The buttons to the next and the previous student, on a page that
    /// shows one student.
    pub next_student: Option<ButtonRule>,
    pub previous_student: Option<ButtonRule>,
}

impl Detection {
    /// The candidates as a page map, if the parts no profile can do without
    /// were all found.
    pub fn page_map(&self) -> Option<PageMap> {
        let found = &self.candidates;
        if self.mode == Mode::Batch && found.student_section.is_none() {
            return None;
        }
        Some(PageMap {
            student_section: found.student_section.clone(),
            student_name: found.student_name.clone()?,
            score_input: found.score_input.clone()?,
            max_score: found.max_score.clone(),
            feedback: found.feedback.clone(),
            response: found.response.clone()?,
            prompt: None,
            // Structure cannot show how the site confirms a save.
            save: found.save_button.clone().map(|button| SaveRule {
                button,
                success: None,
            }),
            next_student: found.next_student.clone(),
            previous_student: found.previous_student.clone(),
        })
    }
}

/// A draft profile for the page in `snapshot`, or `None` if its structure
/// does not give one away. The draft is a guess until it passes validation.
pub fn draft_profile(snapshot: &Snapshot) -> Option<SiteProfile> {
    let map = detect(snapshot)?.page_map()?;
    Some(SiteProfile::for_page(&snapshot.url, map))
}

/// Looks for the shape of a grading page in `snapshot`.
pub fn detect(snapshot: &Snapshot) -> Option<Detection> {
    let page = Tree::of(&snapshot.root);
    let rows = find_rows(&page);
    let found = match &rows {
        Some(rows) => in_rows(&page, rows),
        None => on_page(&page),
    };

    let outside_rows: Vec<&Node> = match &rows {
        Some(rows) => (0..page.nodes.len())
            .filter(|&i| !rows.members.iter().any(|&row| page.is_within(i, row)))
            .map(|i| page.nodes[i])
            .collect(),
        None => page.nodes.clone(),
    };
    let save_button = outside_rows.iter().copied().find(|n| is_save_button(n));
    let has_nav = page.nodes.iter().any(|n| is_nav_button(n));

    let mut confidence = 0.0;
    let mut patterns = Vec::new();
    for (present, weight, pattern) in [
        (rows.is_some(), 0.4, "repeating-rows"),
        (found.score_input.is_some(), 0.3, "score-input"),
        (found.student_name.is_some(), 0.2, "name-candidate"),
        (save_button.is_some(), 0.1, "save-button"),
    ] {
        if present {
            confidence += weight;
            patterns.push(pattern);
        }
    }
    if confidence < MIN_CONFIDENCE {
        return None;
    }

    let mode = if has_nav && found.score_input.is_some() && rows.is_none() {
        Mode::Sequential
    } else {
        Mode::Batch
    };
    // A button that saves and moves on is the save button, not the way on.
    let step = |which: Step| {
        (mode == Mode::Sequential)
            .then(|| {
                page.nodes
                    .iter()
                    .copied()
                    .find(|n| steps(n) == Some(which) && !is_save_button(n))
            })
            .flatten()
            .and_then(|button| button_rule(button, &page))
    };
    let kind = match mode {
        Mode::Batch => "Batch grading",
        Mode::Sequential => "Sequential grading",
    };
    Some(Detection {
        mode,
        candidates: Candidates {
            save_button: save_button.and_then(|button| button_rule(button, &page)),
            next_student: step(Step::Next),
            previous_student: step(Step::Previous),
            ..found
        },
        confidence: f64::min(confidence, 1.0),
        pattern_name: format!("{kind} ({})", patterns.join(", ")),
        students_seen: rows.as_ref().map(|rows| rows.total),
    })
}

// ---- The page as a tree with parents ------------------------------------

struct Tree<'a> {
    /// Parents before children, in page order. Index 0 is the root.
    nodes: Vec<&'a Node>,
    parents: Vec<Option<usize>>,
}

impl<'a> Tree<'a> {
    fn of(root: &'a Node) -> Self {
        let mut tree = Self {
            nodes: Vec::new(),
            parents: Vec::new(),
        };
        let mut stack = vec![(root, None)];
        while let Some((node, parent)) = stack.pop() {
            let index = tree.nodes.len();
            tree.nodes.push(node);
            tree.parents.push(parent);
            stack.extend(node.children.iter().rev().map(|c| (c, Some(index))));
        }
        tree
    }

    /// Whether `index` is `ancestor` or below it.
    fn is_within(&self, index: usize, ancestor: usize) -> bool {
        let mut at = Some(index);
        while let Some(i) = at {
            if i == ancestor {
                return true;
            }
            at = self.parents[i];
        }
        false
    }

    /// The node `levels` above `index`, if that is still below `top`.
    fn ancestor(&self, index: usize, levels: usize, top: usize) -> Option<usize> {
        let mut at = index;
        for _ in 0..levels {
            at = self.parents[at]?;
        }
        (at != top && self.is_within(at, top)).then_some(at)
    }

    /// Everything below `top`, not `top` itself.
    fn below(&self, top: usize) -> impl Iterator<Item = usize> + '_ {
        (top + 1..self.nodes.len()).take_while(move |&i| self.is_within(i, top))
    }

    /// Total length of the text in `index` and below, leaving out "/ 10" labels.
    fn text_weight(&self, index: usize) -> usize {
        std::iter::once(index)
            .chain(self.below(index))
            .map(|i| self.nodes[i])
            .filter(|n| !is_max_text(n.text()))
            .map(|n| n.text_len.max(n.text().chars().count()))
            .sum()
    }
}

// ---- Selectors that hold for every row ----------------------------------

#[derive(Debug, Clone, PartialEq)]
enum Test {
    Any,
    Id(String),
    Class(String),
    Equals(&'static str, String),
    Prefix(&'static str, String),
    Has(String),
}

/// One element's worth of selector: a tag and at most one condition.
#[derive(Debug, Clone, PartialEq)]
struct Simple {
    tag: String,
    test: Test,
}

impl Simple {
    fn matches(&self, node: &Node) -> bool {
        node.tag == self.tag
            && match &self.test {
                Test::Any => true,
                Test::Id(id) => node.attr("id") == id,
                Test::Class(class) => node.classes().any(|c| c == class),
                Test::Equals(attr, value) => node.attr(attr) == value,
                Test::Prefix(attr, prefix) => node.attr(attr).starts_with(prefix.as_str()),
                Test::Has(attr) => node.has_attr(attr),
            }
    }

    fn css(&self) -> String {
        let tag = &self.tag;
        match &self.test {
            Test::Any => tag.clone(),
            Test::Id(id) => format!("#{id}"),
            Test::Class(class) => format!("{tag}.{class}"),
            Test::Equals(attr, value) => format!("{tag}[{attr}={}]", quoted(value)),
            Test::Prefix(attr, prefix) => format!("{tag}[{attr}^={}]", quoted(prefix)),
            Test::Has(attr) => format!("{tag}[{attr}]"),
        }
    }
}

fn quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Whether `text` can be written in a selector as it stands.
fn is_identifier(text: &str) -> bool {
    let mut chars = text.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

const TEST_IDS: [&str; 6] = [
    "data-testid",
    "data-test-id",
    "data-test",
    "data-qa",
    "data-cy",
    "data-component",
];

/// What the values have in common before the part that numbers them:
/// `score_` for `score_1` and `score_2`, `fb-` for `fb-0-2-1001`.
fn stem<'a>(values: &[&'a str]) -> &'a str {
    let Some(first) = values.first() else {
        return "";
    };
    let mut end = first.len();
    for value in values {
        end = first
            .char_indices()
            .zip(value.chars())
            .take_while(|((_, a), b)| a == b)
            .last()
            .map_or(0, |((at, a), _)| at + a.len_utf8())
            .min(end);
    }
    let common = &first[..end];
    let cut = common.find(|c: char| c.is_ascii_digit()).unwrap_or(end);
    &common[..cut]
}

/// The value all of `nodes` give for `attr`, if they agree and it is not empty.
fn agreed<'a>(nodes: &[&'a Node], attr: &str) -> Option<&'a str> {
    let first = nodes.first()?.attr(attr);
    (!first.is_empty() && nodes.iter().all(|n| n.attr(attr) == first)).then_some(first)
}

/// A condition on `name` or `id`: the value itself where the nodes share
/// one, otherwise what their values have in common before they are numbered.
fn by_identifier(nodes: &[&Node], attr: &'static str) -> Option<Test> {
    if let Some(value) = agreed(nodes, attr) {
        // Rows that all carry the same id are invalid HTML that still occurs;
        // only an attribute selector finds such an id inside each row.
        let unique_id = attr == "id" && nodes.len() == 1 && is_identifier(value);
        return Some(if unique_id {
            Test::Id(value.to_owned())
        } else {
            Test::Equals(attr, value.to_owned())
        });
    }
    let values: Vec<&str> = nodes.iter().map(|n| n.attr(attr)).collect();
    let common = stem(&values);
    (values.iter().all(|v| !v.is_empty()) && common.len() >= 3)
        .then(|| Test::Prefix(attr, common.to_owned()))
}

/// Conditions that are true of every one of `nodes`, the most stable first:
/// test ids, form names, labels, ids, data attributes, and only then classes.
fn shared(nodes: &[&Node], allow_bare_tag: bool) -> Vec<Simple> {
    let Some(first) = nodes.first() else {
        return Vec::new();
    };
    if nodes.iter().any(|n| n.tag != first.tag) {
        return Vec::new();
    }
    let mut tests = Vec::new();

    for attr in TEST_IDS {
        if let Some(value) = agreed(nodes, attr) {
            tests.push(Test::Equals(attr, value.to_owned()));
        }
    }
    tests.extend(by_identifier(nodes, "name"));
    if let Some(label) = agreed(nodes, "aria-label") {
        tests.push(Test::Equals("aria-label", label.to_owned()));
    }
    tests.extend(by_identifier(nodes, "id"));
    for name in first.attrs.keys() {
        let is_data = name.starts_with("data-") && !TEST_IDS.contains(&name.as_str());
        if is_data && nodes.iter().all(|n| n.has_attr(name)) {
            tests.push(Test::Has(name.clone()));
        }
    }
    for class in first.classes() {
        if is_identifier(class) && nodes.iter().all(|n| n.classes().any(|c| c == class)) {
            tests.push(Test::Class(class.to_owned()));
        }
    }
    if let Some(role) = agreed(nodes, "role") {
        tests.push(Test::Equals("role", role.to_owned()));
    }
    if first.tag == "input"
        && let Some(kind) = agreed(nodes, "type")
    {
        tests.push(Test::Equals("type", kind.to_owned()));
    }
    if nodes.iter().all(|n| n.attr("contenteditable") == "true") {
        tests.push(Test::Has("contenteditable".to_owned()));
    }
    if allow_bare_tag {
        tests.push(Test::Any);
    }

    tests
        .into_iter()
        .map(|test| Simple {
            tag: first.tag.clone(),
            test,
        })
        .collect()
}

/// A selector that, inside each of `rows`, matches that row's target and
/// nothing else.
fn relative_selector(
    page: &Tree<'_>,
    rows: &[usize],
    targets: &[usize],
    allow_bare_tag: bool,
) -> Option<String> {
    let nodes: Vec<&Node> = targets.iter().map(|&i| page.nodes[i]).collect();
    let own = shared(&nodes, allow_bare_tag);
    let only_target = |matches: &dyn Fn(usize) -> bool| {
        rows.iter().zip(targets).all(|(&row, &target)| {
            let mut hits = page.below(row).filter(|&i| matches(i));
            hits.next() == Some(target) && hits.next().is_none()
        })
    };
    // A bare tag is the weakest thing to go by: the snapshot leaves out what
    // the page hides, and the page may hold more of that tag than it shows.
    // For a target that is the row's own child, say so.
    let are_children = rows
        .iter()
        .zip(targets)
        .all(|(&row, &target)| page.parents[target] == Some(row));
    let only_child = |simple: &Simple| {
        are_children
            && only_target(&|i| simple.matches(page.nodes[i]) && rows.contains(&parent_of(page, i)))
    };
    for simple in &own {
        let bare = simple.test == Test::Any;
        if bare && only_child(simple) {
            return Some(format!(":scope > {}", simple.css()));
        }
        if only_target(&|i| simple.matches(page.nodes[i])) {
            return Some(simple.css());
        }
    }
    if let Some(simple) = own.iter().find(|s| only_child(s)) {
        return Some(format!(":scope > {}", simple.css()));
    }

    // Or say which part of the row it is in.
    for levels in 1..=2 {
        let Some(holders) = rows
            .iter()
            .zip(targets)
            .map(|(&row, &target)| page.ancestor(target, levels, row))
            .collect::<Option<Vec<usize>>>()
        else {
            break;
        };
        let holder_nodes: Vec<&Node> = holders.iter().map(|&i| page.nodes[i]).collect();
        for outer in shared(&holder_nodes, false) {
            for inner in &own {
                let inside = |i: usize| {
                    inner.matches(page.nodes[i])
                        && (0..page.nodes.len())
                            .any(|a| a != i && outer.matches(page.nodes[a]) && page.is_within(i, a))
                };
                if only_target(&inside) {
                    return Some(format!("{} {}", outer.css(), inner.css()));
                }
            }
        }
    }
    None
}

/// The parent's index, or the node's own for the root.
fn parent_of(page: &Tree<'_>, index: usize) -> usize {
    page.parents[index].unwrap_or(index)
}

/// A selector that matches every row and nothing else on the page.
fn section_selector(page: &Tree<'_>, rows: &Rows) -> Option<String> {
    let nodes: Vec<&Node> = rows.members.iter().map(|&i| page.nodes[i]).collect();
    let only_rows = |matches: &dyn Fn(usize) -> bool| {
        (0..page.nodes.len()).all(|i| matches(i) == rows.members.contains(&i))
    };
    if let Some(simple) = shared(&nodes, false)
        .iter()
        .find(|s| only_rows(&|i| s.matches(page.nodes[i])))
    {
        return Some(simple.css());
    }

    // Rows with nothing of their own to go by: the children of their parent.
    let parent = page.nodes[rows.parent];
    let tag = &nodes.first()?.tag;
    let mut holders = shared(&[parent], true);
    holders.retain(|s| {
        !matches!(s.test, Test::Any) || matches!(s.tag.as_str(), "tbody" | "ul" | "ol")
    });
    holders.into_iter().find_map(|holder| {
        let is_child = |i: usize| {
            &page.nodes[i].tag == tag
                && page.parents[i].is_some_and(|p| holder.matches(page.nodes[p]))
        };
        only_rows(&is_child).then(|| format!("{} > {tag}", holder.css()))
    })
}

/// A selector for one element of a page that shows a single student.
fn page_selector(page: &Tree<'_>, target: usize) -> String {
    let node = page.nodes[target];
    shared(&[node], true)
        .iter()
        .find(|s| page.nodes.iter().filter(|n| s.matches(n)).count() == 1)
        .map_or_else(|| node.selector.clone(), Simple::css)
}

// ---- Recognizing the parts ----------------------------------------------

/// Whether any of the element's names for itself contains one of `words`.
fn hinted(node: &Node, words: &[&str]) -> bool {
    ["class", "id", "name", "aria-label", "placeholder", "role"]
        .iter()
        .map(|attr| node.attr(attr).to_ascii_lowercase())
        .any(|value| words.iter().any(|word| value.contains(word)))
}

fn is_score_input(node: &Node) -> bool {
    node.tag == "input"
        && matches!(
            node.attr("type").to_ascii_lowercase().as_str(),
            "number" | "text" | "tel" | ""
        )
        && !hinted(node, &["search", "filter", "email", "login", "user"])
}

fn is_control(node: &Node) -> bool {
    matches!(
        node.tag.as_str(),
        "input" | "textarea" | "select" | "button"
    ) || node.attr("contenteditable") == "true"
}

fn number_follows(rest: &str) -> bool {
    rest.trim_start().starts_with(|c: char| c.is_ascii_digit())
}

fn says_out_of(text: &str) -> bool {
    text.to_ascii_lowercase()
        .split("out of")
        .skip(1)
        .any(|rest| rest.starts_with(' ') && number_follows(rest))
}

/// A label for the maximum: "/ 10", "/10 pts" or "Grade (out of 10)".
fn is_max_text(text: &str) -> bool {
    text.trim().strip_prefix('/').is_some_and(number_follows) || says_out_of(text)
}

/// Whether the text has a "/ 10" or "out of 10" somewhere in it. A slash
/// straight after a letter or digit is a fraction, a date or a path.
fn mentions_max(text: &str) -> bool {
    let after_slash = text.match_indices('/').any(|(at, _)| {
        let before = text[..at].chars().next_back();
        !before.is_some_and(|c| c.is_alphanumeric() || c == '.') && number_follows(&text[at + 1..])
    });
    after_slash || says_out_of(text)
}

const NAV_WORDS: [&str; 11] = [
    "prev", "previous", "next", "◄", "►", "←", "→", "«", "»", "laquo", "raquo",
];
const SAVE_WORDS: [&str; 3] = ["save", "submit", "record"];

fn button_label(node: &Node) -> &str {
    if node.text().is_empty() {
        node.attr("value")
    } else {
        node.text()
    }
}

fn is_button(node: &Node) -> bool {
    match node.tag.as_str() {
        "button" | "a" => true,
        "input" => matches!(
            node.attr("type").to_ascii_lowercase().as_str(),
            "submit" | "button"
        ),
        _ => false,
    }
}

fn is_nav_button(node: &Node) -> bool {
    let label = button_label(node).to_lowercase();
    is_button(node) && NAV_WORDS.iter().any(|word| label.contains(word))
}

/// Which way a button moves between students.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Step {
    Next,
    Previous,
}

const NEXT_WORDS: [&str; 5] = ["next", "►", "→", "»", "raquo"];

/// The way `node` moves between students, if it is a button that does.
fn steps(node: &Node) -> Option<Step> {
    if !is_nav_button(node) {
        return None;
    }
    let label = button_label(node).to_lowercase();
    Some(if NEXT_WORDS.iter().any(|word| label.contains(word)) {
        Step::Next
    } else {
        Step::Previous
    })
}

fn is_save_button(node: &Node) -> bool {
    let label = button_label(node).to_lowercase();
    is_button(node) && SAVE_WORDS.iter().any(|word| label.contains(word))
}

/// How to find `button` again: by its id, or by its label if no other
/// button on the page is labelled the same.
fn button_rule(button: &Node, page: &Tree<'_>) -> Option<ButtonRule> {
    let id = button.attr("id");
    if is_identifier(id) {
        return Some(ButtonRule::Selector {
            selector: format!("#{id}"),
        });
    }
    let label = button_label(button);
    let alike = page
        .nodes
        .iter()
        .filter(|n| is_button(n) && button_label(n).eq_ignore_ascii_case(label))
        .count();
    (!label.is_empty() && alike == 1).then(|| ButtonRule::Text {
        text: label.to_owned(),
    })
}

struct Rows {
    /// The rows in the snapshot, which holds only the first few of a long list.
    members: Vec<usize>,
    parent: usize,
    /// How many rows the page has.
    total: usize,
}

/// The largest group of same-tag siblings that each hold a score box. Among
/// equals the outermost wins: a student's section, not a part within it.
fn find_rows(page: &Tree<'_>) -> Option<Rows> {
    let holds_score = |row: usize| page.below(row).any(|i| is_score_input(page.nodes[i]));
    let mut best: Option<Rows> = None;
    for parent in 0..page.nodes.len() {
        let children: Vec<usize> = (0..page.nodes.len())
            .filter(|&i| page.parents[i] == Some(parent))
            .collect();
        let mut tags: Vec<&str> = children
            .iter()
            .map(|&i| page.nodes[i].tag.as_str())
            .collect();
        tags.sort_unstable();
        tags.dedup();
        for tag in tags {
            let members: Vec<usize> = children
                .iter()
                .copied()
                .filter(|&i| page.nodes[i].tag == tag && holds_score(i))
                .collect();
            if members.len() < 2 {
                continue;
            }
            let cut_from = members
                .iter()
                .filter_map(|&i| page.nodes[i].repeats)
                .max()
                .unwrap_or(0);
            let total = members.len().max(cut_from);
            if best.as_ref().is_none_or(|b| total > b.total) {
                best = Some(Rows {
                    members,
                    parent,
                    total,
                });
            }
        }
    }
    best
}

fn pick_score(page: &Tree<'_>, top: usize) -> Option<usize> {
    let boxes: Vec<usize> = page
        .below(top)
        .filter(|&i| is_score_input(page.nodes[i]))
        .collect();
    let named = |i: &&usize| hinted(page.nodes[**i], &["score", "grade", "point", "pts", "mark"]);
    let numeric = |i: &&usize| page.nodes[**i].attr("type").eq_ignore_ascii_case("number");
    boxes
        .iter()
        .find(named)
        .or_else(|| boxes.iter().find(numeric))
        .or(boxes.first())
        .copied()
}

fn pick_name(page: &Tree<'_>, top: usize) -> Option<usize> {
    const NOT_NAMES: [&str; 9] = [
        "input", "textarea", "button", "label", "select", "option", "legend", "th", "time",
    ];
    let candidates: Vec<usize> = page
        .below(top)
        .filter(|&i| {
            let node = page.nodes[i];
            let text = node.text();
            !NOT_NAMES.contains(&node.tag.as_str())
                && node.attr("contenteditable") != "true"
                && text.chars().count() > 1
                && text.chars().any(char::is_alphabetic)
                && !is_max_text(text)
        })
        .collect();
    // "student" would be no hint at all: on these pages it is on everything.
    let words = ["name", "submitter", "author"];
    candidates
        .iter()
        .find(|&&i| hinted(page.nodes[i], &words))
        .or(candidates.first())
        .copied()
}

/// The name of the one student a page shows: an element that says it holds a
/// name, or a heading like "Student 3 of 30: Carol Davis".
fn pick_name_on_page(page: &Tree<'_>) -> Option<usize> {
    let counts_students = |text: &str| {
        let words: Vec<&str> = text.split_whitespace().collect();
        words.windows(3).any(|w| {
            w[1].eq_ignore_ascii_case("of")
                && w[0].chars().all(|c| c.is_ascii_digit())
                && w[2].starts_with(|c: char| c.is_ascii_digit())
        })
    };
    let has_text = |i: &usize| page.nodes[*i].text().chars().any(char::is_alphabetic);
    let words = ["student-name", "student_name", "studentname", "username"];
    // A drop-down for jumping between students shows the current one.
    let picker = |i: &usize| page.nodes[*i].tag == "select" && hinted(page.nodes[*i], &["student"]);
    page.below(0)
        .filter(has_text)
        .find(|&i| !is_control(page.nodes[i]) && hinted(page.nodes[i], &words))
        .or_else(|| page.below(0).find(picker))
        .or_else(|| {
            page.below(0).find(|&i| {
                matches!(page.nodes[i].tag.as_str(), "h1" | "h2" | "h3" | "h4")
                    && counts_students(page.nodes[i].text())
            })
        })
}

/// The block that holds the student's answer: the largest piece of the row
/// that is all reading matter, with no controls and not the name.
fn pick_response(page: &Tree<'_>, top: usize, name: Option<usize>) -> Option<usize> {
    const LIKELY: [&str; 10] = [
        "response",
        "answer",
        "submission",
        "essay",
        "question",
        "work",
        "sub-body",
        "reply",
        "solution",
        "introtext",
    ];
    const UNLIKELY: [&str; 14] = [
        "attempt", "date", "time", "meta", "status", "header", "title", "action", "nav", "point",
        "pts", "max", "score", "grade",
    ];
    let is_reading_matter = |i: usize| {
        let all = || std::iter::once(i).chain(page.below(i));
        !matches!(
            page.nodes[i].tag.as_str(),
            "label" | "time" | "th" | "legend"
        ) && all().all(|d| !is_control(page.nodes[d]) && Some(d) != name)
    };

    let mut best: Option<(i64, usize)> = None;
    let mut skip_below: Option<usize> = None;
    for i in page.below(top) {
        if skip_below.is_some_and(|block| page.is_within(i, block)) {
            continue;
        }
        if !is_reading_matter(i) {
            continue;
        }
        skip_below = Some(i);
        let node = page.nodes[i];
        let weight = if node.tag == "iframe" {
            1
        } else {
            page.text_weight(i)
        };
        if weight == 0 {
            continue;
        }
        let mut rank = i64::try_from(weight).unwrap_or(i64::MAX / 2);
        if hinted(node, &LIKELY) {
            rank += 10_000;
        } else if hinted(node, &UNLIKELY) {
            rank -= 5_000;
        }
        if best.is_none_or(|(top_rank, _)| rank > top_rank) {
            best = Some((rank, i));
        }
    }
    best.map(|(_, i)| i)
}

fn pick_feedback(page: &Tree<'_>, top: usize) -> Option<(usize, FeedbackKind)> {
    let nodes: Vec<usize> = page.below(top).collect();
    let is_editor = |i: &&usize| {
        let node = page.nodes[**i];
        node.attr("role") == "textbox"
            || node
                .classes()
                .any(|c| c.contains("mce") || c.contains("fbbox"))
            || node
                .attr("aria-label")
                .to_ascii_lowercase()
                .contains("feedback")
    };
    let editable = |i: &&usize| page.nodes[**i].attr("contenteditable") == "true";
    let textarea = |i: &&usize| page.nodes[**i].tag == "textarea";
    let words = ["feedback", "comment", "note", "remark"];

    let rich = nodes
        .iter()
        .find(|i| editable(i) && is_editor(i))
        // Some editors make their box editable from script, without the attribute.
        .or_else(|| {
            nodes
                .iter()
                .find(|i| page.nodes[**i].attr("role") == "textbox" && !is_control(page.nodes[**i]))
        });
    if let Some(&i) = rich {
        return Some((i, FeedbackKind::RichText));
    }
    let plain = nodes
        .iter()
        .find(|i| textarea(i) && hinted(page.nodes[**i], &words))
        .or_else(|| nodes.iter().find(textarea));
    if let Some(&i) = plain {
        return Some((i, FeedbackKind::Textarea));
    }
    nodes
        .iter()
        .find(editable)
        .map(|&i| (i, FeedbackKind::RichText))
}

/// A hidden field named for feedback (`fb-3`, `feedback_3`, `comment[3]`),
/// which a rich text editor fills on save.
fn pick_hidden_feedback(page: &Tree<'_>, top: usize) -> Option<usize> {
    page.below(top).find(|&i| {
        let node = page.nodes[i];
        let name = node.attr("name").to_ascii_lowercase();
        node.tag == "input"
            && node.attr("type").eq_ignore_ascii_case("hidden")
            && ["fb", "feedback", "comment"].iter().any(|word| {
                name.strip_prefix(word)
                    .is_some_and(|rest| rest.starts_with(|c: char| !c.is_ascii_alphanumeric()))
            })
    })
}

fn pick_max(page: &Tree<'_>, top: usize) -> Option<usize> {
    page.below(top).find(|&i| is_max_text(page.nodes[i].text()))
}

/// Finds each part in every row, and keeps the ones that sit in the same
/// place in all of them.
fn in_rows(page: &Tree<'_>, rows: &Rows) -> Candidates {
    let members = &rows.members;
    let in_every_row = |pick: &dyn Fn(usize) -> Option<usize>| -> Option<Vec<usize>> {
        members.iter().map(|&row| pick(row)).collect()
    };
    let selector = |targets: &Option<Vec<usize>>, allow_bare_tag: bool| {
        targets
            .as_ref()
            .and_then(|t| relative_selector(page, members, t, allow_bare_tag))
    };

    let names = in_every_row(&|row| pick_name(page, row));
    let scores = in_every_row(&|row| pick_score(page, row));
    let responses = in_every_row(&|row| {
        let name = pick_name(page, row);
        pick_response(page, row, name)
    });

    let boxes = in_every_row(&|row| pick_feedback(page, row).map(|(i, _)| i));
    let kind = members
        .first()
        .and_then(|&row| pick_feedback(page, row))
        .map(|(_, kind)| kind);
    let feedback = selector(&boxes, true).zip(kind).map(|(selector, kind)| {
        let hidden = (kind == FeedbackKind::RichText)
            .then(|| in_every_row(&|row| pick_hidden_feedback(page, row)))
            .flatten();
        FeedbackBox {
            selector,
            kind,
            hidden_field: hidden.and_then(|h| relative_selector(page, members, &h, false)),
        }
    });

    let score_input = selector(&scores, true);
    let max_labels = in_every_row(&|row| pick_max(page, row));
    let labelled = scores.as_ref().is_some_and(|boxes| {
        boxes
            .iter()
            .all(|&i| is_max_text(page.nodes[i].attr("aria-label")))
    });
    let max_score = match selector(&max_labels, false) {
        Some(selector) => Some(MaxScoreRule::Selector {
            selector,
            pattern: None,
        }),
        None => {
            let mentioned = members
                .iter()
                .all(|&row| page.below(row).any(|i| mentions_max(page.nodes[i].text())));
            (mentioned || labelled).then(MaxScoreRule::usual)
        }
    };

    Candidates {
        student_section: section_selector(page, rows),
        student_name: selector(&names, true),
        max_score: score_input.as_ref().and(max_score),
        score_input,
        feedback,
        response: selector(&responses, true),
        save_button: None,
        next_student: None,
        previous_student: None,
    }
}

/// Finds each part on a page with no repeating rows.
fn on_page(page: &Tree<'_>) -> Candidates {
    let name = pick_name_on_page(page);
    let score = pick_score(page, 0);
    let feedback = pick_feedback(page, 0).map(|(i, kind)| FeedbackBox {
        selector: page_selector(page, i),
        kind,
        hidden_field: (kind == FeedbackKind::RichText)
            .then(|| pick_hidden_feedback(page, 0))
            .flatten()
            .map(|i| page_selector(page, i)),
    });
    let has_max_label = page.below(0).any(|i| mentions_max(page.nodes[i].text()))
        || score.is_some_and(|i| is_max_text(page.nodes[i].attr("aria-label")));
    Candidates {
        student_section: None,
        student_name: name.map(|i| page_selector(page, i)),
        score_input: score.map(|i| page_selector(page, i)),
        max_score: (score.is_some() && has_max_label).then(MaxScoreRule::usual),
        feedback,
        response: pick_response(page, 0, name).map(|i| page_selector(page, i)),
        save_button: None,
        next_student: None,
        previous_student: None,
    }
}

#[cfg(test)]
mod tests {
    use super::super::snapshot::testing::{node, snapshot};
    use super::*;

    // ---- Ported from heuristic-detector.test.ts --------------------------

    fn student_row(i: usize) -> Node {
        node("div")
            .class("student-row")
            .child(
                node("span")
                    .class("student-name")
                    .saying(&format!("Student {i}")),
            )
            .child(
                node("input")
                    .with("type", "number")
                    .class("score-input")
                    .with("name", &format!("score_{i}")),
            )
    }

    /// N student rows, each a name and a score box.
    fn batch(count: usize) -> Snapshot {
        snapshot(node("body").child(node("div").children((1..=count).map(student_row))))
    }

    /// One student, previous and next buttons, a score box and a feedback box.
    fn sequential() -> Node {
        node("body").child(
            node("div")
                .id("grading-app")
                .child(
                    node("header")
                        .child(node("h2").saying("Student 3 of 30: Carol Davis"))
                        .child(
                            node("div")
                                .class("nav-controls")
                                .child(node("button").id("prev-student").saying("« Previous"))
                                .child(node("button").id("next-student").saying("Next »")),
                        ),
                )
                .child(
                    node("main")
                        .child(
                            node("input")
                                .with("type", "number")
                                .id("score-input")
                                .with("name", "score"),
                        )
                        .child(
                            node("textarea")
                                .id("feedback-input")
                                .with("name", "feedback"),
                        ),
                ),
        )
    }

    #[test]
    fn repeating_rows_that_each_hold_a_score_box_mean_batch_mode() {
        let found = detect(&batch(3)).expect("detected");
        assert_eq!(found.mode, Mode::Batch);
        assert_eq!(found.students_seen, Some(3));
        assert!(
            found
                .pattern_name
                .starts_with("Batch grading (repeating-rows")
        );
    }

    #[test]
    fn a_next_button_and_one_score_box_mean_sequential_mode() {
        let found = detect(&snapshot(sequential())).expect("detected");
        assert_eq!(found.mode, Mode::Sequential);
        assert_eq!(found.students_seen, None);
        assert_eq!(found.candidates.student_section, None);
        assert_eq!(
            found.candidates.score_input.as_deref(),
            Some("input[name=\"score\"]")
        );
        assert_eq!(found.candidates.student_name.as_deref(), Some("h2"));
        assert_eq!(
            found.pattern_name,
            "Sequential grading (score-input, name-candidate)"
        );
        // The way on is kept, so that every student can be read.
        assert_eq!(
            found.candidates.next_student,
            Some(ButtonRule::Selector {
                selector: "#next-student".into()
            })
        );
        assert_eq!(
            found.candidates.previous_student,
            Some(ButtonRule::Selector {
                selector: "#prev-student".into()
            })
        );
    }

    #[test]
    fn an_empty_page_is_not_a_grading_page() {
        assert_eq!(detect(&snapshot(node("body"))), None);
    }

    #[test]
    fn a_page_of_prose_without_inputs_is_not_a_grading_page() {
        let page = node("body").child(
            node("div")
                .child(node("span").saying("Hello"))
                .child(node("p").saying("Some paragraph"))
                .child(node("div").child(node("span").saying("Nested"))),
        );
        assert_eq!(detect(&snapshot(page)), None);
        let lone = node("body").child(node("div").child(node("div").saying("Some content")));
        assert_eq!(detect(&snapshot(lone)), None);
    }

    #[test]
    fn a_detection_names_its_pattern_and_its_score_box() {
        let found = detect(&batch(3)).expect("detected");
        assert_eq!(
            found.pattern_name,
            "Batch grading (repeating-rows, score-input, name-candidate)"
        );
        assert_eq!(
            found.candidates.score_input.as_deref(),
            Some("input[name^=\"score_\"]")
        );
        assert_eq!(
            found.candidates.student_section.as_deref(),
            Some("div.student-row")
        );
        assert_eq!(
            found.candidates.student_name.as_deref(),
            Some("span.student-name")
        );
    }

    #[test]
    fn rows_scores_and_names_together_give_high_confidence() {
        let found = detect(&batch(4)).expect("detected");
        assert!(found.confidence >= 0.7, "{}", found.confidence);
        assert!((found.confidence - 0.9).abs() < 1e-9);
    }

    #[test]
    fn a_save_button_adds_to_the_confidence() {
        let without = detect(&snapshot(sequential())).expect("detected");
        let mut page = sequential();
        page.children[0]
            .children
            .push(node("button").with("type", "submit").saying("Save & Next"));
        let with = detect(&snapshot(page)).expect("detected");
        assert!(with.confidence > 0.3);
        assert!((with.confidence - without.confidence - 0.1).abs() < 1e-9);
        assert_eq!(
            with.candidates.save_button,
            Some(ButtonRule::Text {
                text: "Save & Next".into()
            })
        );
    }

    // The TypeScript detector needed three rows and fell back to its other
    // signals for two. A class of two is still a class, so two rows count.
    #[test]
    fn two_rows_are_enough_to_be_rows() {
        let found = detect(&batch(2)).expect("detected");
        assert!(found.confidence >= 0.3);
        assert_eq!(found.mode, Mode::Batch);
        assert_eq!(found.students_seen, Some(2));
        assert_eq!(detect(&batch(1)).expect("detected").students_seen, None);
    }

    /// The shape of fixtures/simple-batch.html.
    fn simple_batch() -> Node {
        let row = |i: usize, name: &str| {
            node("div")
                .class("student-row")
                .with("data-lastchange", "")
                .child(node("span").class("student-name").saying(name))
                .child(
                    node("div")
                        .class("question-region")
                        .child(node("p").saying(&format!("Student response: x^2 + {i}")))
                        .child(
                            node("div")
                                .class("response-body")
                                .saying("The answer is x^2 + 2x + 1 by expanding (x+1)^2."),
                        ),
                )
                .child(
                    node("div")
                        .class("grading-controls")
                        .child(
                            node("label").saying("Score:").child(
                                node("input")
                                    .with("type", "number")
                                    .class("score-input")
                                    .with("name", &format!("score_{i}")),
                            ),
                        )
                        .child(node("span").class("max-score").saying("/ 10"))
                        .child(
                            node("textarea")
                                .class("feedback-input")
                                .with("name", &format!("feedback_{i}"))
                                .with("placeholder", "Feedback..."),
                        ),
                )
        };
        node("body")
            .child(node("h1").saying("Gradeallq2 - Question 2"))
            .child(row(1, "Alice Johnson"))
            .child(row(2, "Bob Smith"))
            .child(row(3, "Carol Davis"))
            .child(
                node("div").class("save-section").child(
                    node("button")
                        .id("save-all")
                        .class("save-btn")
                        .saying("Save All Grades"),
                ),
            )
    }

    #[test]
    fn the_simple_batch_page_is_mapped_in_full() {
        let found = detect(&snapshot(simple_batch())).expect("detected");
        assert_eq!(found.mode, Mode::Batch);
        assert!((found.confidence - 1.0).abs() < 1e-9);
        let map = found.page_map().expect("everything needed was found");
        assert_eq!(map.student_section.as_deref(), Some("div[data-lastchange]"));
        assert_eq!(map.student_name, "span.student-name");
        assert_eq!(map.score_input, "input[name^=\"score_\"]");
        assert_eq!(
            map.max_score,
            Some(MaxScoreRule::Selector {
                selector: "span.max-score".into(),
                pattern: None
            })
        );
        assert_eq!(
            map.feedback,
            Some(FeedbackBox {
                selector: "textarea[name^=\"feedback_\"]".into(),
                kind: FeedbackKind::Textarea,
                hidden_field: None,
            })
        );
        assert_eq!(map.response, "div.question-region");
        assert_eq!(
            map.save,
            Some(SaveRule {
                button: ButtonRule::Selector {
                    selector: "#save-all".into()
                },
                success: None,
            })
        );

        let profile = draft_profile(&snapshot(simple_batch())).expect("drafted");
        assert_eq!(profile.page, map);
        assert_eq!(profile.name, "lms.example.edu");
        assert!(
            profile
                .url
                .matches("https://lms.example.edu/course/7/grade")
        );
    }

    /// Rows with a rich text editor, a plain box and a hidden field each. The
    /// TypeScript tests hung these beside the rows; on a real page each
    /// student has their own.
    fn rows_with(extra: impl Fn(usize) -> Vec<Node>) -> Snapshot {
        snapshot(
            node("body")
                .child(node("div").children((1..=3).map(|i| student_row(i).children(extra(i))))),
        )
    }

    fn editor(i: usize) -> Node {
        node("div")
            .class("fbbox mce-content-body")
            .id(&format!("fb-0-{i}"))
            .with("contenteditable", "true")
            .with("role", "textbox")
            .with("aria-label", "Feedback editor")
            .saying("Enter feedback here...")
    }

    fn hidden_field(i: usize) -> Node {
        node("input")
            .with("type", "hidden")
            .with("name", &format!("fb-0-{i}"))
    }

    #[test]
    fn an_editable_box_marked_as_a_textbox_is_the_feedback_box() {
        let found = detect(&rows_with(|i| vec![editor(i)])).expect("detected");
        let feedback = found.candidates.feedback.expect("feedback box");
        assert_eq!(feedback.selector, "div[aria-label=\"Feedback editor\"]");
        assert_eq!(feedback.kind, FeedbackKind::RichText);
        assert_eq!(feedback.hidden_field, None);
    }

    #[test]
    fn a_rich_text_editor_wins_over_a_plain_box_beside_it() {
        let plain = |i: usize| {
            node("textarea")
                .class("fallback-feedback")
                .with("name", &format!("feedback_{i}"))
        };
        let found = detect(&rows_with(|i| vec![plain(i), editor(i)])).expect("detected");
        let feedback = found.candidates.feedback.expect("feedback box");
        assert_eq!(feedback.selector, "div[aria-label=\"Feedback editor\"]");
        assert_eq!(feedback.kind, FeedbackKind::RichText);
    }

    #[test]
    fn a_hidden_feedback_field_is_mapped_only_beside_a_rich_text_editor() {
        let rich = detect(&rows_with(|i| vec![editor(i), hidden_field(i)])).expect("detected");
        assert_eq!(
            rich.candidates
                .feedback
                .and_then(|f| f.hidden_field)
                .as_deref(),
            Some("input[name^=\"fb-\"]")
        );

        let plain = |i: usize| {
            node("textarea")
                .class("feedback-input")
                .with("name", &format!("feedback_{i}"))
        };
        let found = detect(&rows_with(|i| vec![plain(i), hidden_field(i)])).expect("detected");
        let feedback = found.candidates.feedback.expect("feedback box");
        assert_eq!(feedback.kind, FeedbackKind::Textarea);
        assert_eq!(feedback.hidden_field, None);
    }

    #[test]
    fn a_question_region_is_where_the_response_is_read() {
        let region = |_| {
            vec![
                node("div")
                    .with("role", "region")
                    .with("aria-label", "Question 1")
                    .child(node("p").saying("Student response text")),
            ]
        };
        let found = detect(&rows_with(region)).expect("detected");
        assert_eq!(
            found.candidates.response.as_deref(),
            Some("div[aria-label=\"Question 1\"]")
        );
    }

    // ---- Beyond the TypeScript suite --------------------------------------

    /// The shape of fixtures/unknown-lms.html: two students, no data
    /// attributes, ids that count up, a button per student.
    fn unknown_lms() -> Node {
        let submission =
            |id: &str, name: &str, date: &str| {
                node("article")
                    .class("submission")
                    .id(id)
                    .child(
                        node("header")
                            .class("sub-header")
                            .child(node("strong").class("submitter").saying(name))
                            .child(node("time").saying(date)),
                    )
                    .child(node("section").class("sub-body").child(
                        node("p").saying(
                            "The French Revolution began in 1789 and fundamentally transfo",
                        ),
                    ))
                    .child(
                        node("footer")
                            .class("sub-grading")
                            .child(
                                node("div")
                                    .class("points-entry")
                                    .child(
                                        node("input")
                                            .with("type", "text")
                                            .class("pts-input")
                                            .with("placeholder", "0-25")
                                            .with("aria-label", "Points out of 25"),
                                    )
                                    .child(node("span").class("pts-label").saying("/ 25 pts")),
                            )
                            .child(
                                node("div").class("comments-entry").child(
                                    node("textarea")
                                        .class("comments")
                                        .with("placeholder", "Add comments..."),
                                ),
                            )
                            .child(node("button").class("grade-submit").saying("Grade")),
                    )
            };
        node("body").child(
            node("div")
                .id("app")
                .child(
                    node("nav")
                        .class("site-nav")
                        .child(node("a").saying("Home"))
                        .child(node("a").saying("Courses")),
                )
                .child(node("div").class("submissions-list").children([
                    submission("sub-9001", "Emily Wilson", "Submitted Jan 14"),
                    submission("sub-9002", "Frank Martinez", "Submitted Jan 13"),
                ])),
        )
    }

    #[test]
    fn a_site_never_seen_before_is_mapped_from_its_structure() {
        let found = detect(&snapshot(unknown_lms())).expect("detected");
        assert_eq!(found.mode, Mode::Batch);
        assert_eq!(found.students_seen, Some(2));
        assert!((found.confidence - 0.9).abs() < 1e-9);
        let map = found.page_map().expect("mapped");
        // The ids count up, so the rows are the ones whose id starts the same way.
        assert_eq!(
            map.student_section.as_deref(),
            Some("article[id^=\"sub-\"]")
        );
        assert_eq!(map.student_name, "strong.submitter");
        assert_eq!(map.score_input, "input[aria-label=\"Points out of 25\"]");
        assert_eq!(
            map.max_score,
            Some(MaxScoreRule::Selector {
                selector: "span.pts-label".into(),
                pattern: None
            })
        );
        assert_eq!(map.response, "section.sub-body");
        assert_eq!(
            map.feedback.map(|f| f.selector).as_deref(),
            Some("textarea.comments")
        );
        // "Grade" is one button per student, not the page's save button.
        assert_eq!(map.save, None);
    }

    #[test]
    fn table_rows_are_told_from_the_header_row() {
        let row = |who: &str, name: &str| {
            node("tr")
                .with("data-lastchange", "")
                .with("data-student", "")
                .child(node("td").class("student-col").saying(name))
                .child(
                    node("td").class("response-col").child(
                        node("div")
                            .class("response-content")
                            .saying("The limit as x→0 of sin(x)/x equals 1."),
                    ),
                )
                .child(node("td").class("attempt-col").saying("Attempt 1 of 3"))
                .child(
                    node("td")
                        .class("score-col")
                        .child(
                            node("input")
                                .with("type", "number")
                                .with("name", &format!("score_{who}"))
                                .class("score-input"),
                        )
                        .child(node("span").class("max").saying("/ 20")),
                )
                .child(
                    node("td")
                        .class("feedback-col")
                        .child(node("textarea").with("name", &format!("feedback_{who}"))),
                )
                .child(
                    node("td")
                        .class("action-col")
                        .child(node("button").class("save-row-btn").saying("Save")),
                )
        };
        let page = node("body")
            .child(
                node("table")
                    .id("grading-table")
                    .child(
                        node("thead").child(
                            node("tr")
                                .child(node("th").saying("Student"))
                                .child(node("th").saying("Score (/ 20)")),
                        ),
                    )
                    .child(node("tbody").children([
                        row("alice", "Alice Johnson"),
                        row("bob", "Bob Smith"),
                        row("carol", "Carol Davis"),
                    ])),
            )
            .child(
                node("div")
                    .class("bulk-actions")
                    .child(node("button").id("save-all-btn").saying("Save All Grades"))
                    .child(node("button").id("export-btn").saying("Export CSV")),
            );
        let map = detect(&snapshot(page))
            .and_then(|found| found.page_map())
            .expect("mapped");
        assert_eq!(map.student_section.as_deref(), Some("tr[data-lastchange]"));
        assert_eq!(map.student_name, "td.student-col");
        assert_eq!(map.score_input, "input[name^=\"score_\"]");
        assert_eq!(map.response, "td.response-col");
        assert_eq!(
            map.feedback.map(|f| f.selector).as_deref(),
            Some("textarea[name^=\"feedback_\"]")
        );
        // The per-row "Save" buttons are inside the rows; the page's is outside.
        assert_eq!(
            map.save.map(|s| s.button),
            Some(ButtonRule::Selector {
                selector: "#save-all-btn".into()
            })
        );
    }

    #[test]
    fn rows_with_nothing_of_their_own_are_named_by_their_parent() {
        let row = |name: &str| {
            node("tr")
                .child(node("td").saying(name))
                .child(node("td").child(node("p").class("answer").saying("An answer.")))
                .child(node("td").child(node("input").with("type", "text")))
        };
        let page = node("body").child(
            node("table")
                .child(node("thead").child(node("tr").child(node("th").saying("Name"))))
                .child(node("tbody").children([row("Alice"), row("Bob")])),
        );
        let found = detect(&snapshot(page)).expect("detected");
        assert_eq!(
            found.candidates.student_section.as_deref(),
            Some("tbody > tr")
        );
        assert_eq!(
            found.candidates.score_input.as_deref(),
            Some("input[type=\"text\"]")
        );
        // Two plain cells hold text; the name is not unique by its tag alone.
        assert_eq!(found.candidates.student_name, None);
        assert_eq!(found.page_map(), None);
    }

    /// The shape of an IMathAS "grade all" page: the name is a bare `<b>`
    /// that opens the row, and "/10" is loose text beside the score box.
    fn grade_all_page() -> Node {
        let row = |i: usize, name: &str| {
            node("div")
                .with("data-lastchange", "")
                .child(node("b").saying(name))
                .child(
                    node("div")
                        .with("role", "region")
                        .with("aria-label", &format!("Question {i}"))
                        .child(
                            node("p")
                                .class("prompt-text")
                                .saying("Explain the theorem."),
                        )
                        .child(node("table").child(
                            node("tr").child(node("td").child(node("b").saying("CLT Statement"))),
                        ))
                        .child(
                            node("div")
                                .class("student-response")
                                .saying("The theorem states that sample means approach normal."),
                        ),
                )
                .child(
                    node("div")
                        .class("scoredetails")
                        .saying(&format!("{name}: /10 Question Feedback:"))
                        .child(
                            node("input")
                                .with("type", "text")
                                .with("name", &format!("score-{i}"))
                                .with("aria-label", "Score"),
                        )
                        .child(
                            node("div")
                                .class("fbbox")
                                .with("role", "textbox")
                                .with("aria-label", "Feedback")
                                .with("contenteditable", "true"),
                        )
                        .child(
                            node("input")
                                .with("type", "hidden")
                                .with("name", &format!("fb-{i}")),
                        ),
                )
        };
        node("body")
            .child(node("button").class("quicksave").saying("Quick Save"))
            .child(node("form").id("gradeform").children([
                row(1, "Anderson, Marcus"),
                row(2, "Brooks, Jaylen"),
                row(3, "Chen, Lily"),
            ]))
            .child(node("button").class("quicksave").saying("Quick Save"))
    }

    #[test]
    fn a_bare_tag_that_opens_every_row_is_named_as_the_rows_child() {
        let map = detect(&snapshot(grade_all_page()))
            .and_then(|found| found.page_map())
            .expect("mapped");
        assert_eq!(map.student_section.as_deref(), Some("div[data-lastchange]"));
        // Other <b> elements sit deeper in the row; "student-response" is not a name.
        assert_eq!(map.student_name, ":scope > b");
        assert_eq!(map.score_input, "input[name^=\"score-\"]");
        assert_eq!(map.max_score, Some(MaxScoreRule::usual()));
        assert_eq!(map.response, "div[role=\"region\"]");
        assert_eq!(
            map.feedback,
            Some(FeedbackBox {
                selector: "div[aria-label=\"Feedback\"]".into(),
                kind: FeedbackKind::RichText,
                hidden_field: Some("input[name^=\"fb-\"]".into()),
            })
        );
        // Two buttons say "Quick Save" and neither has an id: no telling which.
        assert_eq!(map.save, None);
    }

    #[test]
    fn a_student_picker_names_the_student_a_page_shows() {
        let page = node("body")
            .child(node("button").id("prevStudent").saying("←"))
            .child(
                node("select")
                    .id("students_selectmenu")
                    .with("data-testid", "student-select-trigger")
                    .with("aria-label", "Select a student")
                    .with("options", "12"),
            )
            .child(node("button").id("nextStudent").saying("→"))
            .child(
                node("div")
                    .class("submission")
                    .saying("My answer is that tariffs raise prices."),
            )
            .child(
                node("input")
                    .with("type", "text")
                    .id("grade_input")
                    .with("data-testid", "grade-input")
                    .with("aria-label", "Grade out of 10"),
            );
        let found = detect(&snapshot(page)).expect("detected");
        assert_eq!(found.mode, Mode::Sequential);
        let map = found.page_map().expect("mapped");
        assert_eq!(
            map.student_name,
            "select[data-testid=\"student-select-trigger\"]"
        );
        assert_eq!(map.score_input, "input[data-testid=\"grade-input\"]");
        assert_eq!(map.max_score, Some(MaxScoreRule::usual()));
        assert_eq!(map.response, "div.submission");
    }

    #[test]
    fn a_long_list_cut_short_in_the_snapshot_still_reports_its_length() {
        let mut page = batch(3);
        page.root.children[0].children[0].repeats = Some(30);
        assert_eq!(detect(&page).expect("detected").students_seen, Some(30));
    }

    #[test]
    fn a_row_with_no_answer_to_read_gives_no_page_map() {
        // The shape of fixtures/hidden-content.html: a name, a box, "/ 10".
        let row = |i: usize| student_row(i).child(node("span").saying("/ 10"));
        let page = snapshot(node("body").children((1..=3).map(row)));
        let found = detect(&page).expect("detected");
        assert_eq!(found.candidates.response, None);
        assert_eq!(found.candidates.max_score, Some(MaxScoreRule::usual()));
        assert_eq!(found.page_map(), None);
        assert_eq!(draft_profile(&page), None);
    }

    #[test]
    fn a_short_answer_beats_longer_boilerplate_that_names_itself() {
        let row = |i: usize| {
            student_row(i)
                .child(
                    node("div")
                        .class("attempt-info")
                        .saying("Attempt 1 of 3, on time"),
                )
                .child(node("div").class("resp").saying("42"))
        };
        let found = detect(&snapshot(node("body").children((1..=3).map(row)))).expect("detected");
        assert_eq!(found.candidates.response.as_deref(), Some("div.resp"));
    }

    #[test]
    fn selectors_generalize_over_what_numbers_the_rows() {
        assert_eq!(stem(&["score_1", "score_2"]), "score_");
        assert_eq!(stem(&["score_alice", "score_bob"]), "score_");
        assert_eq!(stem(&["sub-9001", "sub-9002"]), "sub-");
        assert_eq!(stem(&["fb-0-2-1001", "fb-0-2-1002"]), "fb-");
        assert_eq!(stem(&["g1", "g2"]), "g");
        assert_eq!(stem(&["résumé_1", "résumé_2"]), "résumé_");
        assert_eq!(stem(&["a", "b"]), "");
        assert_eq!(stem(&[]), "");
    }

    #[test]
    fn selectors_are_written_so_that_css_accepts_them() {
        let simple = |test| Simple {
            tag: "input".into(),
            test,
        };
        assert_eq!(simple(Test::Any).css(), "input");
        assert_eq!(simple(Test::Id("score".into())).css(), "#score");
        assert_eq!(simple(Test::Class("pts".into())).css(), "input.pts");
        assert_eq!(
            simple(Test::Equals("aria-label", "Say \"hi\" \\ bye".into())).css(),
            r#"input[aria-label="Say \"hi\" \\ bye"]"#
        );
        assert_eq!(simple(Test::Has("data-x".into())).css(), "input[data-x]");
        assert!(is_identifier("student-row") && is_identifier("_x1"));
        // Utility classes and ids that need escaping are passed over.
        for odd in ["", "9lives", "md:flex", "w-1/2", "a b", "-x"] {
            assert!(!is_identifier(odd), "{odd}");
        }
    }

    #[test]
    fn score_maximum_labels_are_recognized() {
        for text in [
            "/ 10",
            "/10",
            " / 25 pts",
            "Grade (out of 15)",
            "Points out of 25",
        ] {
            assert!(is_max_text(text), "{text}");
        }
        for text in ["10", "and/or", "Attempt 1 of 3", "out of time", "/ pts", ""] {
            assert!(!is_max_text(text), "{text}");
        }
        // Anywhere in a longer text, but not the slash of a date or a fraction.
        for text in [
            "Anderson, Marcus: /10 Quick grade",
            "Score (/ 20)",
            "5 out of 8",
        ] {
            assert!(mentions_max(text), "{text}");
        }
        for text in [
            "Due 11/12/2026",
            "about 3/4 of it",
            "x^2/3",
            "and/or",
            "v1./2",
        ] {
            assert!(!mentions_max(text), "{text}");
        }
    }
}
