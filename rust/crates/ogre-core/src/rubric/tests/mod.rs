//! The desktop's `rubric-utils.test.ts`, ported case by case, plus a
//! differential test against the TypeScript itself.

mod editing;
mod golden;
mod import;
mod utils_test;
mod weights;

use super::*;
use crate::grading::{Rubric, WeightMode};

/// A criterion with no category or weights.
fn criterion(criteria: &str, description: &str, points: f64) -> RubricCriterion {
    RubricCriterion {
        criteria: criteria.to_owned(),
        description: description.to_owned(),
        points,
        ..RubricCriterion::default()
    }
}

impl RubricCriterion {
    fn category(mut self, category: &str) -> Self {
        self.category = Some(category.to_owned());
        self
    }

    fn category_weight(mut self, weight: f64) -> Self {
        self.category_weight = Some(weight);
        self
    }

    fn criterion_weight(mut self, weight: f64) -> Self {
        self.criterion_weight = Some(weight);
        self
    }

    fn allocation(mut self) -> Self {
        self.row_type = Some(RowType::Allocation);
        self
    }
}

/// The teacher's rubric as scraped from a live page: points in the category
/// names, out of 14.
fn real_rubric() -> Rubric {
    serde_json::from_str(
        r#"{
            "essayPrompt": "A basketball player makes 70% of free throws. In 20 attempts, find the probability of at least 16 makes.",
            "maxScore": 14,
            "modelText": "X ~ B(20, 0.7). P(X >= 16) = 0.2375.",
            "rubricItems": [],
            "checklistItems": [
                {"category": "Check the Conditions(4 pts)", "items": ["Say there is a fixed number of trials, and how many.", "Say each trial has two outcomes, success or failure.", "Say the chance of success is the same on each trial and the trials are independent."]},
                {"category": "Name the Parameters(2 pts)", "items": ["Say what one trial is and what counts as a success.", "Give the values of n and p, and write X ~ B(n, p)."]},
                {"category": "State and Compute(4 pts)", "items": ["Write the probability asked for with the correct inequality, for example P(X >= k).", "Give the value, using a calculator."]},
                {"category": "Interpret(4 pts)", "items": ["Say what the probability means for this situation, in a sentence.", "Find the mean np and say whether the outcome is unusual."]}
            ]
        }"#,
    )
    .expect("fixture rubric is valid JSON")
}
