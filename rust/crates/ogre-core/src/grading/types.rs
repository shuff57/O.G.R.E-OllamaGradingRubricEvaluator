//! Inputs and outputs of the grading functions. Field names serialize to the
//! JSON shapes the JavaScript grading server uses.

use std::fmt;
use std::marker::PhantomData;

use serde::de::{Deserializer, MapAccess, Visitor};
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};

use super::js;
use crate::Submission;

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

/// A string-keyed map that keeps its keys in the order JavaScript's
/// `Object.entries` would list them. Prompts list weights in that order.
#[derive(Debug, Clone, PartialEq)]
pub struct OrderedMap<V>(Vec<(String, V)>);

/// Category name to a number: a percentage weight or a point maximum.
pub type WeightMap = OrderedMap<f64>;

impl<V> OrderedMap<V> {
    pub fn new() -> Self {
        Self(Vec::new())
    }

    pub fn get(&self, key: &str) -> Option<&V> {
        self.0.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Sets `key`, keeping its position if it was already present.
    pub fn insert(&mut self, key: impl Into<String>, value: V) {
        let mut entries = std::mem::take(&mut self.0);
        entries.push((key.into(), value));
        self.0 = js::object_order(entries);
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &V)> {
        self.0.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<V> Default for OrderedMap<V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<K: Into<String>, V> FromIterator<(K, V)> for OrderedMap<V> {
    fn from_iter<I: IntoIterator<Item = (K, V)>>(iter: I) -> Self {
        Self(js::object_order(
            iter.into_iter().map(|(k, v)| (k.into(), v)).collect(),
        ))
    }
}

impl<V: Serialize> Serialize for OrderedMap<V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (key, value) in &self.0 {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for OrderedMap<V> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct MapVisitor<V>(PhantomData<V>);

        impl<'de, V: Deserialize<'de>> Visitor<'de> for MapVisitor<V> {
            type Value = OrderedMap<V>;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("a JSON object")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut entries = Vec::new();
                while let Some(entry) = map.next_entry()? {
                    entries.push(entry);
                }
                Ok(OrderedMap(js::object_order(entries)))
            }
        }

        deserializer.deserialize_map(MapVisitor(PhantomData))
    }
}

/// What a response is graded against.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Rubric {
    /// The question the students answered.
    pub essay_prompt: Option<String>,
    pub max_score: Option<MaxScore>,
    /// Scored categories, each with the requirements feedback is written for.
    #[serde(deserialize_with = "null_as_default")]
    pub checklist_items: Vec<ChecklistItem>,
    /// Key concepts a good answer mentions.
    #[serde(deserialize_with = "null_as_default")]
    pub rubric_items: Vec<RubricItem>,
    /// An exemplar answer.
    pub model_text: Option<String>,
    /// The teacher's own instructions, optionally led by a
    /// `SCORING CALIBRATION:` block of example scores.
    pub custom_instructions: Option<String>,
    pub weight_mode: Option<WeightMode>,
    /// Category name to its percentage of the total grade.
    pub category_weights: Option<WeightMap>,
    /// Category name to each criterion's percentage within it.
    pub criterion_weights: Option<OrderedMap<WeightMap>>,
}

impl Rubric {
    /// The score the question is out of. Missing, zero and unparseable values
    /// give 10.
    pub fn max_score_value(&self) -> f64 {
        let parsed = match &self.max_score {
            Some(MaxScore::Number(n)) => *n,
            Some(MaxScore::Text(s)) => js::parse_float(s),
            None => f64::NAN,
        };
        js::or_number(parsed, 10.0)
    }

    /// The weighting to hand to the response parsers, or `None` when the
    /// rubric has no category weights and scores are simply rescaled.
    ///
    /// Each category's maximum comes from its checklist `points`, keyed by the
    /// category name without its "(5 pts)" suffix.
    pub fn category_weighting(&self) -> Option<CategoryWeighting> {
        let weights = self.category_weights.as_ref().filter(|w| !w.is_empty())?;
        let max_points: WeightMap = self
            .checklist_items
            .iter()
            .filter_map(|item| {
                let category = item.category.as_deref().filter(|c| !c.is_empty())?;
                let points = js::or_number(item.points?, 10.0);
                Some((super::prompts::criterion_name(category), points))
            })
            .collect();
        Some(CategoryWeighting {
            weights: weights.clone(),
            max_points: (!max_points.is_empty()).then_some(max_points),
        })
    }
}

/// A rubric's maximum score, which saved rubrics store as either a number or a
/// numeric string.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MaxScore {
    Number(f64),
    Text(String),
}

impl From<f64> for MaxScore {
    fn from(value: f64) -> Self {
        MaxScore::Number(value)
    }
}

impl From<&str> for MaxScore {
    fn from(value: &str) -> Self {
        MaxScore::Text(value.to_owned())
    }
}

/// Which per-item weight field scales a category's points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WeightMode {
    Category,
    Criterion,
    /// Any other value: points are used as they are.
    #[serde(other)]
    Off,
}

/// One scored category of a rubric.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChecklistItem {
    /// The category name, often with its points appended: "Detail (3 pts)".
    pub category: Option<String>,
    pub points: Option<f64>,
    /// The requirements in this category.
    #[serde(deserialize_with = "null_as_default")]
    pub items: Vec<String>,
    pub category_weight: Option<f64>,
    pub criterion_weight: Option<f64>,
}

/// A group of key concepts.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RubricItem {
    pub category: Option<String>,
    #[serde(deserialize_with = "null_as_default")]
    pub items: Vec<String>,
}

/// One student's answer, ready to grade.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentWork {
    /// Position in the whole class list. Results are matched back by it.
    pub index: usize,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub response: String,
    /// The question as this student saw it, when values are randomized per
    /// student.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

impl From<&Submission> for StudentWork {
    fn from(submission: &Submission) -> Self {
        Self {
            index: submission.index,
            name: submission.name.clone(),
            response: submission.response.clone(),
            prompt: submission.prompt.clone(),
        }
    }
}

/// The score and feedback for one student.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentResult {
    pub student_index: usize,
    pub score: f64,
    pub feedback: String,
}

/// The outcome of grading a single response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SingleGrade {
    pub score: f64,
    pub feedback: String,
}

/// Reference score levels shown to the AI so that it scores consistently.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringAnchors {
    pub excellent: Anchor,
    pub adequate: Anchor,
    pub below_average: Anchor,
    pub minimal: Anchor,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Anchor {
    pub score: f64,
    pub description: String,
}

/// A graded response from an earlier chunk, shown to the AI so the next chunk
/// is scored to the same standard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResponse {
    /// "excellent", "adequate", "belowAverage", "minimal" or "spread".
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    pub student_index: usize,
    /// On the rubric's real scale.
    pub score: f64,
    #[serde(default)]
    pub feedback: String,
}

/// Graded examples from earlier sessions with similar rubrics.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CalibrationExamples {
    /// How many examples were found. Zero suppresses the section.
    pub total: f64,
    pub excellent: Option<CalibrationExample>,
    pub adequate: Option<CalibrationExample>,
    pub minimal: Option<CalibrationExample>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationExample {
    /// On the rubric's real scale.
    pub grading_score: f64,
    #[serde(default)]
    pub feedback: String,
}

/// Replacements for the built-in grading philosophy and scoring scale.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GradingConstants {
    pub grading_philosophy: Option<String>,
    pub scoring_scale_descriptors: Option<Vec<ScaleDescriptor>>,
}

/// What one point on the scoring scale means.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScaleDescriptor {
    pub score: f64,
    pub descriptor: String,
}

/// Category weights for turning an AI response's per-category scores into a
/// total.
#[derive(Debug, Clone, PartialEq)]
pub struct CategoryWeighting {
    /// Category name to its percentage of the total grade.
    pub weights: WeightMap,
    /// Category name to the points its score is out of. Categories not listed
    /// are out of 10.
    pub max_points: Option<WeightMap>,
}

/// Mean and spread of a batch's scores, with the students far from the mean.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlierReport {
    pub mean: f64,
    pub std_dev: f64,
    /// Furthest from the mean first.
    pub outliers: Vec<Outlier>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outlier {
    pub student_index: usize,
    pub score: f64,
    /// Distance from the mean in standard deviations.
    pub deviation: f64,
}

/// Batch statistics quoted in the outlier review prompt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStats {
    pub mean: f64,
    pub std_dev: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_students: Option<usize>,
}

/// A student flagged for a second look, with the first-pass grade.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlierStudent {
    pub index: usize,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub response: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    pub original_score: f64,
    pub original_feedback: String,
}

/// A graded student whose response can be shown as a peer comparison.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerResult {
    pub student_index: usize,
    pub score: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
}

/// A group of students to send to the AI in one request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub students: Vec<StudentWork>,
    /// True for every chunk after the first: it should be graded with
    /// examples from earlier chunks.
    pub needs_anchors: bool,
    pub chunk_index: usize,
    /// Identifies the question variant the chunk's students share. Only set
    /// when chunking by prompt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_key: Option<String>,
}

/// A score range checked for internal consistency by the pairwise sweep.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScoreBand {
    High,
    UpperMid,
    LowerMid,
    Low,
}

impl ScoreBand {
    pub fn label(self) -> &'static str {
        match self {
            ScoreBand::High => "High",
            ScoreBand::UpperMid => "Upper-Mid",
            ScoreBand::LowerMid => "Lower-Mid",
            ScoreBand::Low => "Low",
        }
    }
}

/// The consistency-check prompt for one score band.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandPrompt {
    pub band: ScoreBand,
    pub label: String,
    pub prompt: String,
    pub student_indices: Vec<usize>,
}

/// Why a grading function could not produce a result.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum GradingError {
    /// The prompt names every checklist category, so each needs one.
    #[error("checklist item {index} has no category")]
    MissingCategory { index: usize },
    /// The AI's result array held `null` where a student's result belongs.
    #[error("AI result {position} is null")]
    NullResult { position: usize },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rubric_decodes_the_javascript_shape() {
        let rubric: Rubric = serde_json::from_str(
            r#"{
                "essayPrompt": "Explain.",
                "maxScore": "14",
                "checklistItems": [
                    {"category": "Understanding (5 pts)", "points": 5, "items": ["A"], "categoryWeight": 40}
                ],
                "rubricItems": null,
                "modelText": null,
                "weightMode": "category",
                "categoryWeights": {"Understanding": 60, "Detail": 40},
                "criterionWeights": {"Understanding": {"A": 100}},
                "name": "ignored extra field"
            }"#,
        )
        .unwrap();
        assert_eq!(rubric.max_score_value(), 14.0);
        assert_eq!(rubric.checklist_items[0].category_weight, Some(40.0));
        assert!(rubric.rubric_items.is_empty());
        assert_eq!(rubric.weight_mode, Some(WeightMode::Category));
        let weights: Vec<_> = rubric.category_weights.as_ref().unwrap().iter().collect();
        assert_eq!(weights, [("Understanding", &60.0), ("Detail", &40.0)]);

        let json = serde_json::to_value(&rubric).unwrap();
        assert_eq!(json["checklistItems"][0]["categoryWeight"], 40.0);
        assert_eq!(json["categoryWeights"]["Detail"], 40.0);
    }

    #[test]
    fn max_score_accepts_numbers_strings_and_nothing() {
        let max = |json: &str| {
            serde_json::from_str::<Rubric>(json)
                .unwrap()
                .max_score_value()
        };
        assert_eq!(max(r#"{"maxScore": 20}"#), 20.0);
        assert_eq!(max(r#"{"maxScore": "5.5"}"#), 5.5);
        assert_eq!(max(r#"{"maxScore": ""}"#), 10.0);
        assert_eq!(max(r#"{"maxScore": 0}"#), 10.0);
        assert_eq!(max(r#"{"maxScore": "abc"}"#), 10.0);
        assert_eq!(max(r#"{"maxScore": null}"#), 10.0);
        assert_eq!(max("{}"), 10.0);
    }

    #[test]
    fn unknown_weight_mode_is_off() {
        let rubric: Rubric = serde_json::from_str(r#"{"weightMode": "off"}"#).unwrap();
        assert_eq!(rubric.weight_mode, Some(WeightMode::Off));
        let rubric: Rubric = serde_json::from_str(r#"{"weightMode": "whatever"}"#).unwrap();
        assert_eq!(rubric.weight_mode, Some(WeightMode::Off));
    }

    #[test]
    fn category_weighting_strips_point_suffixes() {
        let rubric: Rubric = serde_json::from_str(
            r#"{
                "checklistItems": [
                    {"category": "Understanding (5 pts)", "points": 5},
                    {"category": "Detail (3 PT)", "points": 0},
                    {"category": "Clarity"},
                    {"points": 2}
                ],
                "categoryWeights": {"Understanding": 70, "Detail": 30}
            }"#,
        )
        .unwrap();
        let weighting = rubric.category_weighting().unwrap();
        assert_eq!(weighting.weights.get("Detail"), Some(&30.0));
        let max_points: Vec<_> = weighting.max_points.as_ref().unwrap().iter().collect();
        assert_eq!(max_points, [("Understanding", &5.0), ("Detail", &10.0)]);

        let unweighted: Rubric = serde_json::from_str(r#"{"categoryWeights": {}}"#).unwrap();
        assert_eq!(unweighted.category_weighting(), None);
    }

    #[test]
    fn results_and_anchors_use_camel_case() {
        let result: StudentResult =
            serde_json::from_str(r#"{"studentIndex": 3, "score": 7.5, "feedback": "ok"}"#).unwrap();
        assert_eq!(result.student_index, 3);
        let anchors: ScoringAnchors = serde_json::from_str(
            r#"{"excellent": {"score": 9, "description": "a"}, "adequate": {"score": 7, "description": "b"},
                "belowAverage": {"score": 5, "description": "c"}, "minimal": {"score": 3, "description": "d"}}"#,
        )
        .unwrap();
        assert_eq!(anchors.below_average.score, 5.0);
        assert_eq!(
            serde_json::to_value(ScoreBand::UpperMid).unwrap(),
            "upper-mid"
        );
    }

    #[test]
    fn student_work_comes_from_a_submission() {
        let submission = Submission {
            index: 4,
            student_id: None,
            name: "Avery, Sam".into(),
            scores: vec![],
            feedback: None,
            response: "An answer.".into(),
            prompt: Some("Q".into()),
        };
        let work = StudentWork::from(&submission);
        assert_eq!((work.index, work.name.as_str()), (4, "Avery, Sam"));
        assert_eq!(work.prompt.as_deref(), Some("Q"));
    }
}
