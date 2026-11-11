//! A record of each grading session, so every score OGRE proposed or wrote
//! can be traced afterwards.
//!
//! One file per page read, under `sessions/` in the app's data folder, one
//! JSON object per line. Student responses are not recorded.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogre_core::{GradeWrite, GradingPage, format_score};
use ogre_harness::sites::{Mismatch, WriteReceipt};
use serde_json::{Value, json};

use crate::grading::GradeReport;

pub struct AuditLog {
    dir: PathBuf,
    file: Option<File>,
}

impl AuditLog {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            dir: data_dir.join("sessions"),
            file: None,
        }
    }

    /// Starts a new record for a page that was just read.
    pub fn begin(&mut self, page: &GradingPage) {
        self.file = std::fs::create_dir_all(&self.dir)
            .and_then(|()| {
                let path = self.dir.join(format!("{}.jsonl", now()));
                OpenOptions::new().create(true).append(true).open(path)
            })
            .inspect_err(|error| eprintln!("ogre: cannot write the session record: {error}"))
            .ok();
        self.append(json!({
            "event": "read",
            "url": page.url,
            "title": page.title,
            "students": page.submissions.iter().map(|s| json!({
                "index": s.index,
                "id": s.student_id,
                "name": s.name,
                "score": s.score(),
                "has_feedback": s.has_feedback(),
            })).collect::<Vec<_>>(),
        }));
    }

    pub fn graded(&mut self, report: &GradeReport) {
        self.append(json!({
            "event": "graded",
            "cancelled": report.cancelled,
            "warnings": report.warnings,
            "results": report.rows.iter().map(|row| match &row.outcome {
                Ok(grade) => json!({
                    "index": row.index,
                    "score": grade.score,
                    "feedback": grade.feedback_html,
                    "flag": grade.flag,
                }),
                Err(reason) => json!({ "index": row.index, "not_graded": reason }),
            }).collect::<Vec<_>>(),
        }));
    }

    pub fn written(&mut self, written: &[(GradeWrite, WriteReceipt)], mismatches: &[Mismatch]) {
        self.append(json!({
            "event": "written",
            "students": written.iter().map(|(write, receipt)| json!({
                "index": write.index,
                "id": write.student_id,
                "name": write.name,
                "field": write.score.field,
                "was": write.score.expected,
                "score": format_score(write.score.value),
                "feedback": receipt.feedback_text,
            })).collect::<Vec<_>>(),
            "mismatches": mismatches.iter().map(|m| json!({
                "name": m.name,
                "problem": m.problem,
            })).collect::<Vec<_>>(),
        }));
    }

    pub fn saved(&mut self) {
        self.append(json!({ "event": "saved" }));
    }

    fn append(&mut self, mut entry: Value) {
        let Some(file) = &mut self.file else { return };
        entry["at"] = json!(now());
        if let Err(error) = writeln!(file, "{entry}").and_then(|()| file.flush()) {
            eprintln!("ogre: cannot write the session record: {error}");
        }
    }
}

/// Seconds since 1970.
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}
