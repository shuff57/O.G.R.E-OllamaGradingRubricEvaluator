//! The agent against real pages in a real headless Chrome: what it sees, and
//! that its clicks and typing are genuine input that arrives where it should.
//!
//! Needs Chrome or Edge installed, so these are skipped by default:
//!     cargo test -p ogre-agent -- --ignored

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use ogre_agent::{
    ActionResult, AgentContext, AgentEnd, AgentMode, AgentOptions, AgentOutcome, AgentStep,
    ApprovalReason, Approver, CancelFlag, Decision, PageState, PageStateOptions, ProposedAction,
    capture_page_state, run_agent,
};
use ogre_harness::PageDriver;
use ogre_harness::cdp::{CdpPage, Chrome, LaunchOptions};
use ogre_llm::{ChatProvider, ChatRequest, LlmError};
use serde_json::{Value, json};

const GRADING: &str = "imathas-gradeallq2.html";
const LOGIN: &str = "agent/login.html";

struct Session {
    chrome: Chrome,
    profile_dir: PathBuf,
    page: CdpPage,
}

async fn open(test: &str, fixture: &str) -> Session {
    let profile_dir =
        std::env::temp_dir().join(format!("ogre-agent-test-{test}-{}", std::process::id()));
    let chrome = Chrome::launch(LaunchOptions {
        profile_dir: profile_dir.clone(),
        headless: true,
        executable: None,
    })
    .await
    .expect("Chrome starts");
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(fixture)
        .canonicalize()
        .expect("fixture exists");
    let page = chrome
        .open(&format!("file://{}", path.display()))
        .await
        .expect("fixture opens");
    Session {
        chrome,
        profile_dir,
        page,
    }
}

async fn close(session: Session) {
    session.chrome.close().await.expect("Chrome closes");
    let _ = std::fs::remove_dir_all(session.profile_dir);
}

/// An AI that plays back a list of actions.
struct Script {
    replies: Mutex<VecDeque<String>>,
    requests: Mutex<Vec<ChatRequest>>,
}

impl Script {
    fn new(replies: impl IntoIterator<Item = Value>) -> Self {
        let done =
            json!({ "action": "done", "params": { "success": true, "message": "finished" } });
        Self {
            replies: Mutex::new(
                replies
                    .into_iter()
                    .chain([done])
                    .map(|reply| reply.to_string())
                    .collect(),
            ),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn requests(&self) -> Vec<ChatRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl ChatProvider for Script {
    async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
        self.requests.lock().unwrap().push(request.clone());
        self.replies
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| LlmError::InvalidResponse("script ran out".to_owned()))
    }
}

fn act(action: &str, params: Value) -> Value {
    json!({ "action": action, "params": params, "reasoning": "scripted" })
}

/// A teacher who gives one answer to everything and remembers what was asked.
struct Teacher {
    answer: Decision,
    asked: Vec<ProposedAction>,
}

impl Teacher {
    fn who(answer: Decision) -> Self {
        Self {
            answer,
            asked: Vec::new(),
        }
    }

    fn denies() -> Self {
        Self::who(Decision::Deny { note: None })
    }
}

#[async_trait]
impl Approver for Teacher {
    async fn review(&mut self, proposal: &ProposedAction) -> Decision {
        self.asked.push(proposal.clone());
        self.answer.clone()
    }
}

async fn run(
    page: &CdpPage,
    script: &Script,
    teacher: &mut Teacher,
    mode: AgentMode,
) -> AgentOutcome {
    let mut options = AgentOptions {
        mode,
        ..AgentOptions::default()
    };
    options.limits.action_delay = Duration::from_millis(50);
    // These scripts fail on purpose, many times in a row.
    options.limits.max_consecutive_failures = 20;
    run_agent(
        page,
        script,
        "Scripted test",
        &AgentContext::default(),
        &options,
        teacher,
        &CancelFlag::new(),
        &mut |_| {},
    )
    .await
}

fn results(outcome: &AgentOutcome) -> Vec<Option<ActionResult>> {
    outcome
        .steps
        .iter()
        .map(|step| match step {
            AgentStep::Action(step) => step.result.clone(),
            AgentStep::Text { .. } => None,
        })
        .collect()
}

fn error_of(outcome: &AgentOutcome, step: usize) -> String {
    results(outcome)[step]
        .as_ref()
        .and_then(|result| result.error.clone())
        .unwrap_or_else(|| panic!("step {step} did not fail: {:?}", outcome.steps[step]))
}

async fn capture(page: &CdpPage) -> PageState {
    capture_page_state(page, &PageStateOptions::default())
        .await
        .expect("page state")
}

fn ref_of(state: &PageState, selector: &str) -> String {
    state
        .elements
        .iter()
        .find(|el| el.selector == selector)
        .unwrap_or_else(|| panic!("{selector} is not listed:\n{}", state.outline(usize::MAX)))
        .ref_id
        .clone()
}

async fn js(page: &CdpPage, expression: &str) -> Value {
    page.eval(expression).await.expect("script runs")
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn state_capture_lists_the_score_boxes_and_quick_save_with_refs() {
    let s = open("capture", GRADING).await;
    let state = capture(&s.page).await;

    assert!(state.url.ends_with("/fixtures/imathas-gradeallq2.html"));
    assert_eq!(state.title, "Grade all questions - fixture");

    let line = |selector: &str| {
        let element = state
            .elements
            .iter()
            .find(|el| el.selector == selector)
            .unwrap_or_else(|| panic!("{selector} is not listed:\n{}", state.outline(usize::MAX)));
        // Drop the ref and the off-screen mark, which depend on layout.
        let line = element.outline_line();
        let line = line
            .strip_suffix(" [offscreen]")
            .unwrap_or(&line)
            .to_owned();
        line.split_once("] ")
            .expect("starts with a ref")
            .1
            .to_owned()
    };
    assert_eq!(
        line("#quicksavebtn"),
        "button[button] \"Quick Save\" (#quicksavebtn)"
    );
    assert_eq!(
        line("#scorebox0"),
        "input label=\"Score\" value=\"10\" (#scorebox0)"
    );
    assert_eq!(
        line("#scorebox1"),
        "input label=\"Score\" value=\"0\" (#scorebox1)"
    );
    assert_eq!(
        line("#scorebox2-0"),
        "input label=\"Score for part 1\" value=\"3.5\" (#scorebox2-0)"
    );
    assert_eq!(
        line("#scorebox2-1"),
        "input label=\"Score for part 2\" value=\"N/A\" (#scorebox2-1)"
    );
    assert_eq!(
        line("#scorebox3"),
        "input label=\"Score\" value=\"\" (#scorebox3)"
    );
    assert_eq!(
        line("#scorebox4"),
        "input label=\"Score\" value=\"1\" (#scorebox4)"
    );
    assert_eq!(
        line("#stusel"),
        "select[select-one] label=\"Jump to student\" value=\"Brook, Kai\" (#stusel)"
    );
    assert_eq!(
        line("#fb-0-2-1001"),
        "div \"Nice work, Sam.\" label=\"Feedback\" (#fb-0-2-1001)"
    );

    // Every element has a ref of its own, and a selector that finds it alone.
    let refs: HashSet<&str> = state.elements.iter().map(|el| el.ref_id.as_str()).collect();
    assert_eq!(refs.len(), state.elements.len());
    assert!(
        refs.iter()
            .all(|r| r.starts_with('e') && r[1..].parse::<u32>().is_ok())
    );
    for element in &state.elements {
        let count = js(
            &s.page,
            &format!(
                "document.querySelectorAll({}).length",
                json!(element.selector)
            ),
        )
        .await;
        assert_eq!(
            count,
            json!(1),
            "{} matches {count} elements",
            element.selector
        );
    }
    // The links that repeat for every student are told apart by position.
    let full_credit: Vec<_> = state
        .elements
        .iter()
        .filter(|el| el.info.text.starts_with("Full credit"))
        .collect();
    assert_eq!(full_credit.len(), 4);

    // Hidden inputs are not on screen and not listed.
    assert!(
        state
            .elements
            .iter()
            .all(|el| el.info.kind.as_deref() != Some("hidden"))
    );
    assert_eq!(state.total, state.elements.len());

    // A second look gives every element the ref it had.
    let again = capture(&s.page).await;
    assert_eq!(
        ref_of(&again, "#quicksavebtn"),
        ref_of(&state, "#quicksavebtn")
    );
    assert_eq!(ref_of(&again, "#scorebox3"), ref_of(&state, "#scorebox3"));

    // A small budget shortens the outline and says so.
    let short = state.outline(400);
    assert!(short.len() < 520, "{}", short.len());
    assert!(short.contains("more interactive elements are not listed"));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_scripted_run_clicks_a_score_box_and_types_a_score_with_real_input() {
    let s = open("type-score", GRADING).await;
    js(
        &s.page,
        "window.__seen = [];
         for (const type of ['click', 'input', 'keydown']) {
           document.getElementById('scorebox3').addEventListener(type, (e) => window.__seen.push([e.type, e.isTrusted]));
         }
         0",
    )
    .await;
    let blank = ref_of(&capture(&s.page).await, "#scorebox3");

    // Diaz, Remy's score is blank; Cruz, Jo's part 1 is 3.5 and gets replaced.
    let script = Script::new([
        act("click", json!({ "selector": blank })),
        act("type", json!({ "selector": blank, "text": "7.5" })),
        act(
            "type",
            json!({ "selector": "#scorebox2-0", "text": "4", "clear": true }),
        ),
    ]);
    let mut teacher = Teacher::who(Decision::Allow);
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(
        matches!(outcome.end, AgentEnd::Done { .. }),
        "{:?}",
        outcome.end
    );

    // Clicking a score box is free; typing into one is put to the teacher.
    assert_eq!(teacher.asked.len(), 2);
    assert_eq!(
        teacher.asked[0].description,
        "Type \"7.5\" into the text box \"Score\" (currently empty), adding to what is there"
    );
    assert!(matches!(
        teacher.asked[0].forced_by[..],
        [ApprovalReason::EditsScore { .. }]
    ));
    assert_eq!(
        teacher.asked[1].description,
        "Type \"4\" into the text box \"Score for part 1\" (currently \"3.5\"), replacing what is there"
    );

    // The page shows the scores, and saw real input, not scripted events.
    let page = js(
        &s.page,
        "({ blank: document.getElementById('scorebox3').value,
            part: document.getElementById('scorebox2-0').value,
            others: ['scorebox0', 'scorebox1', 'scorebox2-1', 'scorebox4'].map((id) => document.getElementById(id).value),
            seen: window.__seen,
            posted: window.__posted.length })",
    )
    .await;
    assert_eq!(page["blank"], "7.5");
    assert_eq!(page["part"], "4");
    assert_eq!(page["others"], json!(["10", "0", "N/A", "1"]));
    assert_eq!(page["posted"], 0, "typing does not save");
    let seen = page["seen"].as_array().unwrap();
    assert!(seen.contains(&json!(["click", true])), "{seen:?}");
    assert!(seen.contains(&json!(["input", true])), "{seen:?}");
    assert!(seen.iter().all(|event| event[1] == true), "{seen:?}");

    let all = results(&outcome);
    assert_eq!(
        all[1].as_ref().unwrap().data,
        Some(json!({ "value": "7.5" }))
    );
    assert_eq!(all[2].as_ref().unwrap().data, Some(json!({ "value": "4" })));

    // The AI was shown the new value on its next turn.
    let last = script.requests().pop().unwrap();
    assert!(
        last.messages
            .last()
            .unwrap()
            .text
            .contains("value=\"7.5\" (#scorebox3)")
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_denied_score_is_not_typed() {
    let s = open("deny-score", GRADING).await;
    let script = Script::new([act(
        "type",
        json!({ "selector": "#scorebox1", "text": "9", "clear": true }),
    )]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert_eq!(teacher.asked.len(), 1);
    assert_eq!(
        js(&s.page, "document.getElementById('scorebox1').value").await,
        "0"
    );
    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn quick_save_in_auto_mode_asks_for_approval_first() {
    let s = open("quick-save", GRADING).await;

    let script = Script::new([act("click", json!({ "selector": "#quicksavebtn" }))]);
    let mut teacher = Teacher::denies();
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(matches!(outcome.end, AgentEnd::Done { .. }));
    assert_eq!(teacher.asked.len(), 1);
    assert_eq!(
        teacher.asked[0].description,
        "Click the button \"Quick Save\""
    );
    assert!(
        matches!(&teacher.asked[0].forced_by[..], [ApprovalReason::Commits { what }] if what.contains("save")),
        "{:?}",
        teacher.asked[0].forced_by
    );
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert_eq!(
        js(&s.page, "window.__posted.length").await,
        0,
        "denied: nothing was saved"
    );

    // The same click, allowed, saves once. Named by ref this time.
    let quick_save = ref_of(&capture(&s.page).await, "#quicksavebtn");
    let script = Script::new([
        act("click", json!({ "selector": quick_save })),
        act("sleep", json!({ "ms": 400 })),
    ]);
    let mut teacher = Teacher::who(Decision::Allow);
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert_eq!(teacher.asked.len(), 1, "the wait is not asked about");
    assert_eq!(js(&s.page, "window.__posted.length").await, 1);

    // The form's own submit button is held back as well.
    let script = Script::new([act(
        "click",
        json!({ "selector": "button[type=\"submit\"]" }),
    )]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert_eq!(teacher.asked.len(), 1);
    assert!(
        s.page
            .url()
            .await
            .unwrap()
            .ends_with("imathas-gradeallq2.html"),
        "the form was not posted"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn quick_grade_links_and_keys_in_a_score_box_ask_first() {
    let s = open("quick-grade", GRADING).await;
    let state = capture(&s.page).await;
    let full_credit = state
        .elements
        .iter()
        .find(|el| el.info.text == "Full credit")
        .expect("a Full credit link")
        .ref_id
        .clone();

    let script = Script::new([
        act("click", json!({ "selector": full_credit })),
        // Focus a score box (free), then try to change it from the keyboard.
        act("click", json!({ "selector": "#scorebox1" })),
        act("pressKey", json!({ "key": "9" })),
        act("pressKey", json!({ "key": "Enter" })),
        act("pressKey", json!({ "key": "Tab" })),
    ]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;

    let asked: Vec<&str> = teacher.asked.iter().map(|p| p.action.name()).collect();
    assert_eq!(asked, ["click", "pressKey", "pressKey"], "Tab is free");
    assert!(matches!(
        teacher.asked[1].forced_by[..],
        [ApprovalReason::EditsScore { .. }]
    ));
    // Enter in a form field would submit the form, as well as being a key in a score box.
    assert_eq!(
        teacher.asked[2].forced_by.len(),
        2,
        "{:?}",
        teacher.asked[2].forced_by
    );
    assert_eq!(
        js(&s.page, "document.getElementById('scorebox1').value").await,
        "0"
    );
    // Tab really moved the focus on.
    assert_ne!(js(&s.page, "document.activeElement.id").await, "scorebox1");

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn feedback_is_typed_into_the_rich_text_box_as_text_never_as_markup() {
    let s = open("feedback", GRADING).await;
    let script = Script::new([
        // Kai's box is empty: free to type into.
        act(
            "type",
            json!({ "selector": "#fb-0-2-1002", "text": "Good start, <b>Kai</b>.<img src=x onerror=\"window.__pwned=1\">" }),
        ),
        // Sam's already has the teacher's words: replacing them asks first.
        act(
            "type",
            json!({ "selector": "#fb-0-2-1001", "text": "Redo.", "clear": true }),
        ),
        act("triple_click", json!({ "selector": "#fb-0-2-1001" })),
    ]);
    let mut teacher = Teacher::denies();
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(
        matches!(outcome.end, AgentEnd::Done { .. }),
        "{:?}",
        outcome.end
    );

    assert_eq!(teacher.asked.len(), 1);
    assert_eq!(teacher.asked[0].forced_by, [ApprovalReason::ReplacesText]);
    let page = js(
        &s.page,
        "({ kai: document.getElementById('fb-0-2-1002').textContent,
            markup: document.querySelectorAll('#fb-0-2-1002 b, #fb-0-2-1002 img').length,
            pwned: window.__pwned === 1,
            sam: document.getElementById('fb-0-2-1001').innerHTML,
            selected: String(window.getSelection()) })",
    )
    .await;
    assert_eq!(
        page["kai"],
        "Good start, <b>Kai</b>.<img src=x onerror=\"window.__pwned=1\">"
    );
    assert_eq!(page["markup"], 0, "the text was typed, not parsed");
    assert_eq!(page["pwned"], false);
    assert_eq!(page["sam"], "<p>Nice work, Sam.</p>", "denied: left alone");
    assert_eq!(
        page["selected"], "Nice work, Sam.",
        "triple_click selected the text"
    );

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn reading_and_scrolling_work_on_the_real_page() {
    let s = open("read", GRADING).await;
    let script = Script::new([
        act("scrollIntoView", json!({ "text": "Evans, Lee" })),
        act("readText", json!({ "selector": "#scorebox2-0" })),
        act("readText", json!({ "selector": "#qnwrap1" })),
        act("readText", json!({})),
        act("waitFor", json!({ "selector": "#quicksavebtn" })),
        act("scroll", json!({ "direction": "up", "amount": 100000 })),
        act("click", json!({ "selector": "span.nothing-like-this" })),
        act("screenshot", json!({})),
    ]);
    let mut teacher = Teacher::denies();
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(teacher.asked.is_empty(), "{:?}", teacher.asked);

    let all = results(&outcome);
    let data = |n: usize| all[n].as_ref().unwrap().data.clone().unwrap();
    assert_eq!(data(0), json!({ "matched": "Evans, Lee" }));
    assert_eq!(data(1), json!("3.5"), "a field is read by its value");
    assert_eq!(
        data(2),
        json!("If you ask more people the answer is closer to the real one.")
    );
    let whole = data(3);
    let whole = whole.as_str().unwrap();
    assert!(whole.contains("Diaz, Remy") && whole.len() <= 5_000);
    assert_eq!(data(5)["scrollY"], 0);
    assert_eq!(
        error_of(&outcome, 6),
        "Element not found: span.nothing-like-this"
    );
    assert!(data(7)["bytes"].as_u64().unwrap() > 1_000);
    assert!(all[1].as_ref().unwrap().page_content);

    // Every turn carried a picture of the page.
    for request in script.requests() {
        let last = request.messages.last().unwrap();
        assert_eq!(last.images.len(), 1);
        assert!(last.images[0].data.starts_with("iVBOR"), "a PNG");
    }

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_ref_stops_working_when_the_page_is_reloaded_and_is_never_reused() {
    let s = open("stale", GRADING).await;
    let before = capture(&s.page).await;
    let old = ref_of(&before, "#quicksavebtn");
    let highest = |state: &PageState| {
        state
            .elements
            .iter()
            .filter_map(|el| el.ref_id[1..].parse::<u32>().ok())
            .max()
            .unwrap()
    };

    let url = s.page.url().await.unwrap();
    let script = Script::new([
        act("click", json!({ "selector": "#scorebox0" })),
        act("navigate", json!({ "url": url })),
        act("click", json!({ "selector": old })),
    ]);
    let mut teacher = Teacher::denies();
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;

    assert!(
        teacher.asked.is_empty(),
        "the old ref never got as far as approval"
    );
    assert!(
        error_of(&outcome, 2).starts_with(&format!(
            "Element not found: {old} is not on the page any more."
        )),
        "{}",
        error_of(&outcome, 2)
    );
    assert_eq!(js(&s.page, "window.__posted.length").await, 0);

    // The reloaded page's elements were given new refs, above all the old ones.
    let requests = script.requests();
    let listed = &requests[2].messages.last().unwrap().text;
    let first_new = format!("[e{}] ", highest(&before) + 1);
    assert!(listed.contains(&first_new), "no {first_new} in:\n{listed}");
    assert!(!listed.contains(&format!("[{old}] ")));

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_password_field_is_never_typed_into_or_read() {
    let s = open("password", LOGIN).await;

    // Nothing the AI is shown gives the password away.
    let state = capture(&s.page).await;
    let outline = state.outline(usize::MAX);
    assert!(!outline.contains("s3cret-Fixture"), "{outline}");
    assert!(!outline.contains("4821"), "{outline}");
    assert!(
        outline.contains("input[password] label=\"Password\" (#password)"),
        "{outline}"
    );
    assert!(
        outline.contains("input[password] label=\"Confirm\" (#revealed)"),
        "{outline}"
    );
    assert!(
        outline.contains("input[password] label=\"Code\" (#pin)"),
        "{outline}"
    );

    let script = Script::new([
        act(
            "type",
            json!({ "selector": "#password", "text": "typed-by-ai", "clear": true }),
        ),
        act(
            "type",
            json!({ "selector": "#revealed", "text": "typed-by-ai" }),
        ),
        act("type", json!({ "selector": "#pin", "text": "typed-by-ai" })),
        // Focusing this field hands the focus to the password field.
        act(
            "type",
            json!({ "selector": "#trap", "text": "typed-by-ai" }),
        ),
        act("pressKey", json!({ "key": "x" })),
        act("readText", json!({ "selector": "#password" })),
        act("readText", json!({})),
        act(
            "runJS",
            json!({ "code": "document.getElementById('password').value" }),
        ),
        act("runJS", json!({ "code": "document.title" })),
        // An ordinary field still works.
        act(
            "type",
            json!({ "selector": "#username", "text": "teacher" }),
        ),
    ]);
    let mut teacher = Teacher::who(Decision::Allow);
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(
        matches!(outcome.end, AgentEnd::Done { .. }),
        "{:?}",
        outcome.end
    );

    let refused = "Refusing to type into a password field. Passwords are for the teacher to enter.";
    assert_eq!(error_of(&outcome, 0), refused);
    assert_eq!(error_of(&outcome, 1), refused);
    assert_eq!(error_of(&outcome, 2), refused);
    assert_eq!(
        error_of(&outcome, 3),
        "Refusing to type: a password field has the keyboard focus."
    );
    assert!(
        error_of(&outcome, 4)
            .starts_with("Refusing to press keys while a password field has the focus.")
    );
    assert_eq!(error_of(&outcome, 5), "Refusing to read a password field.");

    let all = results(&outcome);
    let shown: String = all
        .iter()
        .flatten()
        .map(ActionResult::to_json)
        .collect::<Vec<_>>()
        .join("\n");
    assert!(!shown.contains("s3cret-Fixture"), "{shown}");
    assert!(all[7].as_ref().unwrap().to_json().contains("withheld"));
    assert_eq!(
        all[8].as_ref().unwrap().data,
        Some(json!("Sign in - agent fixture"))
    );

    // Only the two runJS calls were put to the teacher: a refusal is not a question.
    let asked: Vec<&str> = teacher.asked.iter().map(|p| p.action.name()).collect();
    assert_eq!(asked, ["runJS", "runJS"]);

    let page = js(
        &s.page,
        "({ password: document.getElementById('password').value,
            revealed: document.getElementById('revealed').value,
            pin: document.getElementById('pin').value,
            trap: document.getElementById('trap').value,
            username: document.getElementById('username').value,
            submitted: window.__submitted || 0 })",
    )
    .await;
    assert_eq!(page["password"], "s3cret-Fixture");
    assert_eq!(page["revealed"], "s3cret-Fixture");
    assert_eq!(page["pin"], "4821");
    assert_eq!(page["trap"], "");
    assert_eq!(page["username"], "teacher");
    assert_eq!(page["submitted"], 0);

    // The whole conversation, as sent to the AI, is free of it too.
    for request in script.requests() {
        for message in &request.messages {
            assert!(!message.text.contains("s3cret-Fixture"));
        }
    }

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn a_click_is_judged_by_what_it_would_really_land_on() {
    let s = open("covered", LOGIN).await;

    // "Docs" is a harmless link, but a delete button lies on top of it.
    let script = Script::new([act("click", json!({ "selector": "#covered" }))]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert_eq!(teacher.asked.len(), 1);
    assert_eq!(
        teacher.asked[0].description,
        "Click the link \"Docs\". It is covered by the button \"Delete account\", which would receive the click"
    );
    assert_eq!(js(&s.page, "window.__deleted === true").await, false);

    // A frame's contents cannot be seen from the page, so a click into one asks.
    let script = Script::new([act("click", json!({ "selector": "#embedded" }))]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    assert!(
        matches!(
            teacher.asked[0].forced_by[..],
            [ApprovalReason::Unseen { .. }]
        ),
        "{:?}",
        teacher.asked[0].forced_by
    );
    assert_eq!(js(&s.page, "window.__frameDeleted === true").await, false);
    // Allowed, the same click really does reach the button inside.
    let script = Script::new([act("click", json!({ "selector": "#embedded" }))]);
    run(
        &s.page,
        &script,
        &mut Teacher::who(Decision::Allow),
        AgentMode::Auto,
    )
    .await;
    assert_eq!(js(&s.page, "window.__frameDeleted === true").await, true);

    // Signing in is a form submission: by click or by Enter, it asks.
    let script = Script::new([
        act("click", json!({ "selector": "#signin" })),
        act("click", json!({ "selector": "#username" })),
        act("pressKey", json!({ "key": "Enter" })),
    ]);
    let mut teacher = Teacher::denies();
    run(&s.page, &script, &mut teacher, AgentMode::Auto).await;
    let asked: Vec<&str> = teacher.asked.iter().map(|p| p.action.name()).collect();
    assert_eq!(asked, ["click", "pressKey"]);
    assert_eq!(js(&s.page, "window.__submitted || 0").await, 0);

    close(s).await;
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs Chrome installed"]
async fn key_presses_reach_the_focused_element_as_real_keys() {
    let s = open("keys", GRADING).await;
    js(
        &s.page,
        "window.__keys = [];
         document.addEventListener('keydown', (e) => window.__keys.push([e.key, e.isTrusted]));
         0",
    )
    .await;
    let state = capture(&s.page).await;
    let checklist = state
        .elements
        .iter()
        .find(|el| el.info.tag == "summary")
        .expect("a summary");
    assert_eq!(checklist.info.kind.as_deref(), Some("collapsed"));
    assert_eq!(checklist.info.text, "Grading checklist");

    let open_now = "document.querySelector('details').open";
    let script = Script::new([
        act("click", json!({ "selector": checklist.ref_id })),
        act("runJS", json!({ "code": open_now })),
        act("pressKey", json!({ "key": "Space" })),
        act("runJS", json!({ "code": open_now })),
        act("pressKey", json!({ "key": "Enter" })),
        act("runJS", json!({ "code": open_now })),
        act("pressKey", json!({ "key": "NoSuchKey" })),
    ]);
    let mut teacher = Teacher::who(Decision::Allow);
    let outcome = run(&s.page, &script, &mut teacher, AgentMode::Auto).await;

    let all = results(&outcome);
    let open_after = |n: usize| all[n].as_ref().unwrap().data.clone();
    assert_eq!(open_after(1), Some(json!(true)), "the click opened it");
    assert_eq!(open_after(3), Some(json!(false)), "Space closed it");
    assert_eq!(open_after(5), Some(json!(true)), "Enter opened it again");
    assert!(
        !all[6].as_ref().unwrap().success,
        "an unknown key is an error, not a guess"
    );
    assert_eq!(
        js(&s.page, "window.__keys").await,
        json!([[" ", true], ["Enter", true]])
    );
    // Only runJS was asked about: a summary is not a control that commits anything.
    assert!(teacher.asked.iter().all(|p| p.action.name() == "runJS"));

    close(s).await;
}
