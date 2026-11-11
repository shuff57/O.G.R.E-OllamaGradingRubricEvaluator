//! Re-grades a live MyOpenMath "Grade all" page that already has scores and
//! compares what OGRE would propose with what is on the page. Read-only: it
//! navigates and reads, and never fills a box or saves.
//!
//! It reaches the page through a `playwright-cli` browser session that is
//! already logged in, because that browser cannot be attached to over the
//! DevTools Protocol. Everything after the page connection is the code the
//! app runs: the MyOpenMath adapter, the grading engine, the provider.
//!
//!     cargo run -p ogre-app --example compare_live -- <address> [<address> ...]
//!
//! Environment:
//!   OGRE_COMPARE_SESSION  playwright-cli session name (default `mom`)
//!   OGRE_TEST_MODEL       local Ollama model (default `gemma4:31b`)
//!   OGRE_COMPARE_CLOUD=1  grade with the service, model and key the Electron
//!                         app is set up with (its `ogre-server.json`), which
//!                         sends student names and answers to that service
//!   OGRE_COMPARE_LIMIT    grade at most this many students per page
//!   OGRE_COMPARE_LENIENCY 0 most lenient, 50 as written (default), 100 most strict
//!   OGRE_COMPARE_READ_ONLY=1  read and describe the page, do not grade
//!   OGRE_COMPARE_ANCHORS=1  first have the AI write example answers at each
//!                         score level and grade with them as calibration,
//!                         as the Electron app's "Generate Anchors" does
//!   OGRE_COMPARE_PROMPTS_FROM=<file>  use each student's question text as the
//!                         Electron app read it (a file written by its
//!                         extraction code), to test whether a difference in
//!                         that text explains a difference in scores
//!   OGRE_COMPARE_DUMP=<file>  also write what was read (students and the
//!                         scraped rubric) to this file, for comparing with
//!                         another reader; it holds student work, so keep it
//!                         private and delete it afterwards
//!
//! Student names and answers are never printed; students are numbered.

use std::process::Command;
use std::time::Instant;

use async_trait::async_trait;
use ogre_core::{StudentWork, Submission};
use ogre_grader::{
    CancelFlag, GradeEvent, GradeOptions, GradeStatus, calibration_instructions,
    generate_anchor_examples, grade_batch, prepare_rubric,
};
use ogre_harness::sites::SiteAdapter;
use ogre_harness::sites::imathas::IMathAs;
use ogre_harness::{Error, PageDriver, Result};
use ogre_llm::{HttpProvider, ProviderConfig, ProviderKind};

/// A page in a `playwright-cli` session.
struct CliPage {
    session: String,
}

impl CliPage {
    fn run(&self, args: &[&str]) -> Result<String> {
        let output = Command::new("playwright-cli")
            .arg(format!("-s={}", self.session))
            .args(args)
            .output()
            .map_err(|error| Error::Browser(format!("cannot run playwright-cli: {error}")))?;
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

#[async_trait]
impl PageDriver for CliPage {
    async fn url(&self) -> Result<String> {
        let value = self.eval("location.href").await?;
        Ok(value.as_str().unwrap_or_default().to_owned())
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        self.run(&["goto", url])?;
        Ok(())
    }

    async fn eval(&self, expression: &str) -> Result<serde_json::Value> {
        let output = self.run(&["eval", &format!("() => ({expression})")])?;
        if let Some(error) = output.split("### Error").nth(1) {
            return Err(Error::Script(
                error.trim().lines().next().unwrap_or_default().to_owned(),
            ));
        }
        let result = output
            .split("### Result")
            .nth(1)
            .and_then(|rest| rest.split("\n### ").next())
            .map(str::trim)
            .ok_or_else(|| Error::Browser("playwright-cli printed no result".into()))?;
        if result == "undefined" {
            return Ok(serde_json::Value::Null);
        }
        Ok(serde_json::from_str(result)?)
    }
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len().max(1) as f64
}

fn correlation(a: &[f64], b: &[f64]) -> Option<f64> {
    let (ma, mb) = (mean(a), mean(b));
    let cov: f64 = a.iter().zip(b).map(|(x, y)| (x - ma) * (y - mb)).sum();
    let va: f64 = a.iter().map(|x| (x - ma).powi(2)).sum();
    let vb: f64 = b.iter().map(|y| (y - mb).powi(2)).sum();
    (va > 0.0 && vb > 0.0).then(|| cov / (va * vb).sqrt())
}

/// The provider the Electron app grades with, read from its settings file.
/// The key goes straight into the request configuration and is never printed.
fn electron_app_provider()
-> std::result::Result<(ProviderConfig, String), Box<dyn std::error::Error>> {
    let home = std::env::var("HOME")?;
    let path = format!("{home}/.config/ogre-desktop/ogre-server.json");
    let settings: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    let provider = settings["providers"]
        .as_array()
        .and_then(|providers| providers.iter().find(|p| p["is_active"] == true))
        .ok_or("the Electron app has no active provider")?;
    let url = provider["api_url"].as_str().unwrap_or_default();
    let model = provider["model"]
        .as_str()
        .ok_or("no model in the Electron app's settings")?;
    let key = provider["credentials"]["api_key"]
        .as_str()
        .filter(|key| !key.is_empty())
        .ok_or("no API key in the Electron app's settings")?;
    if !url.contains("ollama.com") {
        return Err(format!("this tool only knows Ollama Cloud, not {url}").into());
    }
    let config = ProviderConfig::new(ProviderKind::OllamaCloud, model)
        .with_base_url(url)
        .with_api_key(key);
    Ok((config, model.to_owned()))
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let addresses: Vec<String> = std::env::args().skip(1).collect();
    if addresses.is_empty() {
        return Err("give at least one gradeallq2.php address".into());
    }
    let session = std::env::var("OGRE_COMPARE_SESSION").unwrap_or_else(|_| "mom".into());
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "gemma4:31b".into());
    let limit: usize = std::env::var("OGRE_COMPARE_LIMIT")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(usize::MAX);
    let leniency: u8 = std::env::var("OGRE_COMPARE_LENIENCY")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(50);
    let read_only = std::env::var_os("OGRE_COMPARE_READ_ONLY").is_some();
    let page = CliPage { session };
    let (config, model) = if std::env::var_os("OGRE_COMPARE_CLOUD").is_some() {
        electron_app_provider()?
    } else {
        (
            ProviderConfig::new(ProviderKind::Ollama, model.as_str()),
            model,
        )
    };
    println!("grading with {model} at {}", config.base_url);
    let provider = HttpProvider::new(config)?;

    for address in &addresses {
        let question = address.split("qid=").nth(1).unwrap_or(address);
        println!("\n=== question {question}");
        if !IMathAs.matches(address) {
            println!("not a Grade all page, skipped");
            continue;
        }
        page.navigate(address).await?;
        // The questions are drawn by the page's own script after it loads.
        page.eval("new Promise((done) => setTimeout(() => done(true), 2500))")
            .await?;

        let read = IMathAs.read_page(&page).await?;
        let scraped = IMathAs.read_rubric(&page).await?;
        if let Some(path) = std::env::var_os("OGRE_COMPARE_DUMP") {
            let dump = serde_json::json!({ "page": read, "rubric": scraped });
            std::fs::write(&path, serde_json::to_vec(&dump)?)?;
        }
        // The same preparation the app does before grading.
        let prepared = prepare_rubric(&provider, &scraped, leniency).await;
        if let Some(problem) = &prepared.rewrite_problem {
            println!("  warning: leniency rewrite skipped: {problem}");
        }
        let mut rubric = prepared.rubric;
        if std::env::var_os("OGRE_COMPARE_ANCHORS").is_some() {
            let examples =
                generate_anchor_examples(&provider, &rubric, Some(f64::from(leniency))).await?;
            println!("calibration: {} example answers generated", examples.len());
            rubric.custom_instructions = calibration_instructions(&examples);
        }
        let written: Vec<&Submission> = read
            .submissions
            .iter()
            .filter(|s| !s.response.trim().is_empty())
            .collect();
        let prompts: std::collections::BTreeSet<&str> =
            written.iter().filter_map(|s| s.prompt.as_deref()).collect();
        println!(
            "students {} | with a written answer {} | already scored above zero {} | with feedback {} | score boxes per student {:?}",
            read.submissions.len(),
            written.len(),
            read.submissions
                .iter()
                .filter(|s| s.has_nonzero_score())
                .count(),
            read.submissions.iter().filter(|s| s.has_feedback()).count(),
            read.submissions
                .iter()
                .map(|s| s.scores.len())
                .collect::<std::collections::BTreeSet<_>>(),
        );
        println!(
            "rubric: out of {} | question {} chars | checklist {} categories, {} items | targets {} categories | model answer {} | distinct question versions {}",
            rubric.max_score_value(),
            rubric.essay_prompt.as_deref().map_or(0, str::len),
            rubric.checklist_items.len(),
            rubric
                .checklist_items
                .iter()
                .map(|c| c.items.len())
                .sum::<usize>(),
            rubric.rubric_items.len(),
            if rubric.model_text.is_some() {
                "yes"
            } else {
                "no"
            },
            prompts.len(),
        );
        let lengths: Vec<usize> = written.iter().map(|s| s.response.len()).collect();
        if let (Some(min), Some(max)) = (lengths.iter().min(), lengths.iter().max()) {
            println!("answer length: {min} to {max} chars");
        }
        if read_only || written.is_empty() {
            continue;
        }

        let mut students: Vec<StudentWork> = written
            .iter()
            .take(limit)
            .map(|s| StudentWork::from(*s))
            .collect();
        if let Some(path) = std::env::var_os("OGRE_COMPARE_PROMPTS_FROM") {
            let other: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
            let mut replaced = 0;
            for student in &mut students {
                let theirs = other["students"]
                    .as_array()
                    .and_then(|all| all.iter().find(|s| s["index"] == student.index))
                    .and_then(|s| s["prompt"].as_str());
                if let Some(prompt) = theirs {
                    student.prompt = Some(prompt.to_owned());
                    replaced += 1;
                }
            }
            println!("question text taken from the other reader for {replaced} students");
        }
        let sent = students.len();
        let started = Instant::now();
        let mut done = 0;
        let mut on_event = |event: GradeEvent| {
            if matches!(event, GradeEvent::Student(_)) {
                done += 1;
                eprint!("\r  graded {done} of {sent}");
            }
        };
        let outcome = grade_batch(
            &provider,
            &rubric,
            students,
            &GradeOptions::default(),
            &CancelFlag::new(),
            &mut on_event,
        )
        .await?;
        eprintln!();
        println!(
            "{model} graded {sent} students in {:.0?}",
            started.elapsed()
        );
        for warning in &outcome.warnings {
            println!("  warning: {warning}");
        }

        let (mut on_page, mut proposed) = (Vec::new(), Vec::new());
        println!("  student  on page  OGRE   diff   feedback");
        for (number, student) in outcome.students.iter().enumerate() {
            // A zero with no feedback is a student nobody has graded yet, such
            // as a late submission. It is not a score to compare against.
            let submission = &read.submissions[student.student_index];
            let existing = submission
                .score()
                .filter(|_| submission.has_nonzero_score() || submission.has_feedback());
            match (&student.status, existing) {
                (GradeStatus::Graded(grade), Some(existing)) => {
                    println!(
                        "  S{:02}      {existing:>5}   {:>5}  {:>+5.1}   {} chars",
                        number + 1,
                        grade.score,
                        grade.score - existing,
                        grade.feedback.len()
                    );
                    on_page.push(existing);
                    proposed.push(grade.score);
                }
                (GradeStatus::Graded(grade), None) => {
                    println!(
                        "  S{:02}          –   {:>5}      –   (not graded on the page)",
                        number + 1,
                        grade.score
                    );
                }
                (GradeStatus::NotGraded(reason), _) => {
                    println!("  S{:02}      not graded: {reason}", number + 1);
                }
            }
        }
        if on_page.is_empty() {
            continue;
        }
        let max = rubric.max_score_value();
        let gaps: Vec<f64> = on_page
            .iter()
            .zip(&proposed)
            .map(|(a, b)| (b - a).abs())
            .collect();
        let within = |points: f64| gaps.iter().filter(|gap| **gap <= points).count();
        // Scores move in steps of about a tenth of the maximum.
        let step = (max * 0.11).max(1.0);
        println!(
            "compared {} | mean on page {:.2} | mean OGRE {:.2} | OGRE higher by {:+.2} on average | mean gap {:.2} of {max} | identical {} | within one step ({step:.1}) {} | correlation {}",
            on_page.len(),
            mean(&on_page),
            mean(&proposed),
            mean(&proposed) - mean(&on_page),
            mean(&gaps),
            within(0.0),
            within(step),
            correlation(&on_page, &proposed).map_or("n/a".to_owned(), |r| format!("{r:.2}")),
        );
    }
    Ok(())
}
