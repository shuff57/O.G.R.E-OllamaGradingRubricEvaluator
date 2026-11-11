//! A compact outline of a page, for working out how it is laid out.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::driver::eval_as;
use crate::{PageDriver, Result};

const SNAPSHOT_SCRIPT: &str = include_str!("snapshot.js");

/// Limits on what a snapshot captures and on the outline made from it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotOptions {
    /// Levels of nesting below `<body>` that are walked.
    pub max_depth: usize,
    /// Characters of text kept per element.
    pub max_text: usize,
    /// Of a run of alike siblings (the rows of a class list), how many are kept.
    pub max_repeats: usize,
    /// Elements in the outline given to an AI.
    pub max_nodes: usize,
    /// Characters of JSON in the outline given to an AI. The default leaves a
    /// local model with an 8k-token window room for the instructions, a retry
    /// and its answer.
    pub char_budget: usize,
}

impl Default for SnapshotOptions {
    fn default() -> Self {
        Self {
            max_depth: 12,
            max_text: 60,
            max_repeats: 3,
            max_nodes: 500,
            char_budget: 8000,
        }
    }
}

/// The visible structure of a page at one moment.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Snapshot {
    pub url: String,
    pub title: String,
    pub root: SnapshotNode,
    pub stats: SnapshotStats,
    #[serde(skip)]
    pub options: SnapshotOptions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
pub struct SnapshotStats {
    /// Elements looked at.
    pub visited: usize,
    /// Elements left out because the page does not show them.
    pub hidden: usize,
    /// Whether the depth or size limit cut the walk short.
    pub truncated: bool,
}

/// One element of the page.
#[derive(Debug, Clone, PartialEq, Default, Deserialize)]
pub struct SnapshotNode {
    pub tag: String,
    /// A CSS selector that finds exactly this element again.
    pub selector: String,
    /// `id`, `class`, `name`, `type`, `role`, `aria-label`, `placeholder`,
    /// `for`, `contenteditable`, and the names of `data-*` attributes. Their
    /// values are blank except for test ids.
    #[serde(default)]
    pub attrs: BTreeMap<String, String>,
    /// The element's own text, cut to [`SnapshotOptions::max_text`]. For
    /// buttons and links, their whole label.
    pub text: Option<String>,
    /// Length of that text before it was cut.
    #[serde(default)]
    pub text_len: usize,
    /// Set on the first of a run of alike siblings that was cut short: how
    /// many there are on the page.
    pub repeats: Option<usize>,
    #[serde(default)]
    pub children: Vec<SnapshotNode>,
}

/// How much an element matters when an outline has to be cut down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    /// Decoration: dropped first.
    Low,
    Medium,
    /// Forms, tables and buttons.
    High,
    /// Likely a grading widget: dropped last.
    Critical,
}

const LOW_TAGS: [&str; 11] = [
    "script", "style", "noscript", "meta", "link", "head", "svg", "path", "g", "defs", "symbol",
];
const HIGH_TAGS: [&str; 9] = [
    "form", "input", "textarea", "select", "button", "table", "tr", "td", "th",
];
const CRITICAL_ATTRS: [&str; 5] = [
    "data-lastchange",
    "data-student",
    "data-score",
    "data-response",
    "data-gradable",
];

impl SnapshotNode {
    /// The attribute's value, or `""` if the element does not have it.
    pub fn attr(&self, name: &str) -> &str {
        self.attrs.get(name).map_or("", String::as_str)
    }

    pub fn has_attr(&self, name: &str) -> bool {
        self.attrs.contains_key(name)
    }

    pub fn classes(&self) -> impl Iterator<Item = &str> {
        self.attr("class").split_whitespace()
    }

    pub fn text(&self) -> &str {
        self.text.as_deref().unwrap_or_default()
    }

    /// This element and everything below it, parents before children.
    pub fn descendants(&self) -> Vec<&SnapshotNode> {
        let mut out = Vec::new();
        let mut stack = vec![self];
        while let Some(node) = stack.pop() {
            out.push(node);
            stack.extend(node.children.iter().rev());
        }
        out
    }

    pub fn priority(&self) -> Priority {
        let tag = self.tag.as_str();
        if LOW_TAGS.contains(&tag) {
            return Priority::Low;
        }
        if CRITICAL_ATTRS.iter().any(|name| self.has_attr(name))
            || self.attr("contenteditable") == "true"
        {
            return Priority::Critical;
        }
        if tag == "input" {
            let kind = self.attr("type").to_ascii_lowercase();
            if kind == "hidden" {
                let name = self.attr("name").to_ascii_lowercase();
                return if name.starts_with("fb-") || name.starts_with("fb_") {
                    Priority::High
                } else {
                    Priority::Medium
                };
            }
            if matches!(kind.as_str(), "number" | "text" | "") {
                return Priority::Critical;
            }
        }
        if tag == "textarea" {
            return Priority::Critical;
        }
        if HIGH_TAGS.contains(&tag) {
            return Priority::High;
        }
        if self.text.is_some() || !self.children.is_empty() {
            Priority::Medium
        } else {
            Priority::Low
        }
    }
}

/// A snapshot flattened and cut down to fit an AI's context.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outline {
    /// A JSON array of `{depth, tag, attrs, text, repeats}`, in page order.
    pub json: String,
    /// Elements in `json`.
    pub nodes: usize,
    /// Elements in the snapshot before any were dropped to fit.
    pub total: usize,
}

#[derive(Serialize)]
struct OutlineNode<'a> {
    depth: usize,
    tag: &'a str,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    attrs: &'a BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repeats: Option<usize>,
}

impl Snapshot {
    /// Every element with its depth, the root first.
    pub fn nodes(&self) -> Vec<(usize, &SnapshotNode)> {
        let mut out = Vec::new();
        let mut stack = vec![(0, &self.root)];
        while let Some((depth, node)) = stack.pop() {
            out.push((depth, node));
            stack.extend(node.children.iter().rev().map(|child| (depth + 1, child)));
        }
        out
    }

    /// The outline to show an AI, within [`SnapshotOptions::max_nodes`] and
    /// [`SnapshotOptions::char_budget`]. Elements are dropped whole, the least
    /// important first and from the end of the page backwards; grading
    /// widgets go last.
    pub fn outline(&self) -> Outline {
        let nodes = self.nodes();
        let total = nodes.len();
        let entries: Vec<(Priority, String)> = nodes
            .iter()
            .map(|&(depth, node)| {
                let entry = OutlineNode {
                    depth,
                    tag: &node.tag,
                    attrs: &node.attrs,
                    text: node.text.as_deref(),
                    repeats: node.repeats,
                };
                (
                    node.priority(),
                    serde_json::to_string(&entry).unwrap_or_default(),
                )
            })
            .collect();

        // The root stays, so that what remains still reads as one page.
        let mut droppable: Vec<usize> = (1..total).collect();
        droppable.sort_by_key(|&i| (entries[i].0, std::cmp::Reverse(i)));
        let mut kept = vec![true; total];
        let mut count = total;
        // Each entry is followed by a comma or the closing bracket.
        let mut chars: usize = 1 + entries
            .iter()
            .map(|(_, json)| json.len() + 1)
            .sum::<usize>();
        for index in droppable {
            if count <= self.options.max_nodes && chars <= self.options.char_budget {
                break;
            }
            kept[index] = false;
            count -= 1;
            chars -= entries[index].1.len() + 1;
        }

        let parts: Vec<&str> = entries
            .iter()
            .zip(&kept)
            .filter(|(_, keep)| **keep)
            .map(|((_, json), _)| json.as_str())
            .collect();
        Outline {
            json: format!("[{}]", parts.join(",")),
            nodes: count,
            total,
        }
    }
}

/// Captures the page's visible structure. Reads only.
pub async fn capture_snapshot(
    page: &dyn PageDriver,
    options: &SnapshotOptions,
) -> Result<Snapshot> {
    let args = json!({
        "max_depth": options.max_depth,
        "max_text": options.max_text,
        "max_repeats": options.max_repeats,
        // More than the outline may hold, so that the least important
        // elements can be dropped rather than whatever comes last.
        "max_visited": options.max_nodes.saturating_mul(4).max(2000),
    });
    let mut snapshot: Snapshot = eval_as(page, &format!("({SNAPSHOT_SCRIPT})({args})")).await?;
    snapshot.options = options.clone();
    Ok(snapshot)
}

#[cfg(test)]
pub(super) mod testing {
    use super::*;

    /// Builds snapshot trees by hand: `node("div").class("row").child(...)`.
    pub fn node(tag: &str) -> SnapshotNode {
        SnapshotNode {
            tag: tag.to_owned(),
            ..SnapshotNode::default()
        }
    }

    impl SnapshotNode {
        pub fn with(mut self, name: &str, value: &str) -> Self {
            self.attrs.insert(name.to_owned(), value.to_owned());
            self
        }

        pub fn class(self, value: &str) -> Self {
            self.with("class", value)
        }

        pub fn id(self, value: &str) -> Self {
            self.with("id", value)
        }

        pub fn saying(mut self, text: &str) -> Self {
            self.text_len = text.chars().count();
            self.text = Some(text.to_owned());
            self
        }

        pub fn child(mut self, child: SnapshotNode) -> Self {
            self.children.push(child);
            self
        }

        pub fn children(mut self, children: impl IntoIterator<Item = SnapshotNode>) -> Self {
            self.children.extend(children);
            self
        }
    }

    pub fn snapshot(root: SnapshotNode) -> Snapshot {
        Snapshot {
            url: "https://lms.example.edu/course/7/grade?student=12".to_owned(),
            title: "Grading".to_owned(),
            root,
            stats: SnapshotStats::default(),
            options: SnapshotOptions::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{node, snapshot};
    use super::*;

    // Ported from dom-snapshot-types.test.ts: the priority rules.
    #[test]
    fn decorative_tags_are_low_priority_whatever_they_carry() {
        for tag in LOW_TAGS {
            assert_eq!(
                node(tag).with("data-student", "").priority(),
                Priority::Low,
                "{tag}"
            );
        }
    }

    #[test]
    fn grading_attributes_and_entry_boxes_are_critical() {
        for attr in CRITICAL_ATTRS {
            assert_eq!(
                node("div").with(attr, "").priority(),
                Priority::Critical,
                "{attr}"
            );
        }
        assert_eq!(
            node("input").with("type", "number").priority(),
            Priority::Critical
        );
        assert_eq!(
            node("input").with("type", "TEXT").priority(),
            Priority::Critical
        );
        assert_eq!(node("input").priority(), Priority::Critical);
        assert_eq!(node("textarea").priority(), Priority::Critical);
        assert_eq!(
            node("div").with("contenteditable", "true").priority(),
            Priority::Critical
        );
    }

    #[test]
    fn other_inputs_and_form_structure_are_high() {
        assert_eq!(
            node("input").with("type", "checkbox").priority(),
            Priority::High
        );
        for tag in ["form", "select", "button", "table", "tr", "td", "th"] {
            assert_eq!(node(tag).priority(), Priority::High, "{tag}");
        }
        let hidden = node("input").with("type", "hidden");
        assert_eq!(
            hidden.clone().with("name", "fb-0-2").priority(),
            Priority::High
        );
        assert_eq!(
            hidden.clone().with("name", "FB_3").priority(),
            Priority::High
        );
        assert_eq!(hidden.with("name", "csrf").priority(), Priority::Medium);
    }

    #[test]
    fn content_is_medium_and_empty_leaves_are_low() {
        assert_eq!(node("p").saying("Hello there").priority(), Priority::Medium);
        assert_eq!(node("div").child(node("span")).priority(), Priority::Medium);
        assert_eq!(node("div").priority(), Priority::Low);
        assert_eq!(node("span").class("spacer").priority(), Priority::Low);
    }

    fn page(rows: usize) -> Snapshot {
        let row = |i: usize| {
            node("div")
                .class("student-row")
                .with("data-lastchange", "")
                .child(
                    node("span")
                        .class("name")
                        .saying(&format!("Student {i:02}")),
                )
                .child(node("div").class("resp").saying("Response text."))
                .child(
                    node("input")
                        .with("type", "number")
                        .with("name", &format!("s{i:02}")),
                )
                .child(node("span").class("spacer"))
                .child(node("textarea").with("name", &format!("f{i:02}")))
        };
        snapshot(
            node("body")
                .child(node("h1").saying("Large Batch Grading"))
                .children((1..=rows).map(row))
                .child(node("button").id("save-all").saying("Save All")),
        )
    }

    #[test]
    fn an_outline_lists_every_element_in_page_order_with_its_depth() {
        let outline = page(1).outline();
        assert_eq!((outline.nodes, outline.total), (9, 9));
        let listed: serde_json::Value = serde_json::from_str(&outline.json).unwrap();
        let shape: Vec<(u64, &str)> = listed
            .as_array()
            .unwrap()
            .iter()
            .map(|n| (n["depth"].as_u64().unwrap(), n["tag"].as_str().unwrap()))
            .collect();
        assert_eq!(
            shape,
            [
                (0, "body"),
                (1, "h1"),
                (1, "div"),
                (2, "span"),
                (2, "div"),
                (2, "input"),
                (2, "span"),
                (2, "textarea"),
                (1, "button"),
            ]
        );
        assert_eq!(
            listed[5],
            serde_json::json!({ "depth": 2, "tag": "input", "attrs": { "name": "s01", "type": "number" } })
        );
        assert_eq!(listed[3]["text"], "Student 01");
        // Selectors are for OGRE; an AI is given what it can generalize from.
        assert!(!outline.json.contains("selector"));
    }

    // Ported from dom-snapshot.test.ts: "maxNodes=5 keeps critical input
    // elements" and "critical nodes survive tight budget".
    #[test]
    fn a_node_limit_drops_the_least_important_elements_first() {
        let mut snapshot = page(2);
        snapshot.options.max_nodes = 7;
        let outline = snapshot.outline();
        assert_eq!((outline.nodes, outline.total), (7, 15));
        let listed: serde_json::Value = serde_json::from_str(&outline.json).unwrap();
        let tags: Vec<&str> = listed
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["tag"].as_str().unwrap())
            .collect();
        // Both rows (they carry data-lastchange), their inputs and textareas.
        assert_eq!(
            tags,
            [
                "body", "div", "input", "textarea", "div", "input", "textarea"
            ]
        );
    }

    #[test]
    fn a_character_budget_is_kept_and_the_json_stays_whole() {
        let mut snapshot = page(30);
        snapshot.options.char_budget = 100_000;
        let full = snapshot.outline();
        assert_eq!(full.nodes, full.total);
        assert!(full.json.len() > 8000, "{}", full.json.len());

        snapshot.options.char_budget = 7000;
        let cut = snapshot.outline();
        assert!(cut.json.len() <= 7000, "{}", cut.json.len());
        assert!(cut.nodes < cut.total);
        let listed: serde_json::Value = serde_json::from_str(&cut.json).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), cut.nodes);
        // Spacers went first, then prose from the end of the page backwards.
        // Every score box and the save button are still there.
        assert!(!cut.json.contains("spacer"));
        assert!(cut.json.contains("Student 01") && !cut.json.contains("Student 30"));
        assert_eq!(cut.json.matches("\"type\":\"number\"").count(), 30);
        assert!(cut.json.contains("save-all"));
    }

    #[test]
    fn an_impossible_budget_still_leaves_the_root() {
        let mut snapshot = page(3);
        snapshot.options.char_budget = 10;
        let outline = snapshot.outline();
        assert_eq!(outline.nodes, 1);
        assert_eq!(outline.json, r#"[{"depth":0,"tag":"body"}]"#);
    }

    #[test]
    fn a_snapshot_from_the_page_script_decodes() {
        let raw = serde_json::json!({
            "url": "https://lms.example.edu/grade",
            "title": "Grading",
            "root": {
                "tag": "body", "selector": "html > body:nth-of-type(1)", "attrs": {},
                "children": [
                    { "tag": "tr", "selector": "#r1", "attrs": { "id": "r1" }, "repeats": 30,
                      "children": [{ "tag": "td", "selector": "#r1 > td:nth-of-type(1)", "attrs": {},
                                     "text": "Alice", "text_len": 5 }] }
                ]
            },
            "stats": { "visited": 3, "hidden": 1, "truncated": false }
        });
        let snapshot: Snapshot = serde_json::from_value(raw).unwrap();
        assert_eq!(snapshot.options, SnapshotOptions::default());
        assert_eq!(snapshot.stats.hidden, 1);
        let row = &snapshot.root.children[0];
        assert_eq!(row.repeats, Some(30));
        assert_eq!(row.attr("id"), "r1");
        assert_eq!(row.attr("class"), "");
        assert_eq!(row.children[0].text(), "Alice");
        assert_eq!(
            snapshot
                .root
                .descendants()
                .iter()
                .map(|n| n.tag.as_str())
                .collect::<Vec<_>>(),
            ["body", "tr", "td"]
        );
    }
}
