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
//!   OGRE_COMPARE_VERDICTS=1  also compare the feedback requirement by
//!                         requirement: where the page's feedback and OGRE's
//!                         disagree on what was correct, and what score each
//!                         gives for a given number of deductions. Counts and
//!                         rubric wording only.
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

/// What feedback says about one requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
    Correct,
    /// Anything else: incorrect, incomplete, not addressed.
    Deducted,
}

/// The requirement sections of a piece of feedback, in order: each heading
/// with the verdict that follows it. Feedback has one `<strong>` heading per
/// requirement, a quotation, then a paragraph that opens with the verdict.
fn verdicts(html: &str) -> Vec<(String, Verdict)> {
    let lower = html.to_lowercase();
    let mut sections = Vec::new();
    let mut at = 0;
    while let Some(open) = lower[at..].find("<strong") {
        let open = at + open;
        let Some(close) = lower[open..].find("</strong>") else {
            break;
        };
        let close = open + close;
        let heading = plain(&html[open..close]);
        let rest = close + "</strong>".len();
        let end = lower[rest..]
            .find("<strong")
            .map_or(html.len(), |next| rest + next);
        at = end;
        // The verdict is the first paragraph after the quotation.
        let body = &html[rest..end];
        let after_quote = body
            .to_lowercase()
            .rfind("</blockquote>")
            .map_or(body, |quote| &body[quote + "</blockquote>".len()..]);
        let said = plain(after_quote).to_lowercase();
        if heading.is_empty() || said.is_empty() {
            continue;
        }
        let verdict = if said.starts_with("correct") {
            Verdict::Correct
        } else {
            Verdict::Deducted
        };
        sections.push((heading, verdict));
    }
    sections
}

/// The shape of a piece of feedback without what it says about anyone: its
/// tags, with only the first word of each run of text after the greeting,
/// and nothing of what is quoted.
fn skeleton(html: &str) -> String {
    let start = html.to_lowercase().find("<strong").unwrap_or(0);
    let mut out = String::new();
    let mut quoted = false;
    for (i, piece) in html[start..].split('<').enumerate() {
        let (tag, text) = if i == 0 {
            ("", piece)
        } else {
            piece.split_once('>').unwrap_or((piece, ""))
        };
        if !tag.is_empty() {
            let name = tag.split_whitespace().next().unwrap_or(tag).to_lowercase();
            match name.as_str() {
                "blockquote" => quoted = true,
                "/blockquote" => quoted = false,
                _ => {}
            }
            out.push_str(&format!("<{name}>"));
        }
        let first = text.split_whitespace().next().unwrap_or("");
        if !first.is_empty() {
            out.push_str(if quoted { "…" } else { first });
            out.push('…');
        }
    }
    out
}

/// The text of a piece of HTML, tags removed and spaces squashed.
fn plain(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            c if !in_tag => text.push(c),
            _ => {}
        }
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Scores listed with how often each was given: "14×9 11×3".
fn tally(scores: &[f64]) -> String {
    let mut sorted = scores.to_vec();
    sorted.sort_by(|a, b| b.total_cmp(a));
    let mut groups: Vec<(f64, usize)> = Vec::new();
    for score in sorted {
        match groups.last_mut() {
            Some((last, count)) if *last == score => *count += 1,
            _ => groups.push((score, 1)),
        }
    }
    groups
        .iter()
        .map(|(score, count)| format!("{score}×{count}"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Prints where two sets of feedback disagree. Each entry is one student:
/// the page's score and feedback, then OGRE's.
fn compare_verdicts(pairs: &[(f64, String, f64, String)]) {
    let read: Vec<_> = pairs
        .iter()
        .map(|(page_score, page, ogre_score, ogre)| {
            (*page_score, verdicts(page), *ogre_score, verdicts(ogre))
        })
        .collect();
    let sections = read
        .iter()
        .map(|(_, _, _, ogre)| ogre.len())
        .max()
        .unwrap_or(0);
    let comparable: Vec<_> = read
        .iter()
        .filter(|(_, page, _, ogre)| page.len() == sections && ogre.len() == sections)
        .collect();
    println!(
        "requirement by requirement: {} of {} students have {sections} sections in both sets of feedback",
        comparable.len(),
        read.len()
    );
    for index in 0..sections {
        let mut counts = [0usize; 4];
        for (_, page, _, ogre) in &comparable {
            let slot = match (page[index].1, ogre[index].1) {
                (Verdict::Correct, Verdict::Correct) => 0,
                (Verdict::Deducted, Verdict::Correct) => 1,
                (Verdict::Correct, Verdict::Deducted) => 2,
                (Verdict::Deducted, Verdict::Deducted) => 3,
            };
            counts[slot] += 1;
        }
        let heading: String = comparable
            .first()
            .map(|(_, _, _, ogre)| ogre[index].0.chars().take(48).collect())
            .unwrap_or_default();
        println!(
            "  R{} both correct {:>2} | only the page deducts {:>2} | only OGRE deducts {:>2} | both deduct {:>2} | {heading}",
            index + 1,
            counts[0],
            counts[1],
            counts[2],
            counts[3]
        );
    }
    if std::env::var_os("OGRE_COMPARE_SHAPES").is_some() {
        let top = pairs.iter().map(|p| p.2).fold(0.0, f64::max);
        for (number, (_, _, score, feedback)) in pairs.iter().enumerate() {
            let deducted = verdicts(feedback)
                .iter()
                .filter(|(_, verdict)| *verdict == Verdict::Deducted)
                .count();
            if *score == top && deducted > 0 {
                println!(
                    "  shape of full-mark feedback with {deducted} deducted (#{}): {}",
                    number + 1,
                    skeleton(feedback)
                );
            }
        }
    }
    println!("score given for each number of deductions in the same feedback:");
    for deductions in 0..=sections {
        let scores = |ogre_side: bool| -> Vec<f64> {
            read.iter()
                .filter_map(|(page_score, page, ogre_score, ogre)| {
                    let (score, sections) = if ogre_side {
                        (ogre_score, ogre)
                    } else {
                        (page_score, page)
                    };
                    let count = sections
                        .iter()
                        .filter(|(_, verdict)| *verdict == Verdict::Deducted)
                        .count();
                    (count == deductions && !sections.is_empty()).then_some(*score)
                })
                .collect()
        };
        let (page, ogre) = (scores(false), scores(true));
        if !page.is_empty() || !ogre.is_empty() {
            println!(
                "  {deductions} deducted | page: {} | OGRE: {}",
                tally(&page),
                tally(&ogre)
            );
        }
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

        // The page's feedback as HTML, in the order the students were read.
        let page_feedback: Vec<Option<String>> =
            if std::env::var_os("OGRE_COMPARE_VERDICTS").is_some() {
                serde_json::from_value(
                    page.eval(
                        "Array.from(document.querySelectorAll('div.bigquestionwrap')).map((s) => { \
                         const b = s.querySelector('.scoredetails .fbbox'); \
                         return b ? (b.tagName === 'TEXTAREA' ? b.value : b.innerHTML) : null; })",
                    )
                    .await?,
                )?
            } else {
                Vec::new()
            };
        let mut feedback_pairs = Vec::new();
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
                    if let Some(Some(theirs)) = page_feedback.get(student.student_index) {
                        feedback_pairs.push((
                            existing,
                            theirs.clone(),
                            grade.score,
                            grade.feedback.clone(),
                        ));
                    }
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
        if !feedback_pairs.is_empty() {
            compare_verdicts(&feedback_pairs);
        }

        // The other way to score: from the feedback's verdicts. Shown beside
        // the AI's own score, for choosing between the two.
        let line = |what: &str, a: &[f64], b: &[f64]| {
            let gaps: Vec<f64> = a.iter().zip(b).map(|(a, b)| (b - a).abs()).collect();
            println!(
                "{what}: {} students | means {:.2} and {:.2} | mean gap {:.2} | identical {} | within 1.5: {} | correlation {}",
                a.len(),
                mean(a),
                mean(b),
                mean(&gaps),
                gaps.iter().filter(|gap| **gap == 0.0).count(),
                gaps.iter().filter(|gap| **gap <= 1.5).count(),
                correlation(a, b).map_or("n/a".to_owned(), |r| format!("{r:.2}")),
            );
        };
        let (mut page_side, mut from_ogre_feedback) = (Vec::new(), Vec::new());
        for student in &outcome.students {
            let submission = &read.submissions[student.student_index];
            let existing = submission
                .score()
                .filter(|_| submission.has_nonzero_score() || submission.has_feedback());
            if let (GradeStatus::Graded(grade), Some(existing)) = (&student.status, existing)
                && let Some(score) = ogre_core::score_from_verdicts(&grade.feedback, &rubric)
            {
                page_side.push(existing);
                from_ogre_feedback.push(score);
            }
        }
        line(
            "page score against OGRE's feedback scored by its verdicts",
            &page_side,
            &from_ogre_feedback,
        );
        let (mut page_scores, mut page_by_verdicts, mut ogre_by_verdicts) =
            (Vec::new(), Vec::new(), Vec::new());
        for (existing, theirs, _, ours) in &feedback_pairs {
            if let (Some(page), Some(ogre)) = (
                ogre_core::score_from_verdicts(theirs, &rubric),
                ogre_core::score_from_verdicts(ours, &rubric),
            ) {
                page_scores.push(*existing);
                page_by_verdicts.push(page);
                ogre_by_verdicts.push(ogre);
            }
        }
        if !page_scores.is_empty() {
            line(
                "page score against the page's own feedback scored by its verdicts",
                &page_scores,
                &page_by_verdicts,
            );
            line(
                "both sets of feedback scored by their verdicts",
                &page_by_verdicts,
                &ogre_by_verdicts,
            );
        }

        // The Electron app offers the consistency check's suggestions for the
        // teacher to accept. Had every one been accepted:
        let adjustments = &outcome.sweep.adjustments;
        if !adjustments.is_empty() {
            let (mut page_scores, mut adjusted, mut pairs) = (Vec::new(), Vec::new(), Vec::new());
            let mut moved = Vec::new();
            for student in &outcome.students {
                let submission = &read.submissions[student.student_index];
                let existing = submission
                    .score()
                    .filter(|_| submission.has_nonzero_score() || submission.has_feedback());
                let (GradeStatus::Graded(grade), Some(existing)) = (&student.status, existing)
                else {
                    continue;
                };
                let suggestion = adjustments
                    .iter()
                    .find(|a| a.student_index == student.student_index);
                let score = suggestion.map_or(grade.score, |a| a.suggested_score);
                let feedback = suggestion
                    .and_then(|a| a.suggested_feedback.clone())
                    .unwrap_or_else(|| grade.feedback.clone());
                if let Some(a) = suggestion {
                    moved.push(a.suggested_score - a.original_score);
                }
                page_scores.push(existing);
                adjusted.push(score);
                if let Some(Some(theirs)) = page_feedback.get(student.student_index) {
                    pairs.push((existing, theirs.clone(), score, feedback));
                }
            }
            let gaps: Vec<f64> = page_scores
                .iter()
                .zip(&adjusted)
                .map(|(a, b)| (b - a).abs())
                .collect();
            println!(
                "consistency check: {} suggestions (changes {}) | with all accepted: mean OGRE {:.2} | mean gap {:.2} | identical {} | within 1.5: {} | correlation {}",
                adjustments.len(),
                tally(&moved),
                mean(&adjusted),
                mean(&gaps),
                gaps.iter().filter(|gap| **gap == 0.0).count(),
                gaps.iter().filter(|gap| **gap <= 1.5).count(),
                correlation(&page_scores, &adjusted)
                    .map_or("n/a".to_owned(), |r| format!("{r:.2}")),
            );
            if !pairs.is_empty() {
                compare_verdicts(&pairs);
            }
        } else {
            println!("consistency check: no suggestions");
        }
    }
    Ok(())
}
