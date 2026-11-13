//! One run with a real model: a local Ollama reads the fixture grading page
//! and answers a read-only question, with a teacher who allows looking and
//! denies everything else.
//!
//! Needs Chrome and Ollama on `http://localhost:11434` with the model named
//! in `OGRE_TEST_MODEL` (default `gemma4:31b`):
//!     cargo test -p ogre-agent --test live_ollama -- --ignored --nocapture

use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;
use ogre_agent::{
    AgentContext, AgentEnd, AgentEvent, AgentMode, AgentOptions, Approver, CancelFlag, Decision,
    ProposedAction, run_agent,
};
use ogre_harness::PageDriver;
use ogre_harness::cdp::{Chrome, LaunchOptions};
use ogre_llm::{HttpProvider, ProviderConfig, ProviderKind, ProviderOptions};

/// Lets the AI look, and nothing else.
struct ReadOnlyTeacher {
    allowed: Vec<String>,
    denied: Vec<String>,
}

#[async_trait]
impl Approver for ReadOnlyTeacher {
    async fn review(&mut self, proposal: &ProposedAction) -> Decision {
        if proposal.action.is_read_only() {
            self.allowed.push(proposal.description.clone());
            Decision::Allow
        } else {
            self.denied.push(proposal.description.clone());
            Decision::Deny {
                note: Some("This task is read-only. Do not change anything on the page.".into()),
            }
        }
    }
}

fn shorten(text: &str) -> String {
    let flat = text.replace('\n', " ");
    match flat.char_indices().nth(300) {
        Some((end, _)) => format!("{}…", &flat[..end]),
        None => flat,
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed and a local Ollama model"]
async fn a_local_model_finds_the_student_with_a_blank_score() {
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "gemma4:31b".to_owned());
    let config =
        ProviderConfig::new(ProviderKind::Ollama, model.clone()).with_options(ProviderOptions {
            // The system prompt, the page outline and a screenshot do not fit in the default 8k.
            num_ctx: Some(16_384),
            ..ProviderOptions::default()
        });
    let provider = HttpProvider::new(config).expect("an HTTP client");

    let profile_dir = std::env::temp_dir().join(format!("ogre-agent-live-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/imathas-gradeallq2.html")
        .canonicalize()
        .expect("fixture exists");
    let page = chrome
        .open(&format!("file://{}", fixture.display()))
        .await
        .expect("fixture opens");
    let scores = "Array.from(document.querySelectorAll('input[id^=scorebox]')).map((el) => el.value).join('|') + '#' + window.__posted.length";
    let before = page.eval(scores).await.expect("scores");

    let mut options = AgentOptions {
        mode: AgentMode::Review,
        ..AgentOptions::default()
    };
    options.limits.max_steps = 12;
    // A 30B model on a desktop takes its time, most of all on the first call.
    options.limits.max_time = Duration::from_secs(20 * 60);
    let context = AgentContext {
        provider: Some("ollama".into()),
        model: Some(model.clone()),
        ..AgentContext::default()
    };
    let mut teacher = ReadOnlyTeacher {
        allowed: Vec::new(),
        denied: Vec::new(),
    };

    println!("model: {model}");
    let outcome = run_agent(
        &page,
        &provider,
        "Which student has a blank score? Answer with their name.",
        &context,
        &options,
        &mut teacher,
        &CancelFlag::new(),
        &mut |event| match event {
            AgentEvent::Thinking | AgentEvent::Executing { .. } => {}
            AgentEvent::Context { used_tokens, .. } => {
                println!("  (about {used_tokens} tokens sent)")
            }
            AgentEvent::Propose {
                action,
                params,
                reasoning,
                ..
            } => {
                println!(
                    "AI: {action} {} because: {}",
                    serde_json::Value::Object(params),
                    shorten(&reasoning)
                );
            }
            AgentEvent::Result { result, .. } => println!("  -> {}", shorten(&result.to_json())),
            other => println!("{}", shorten(&format!("{other:?}"))),
        },
    )
    .await;

    println!("ended: {:?} after {:.0?}", outcome.end, outcome.elapsed);
    println!("allowed: {:?}", teacher.allowed);
    println!("denied: {:?}", teacher.denied);

    let after = page.eval(scores).await.expect("scores");
    chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(profile_dir);

    assert_eq!(after, before, "a read-only task left the page as it was");
    match &outcome.end {
        AgentEnd::Done { message, .. } => assert!(
            message.contains("Diaz") || message.contains("Remy"),
            "the blank score is Diaz, Remy's, but the model said: {message}"
        ),
        other => panic!("the model did not finish: {other:?}"),
    }
}

/// Lets the AI look and follow links, and nothing else: no typing, no
/// scripts, no going to an address it made up.
struct LooksAndClicks {
    allowed: Vec<String>,
    denied: Vec<String>,
}

#[async_trait]
impl Approver for LooksAndClicks {
    async fn review(&mut self, proposal: &ProposedAction) -> Decision {
        let follows_a_link = matches!(proposal.action, ogre_agent::Action::Click { .. });
        if proposal.action.is_read_only() || follows_a_link {
            self.allowed.push(proposal.description.clone());
            Decision::Allow
        } else {
            self.denied.push(proposal.description.clone());
            Decision::Deny {
                note: Some("Only look and follow links. Do not change anything.".into()),
            }
        }
    }
}

/// The task OGRE gives the agent from the Sites screen: get to the grading
/// page, two links away on a made-up school site, and touch nothing.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed and a local Ollama model"]
async fn a_local_model_finds_its_way_to_the_grading_page() {
    let model = std::env::var("OGRE_TEST_MODEL").unwrap_or_else(|_| "gemma4:31b".to_owned());
    let config =
        ProviderConfig::new(ProviderKind::Ollama, model.clone()).with_options(ProviderOptions {
            num_ctx: Some(16_384),
            ..ProviderOptions::default()
        });
    let provider = HttpProvider::new(config).expect("an HTTP client");

    let profile_dir = std::env::temp_dir().join(format!("ogre-agent-find-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let home = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/agent/school/home.html")
        .canonicalize()
        .expect("fixture exists");
    let page = chrome
        .open(&format!("file://{}", home.display()))
        .await
        .expect("fixture opens");

    let mut options = AgentOptions {
        mode: AgentMode::Review,
        ..AgentOptions::default()
    };
    options.limits.max_steps = 12;
    options.limits.max_time = Duration::from_secs(20 * 60);
    let context = AgentContext {
        provider: Some("ollama".into()),
        model: Some(model.clone()),
        ..AgentContext::default()
    };
    let mut teacher = LooksAndClicks {
        allowed: Vec::new(),
        denied: Vec::new(),
    };
    println!("model: {model}");
    let task = ogre_agent::find_grading_page_task("Quiz 4 in Algebra 2, period 3");
    let outcome = run_agent(
        &page,
        &provider,
        &task,
        &context,
        &options,
        &mut teacher,
        &CancelFlag::new(),
        &mut |event| match event {
            AgentEvent::Propose {
                action,
                params,
                reasoning,
                ..
            } => println!(
                "AI: {action} {} because: {}",
                serde_json::Value::Object(params),
                shorten(&reasoning)
            ),
            AgentEvent::Result { result, .. } => println!("  -> {}", shorten(&result.to_json())),
            _ => {}
        },
    )
    .await;
    println!("ended: {:?} after {:.0?}", outcome.end, outcome.elapsed);
    println!("allowed: {:?}", teacher.allowed);
    println!("denied: {:?}", teacher.denied);

    let ended_on = page.url().await.expect("address");
    let typed = page
        .eval(
            "Array.from(document.querySelectorAll('input, textarea'), (box) => box.value).join('')",
        )
        .await
        .expect("boxes");
    chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(profile_dir);

    assert!(
        ended_on.ends_with("/school/quiz-4-grading.html"),
        "it should have stopped on the grading page for quiz 4, and stopped on {ended_on}"
    );
    assert_eq!(typed, serde_json::json!(""), "nothing was typed on the way");
    assert!(
        matches!(outcome.end, AgentEnd::Done { success: true, .. }),
        "it should say it got there: {:?}",
        outcome.end
    );
}
