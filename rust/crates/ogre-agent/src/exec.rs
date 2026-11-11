//! Carries out one action on the page.
//!
//! Clicks, typing and key presses are real mouse and keyboard input, sent to
//! where the element is at that moment. Scripts find, scroll, read and
//! select, and act on the page only where the desktop app's did:
//!
//! * clicking an element that has no size on screen, which no mouse can reach;
//! * giving a field the focus when the real click did not (the desktop app
//!   always focused by script);
//! * selecting a field's contents, for `clear` and `triple_click`;
//! * writing into a CodeMirror editor.
//!
//! Unlike the desktop app, nothing is ever written with `innerHTML` or by
//! setting `value`: text reaches the page as typed text or not at all.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::time::{Instant, sleep, timeout};

use ogre_harness::Result as PageResult;

use crate::action::{Action, ActionResult, DANGEROUS_JS_PATTERNS, ScrollDirection};
use crate::page::{Missing, Named, PageSession, Target};
use crate::safety::{
    ApprovalReason, SiteScope, describe_action, forced_approval, navigation_target, normalize_key,
    refusal,
};
use crate::script::Script;

const READ_LIMIT_CHARS: usize = 5_000;
const WAIT_DEFAULT: Duration = Duration::from_millis(5_000);
const WAIT_MAX: Duration = Duration::from_millis(10_000);
const WAIT_POLL: Duration = Duration::from_millis(200);
const NAVIGATE_TIMEOUT: Duration = Duration::from_millis(10_000);
const SLEEP_MAX_MS: u64 = 30_000;

/// An action checked against the live page, before anyone is asked about it.
#[derive(Debug, Clone)]
pub(crate) struct Prepared {
    /// The element the action names, or for a key press the element with the
    /// keyboard focus.
    pub(crate) target: Option<Target>,
    /// Why the action needs approval even in auto mode.
    pub(crate) reasons: Vec<ApprovalReason>,
    pub(crate) description: String,
    /// Set when the action cannot go ahead at all: its element is missing, or
    /// it is refused. There is then nothing to approve.
    pub(crate) rejected: Option<ActionResult>,
}

impl Prepared {
    fn rejected(action: &Action, target: Option<Target>, error: impl Into<String>) -> Self {
        Self {
            description: describe_action(action, target.as_ref()),
            target,
            reasons: Vec::new(),
            rejected: Some(ActionResult::failed(error)),
        }
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ElementOp {
    ok: bool,
    error: Option<String>,
    password: bool,
    value: Option<String>,
}

impl PageSession<'_> {
    /// Finds what the action would touch and works out whether it may run.
    pub(crate) async fn prepare(&mut self, action: &Action, scope: &SiteScope) -> Prepared {
        let page_url = self.page.url().await.unwrap_or_default();

        let located = match action {
            Action::Click { selector }
            | Action::TripleClick { selector }
            | Action::Type { selector, .. }
            | Action::WriteCodeMirror { selector, .. } => {
                self.locate(selector, true).await.map(Some)
            }
            Action::ReadText {
                selector: Some(selector),
            } => self.locate(selector, false).await.map(Some),
            Action::PressKey { .. } => self.focused().await,
            _ => Ok(None),
        };
        let target = match located {
            Ok(target) => target,
            Err(missing) => return Prepared::rejected(action, None, missing.message()),
        };

        if let Some(why) = refusal(action, target.as_ref()) {
            return Prepared::rejected(action, target, why);
        }
        if let Action::Navigate { url } = action
            && let Err(why) = navigation_target(url, &page_url)
        {
            return Prepared::rejected(action, target, why);
        }

        Prepared {
            reasons: forced_approval(action, target.as_ref(), scope, &page_url),
            description: describe_action(action, target.as_ref()),
            target,
            rejected: None,
        }
    }

    /// Carries the action out. `approved` is what [`PageSession::prepare`]
    /// found when the action was put to the teacher or let through; the page
    /// is checked again first, and if the action would now touch something
    /// else, or need an approval it did not get, nothing is done.
    pub(crate) async fn execute(
        &mut self,
        action: &Action,
        approved: &Prepared,
        scope: &SiteScope,
    ) -> ActionResult {
        let now = self.prepare(action, scope).await;
        if let Some(rejected) = now.rejected {
            return rejected;
        }
        let same_element = match (&approved.target, &now.target) {
            (Some(before), Some(after)) => before.ref_id == after.ref_id,
            (None, None) => true,
            _ => false,
        };
        let unapproved = now
            .reasons
            .iter()
            .find(|reason| !approved.reasons.iter().any(|ok| ok.same_kind(reason)));
        if !same_element || unapproved.is_some() {
            let why = match unapproved {
                Some(reason) => format!(" It would now need approval because {reason}."),
                None => String::new(),
            };
            return ActionResult::failed(format!(
                "The page changed before the action could run, so nothing was done.{why} Look at the page again and decide afresh."
            ));
        }

        let guessed = now
            .target
            .as_ref()
            .and_then(|target| target.guessed.clone());
        let mut result = match self.dispatch(action, now.target.as_ref()).await {
            Ok(result) => result,
            Err(e) => ActionResult::failed(e.to_string()),
        };
        if result.success && result.warning.is_none() {
            result.warning = guessed;
        }
        result
    }

    async fn dispatch(
        &mut self,
        action: &Action,
        target: Option<&Target>,
    ) -> PageResult<ActionResult> {
        // `prepare` resolved a target for every action that needs one.
        let need =
            || target.ok_or_else(|| ogre_harness::Error::Page("Element not found".to_owned()));
        match action {
            Action::Click { .. } => self.click(need()?).await,
            Action::TripleClick { .. } => {
                let target = need()?;
                let clicked = self.click(target).await?;
                if !clicked.success {
                    return Ok(clicked);
                }
                self.element_op(target, "selectAll").await?;
                Ok(ActionResult::ok_with(json!({ "selected": true })))
            }
            Action::Type { text, clear, .. } => self.type_text(need()?, text, *clear).await,
            Action::Scroll { direction, amount } => {
                let (x, y) = match direction {
                    ScrollDirection::Up => (0.0, -amount),
                    ScrollDirection::Down => (0.0, *amount),
                    ScrollDirection::Left => (-amount, 0.0),
                    ScrollDirection::Right => (*amount, 0.0),
                };
                let position = self
                    .page_op(json!({ "op": "scroll", "x": x, "y": y }))
                    .await?;
                Ok(ActionResult::ok_with(position))
            }
            Action::ScrollIntoView { text } => {
                let found = self
                    .page_op(json!({ "op": "scrollToText", "text": text }))
                    .await?;
                Ok(match found["matched"].as_str() {
                    Some(matched) => {
                        ActionResult::ok_with(json!({ "matched": matched })).with_page_content()
                    }
                    None => ActionResult::failed(format!("No element found with text: {text}")),
                })
            }
            Action::ReadText { selector: None } => {
                let page = self
                    .page_op(json!({ "op": "readPage", "max": READ_LIMIT_CHARS }))
                    .await?;
                Ok(ActionResult::ok_with(page["text"].clone()).with_page_content())
            }
            Action::ReadText { selector: Some(_) } => {
                let target = need()?;
                let read = self
                    .page_op(json!({ "op": "readElement", "ref": target.ref_id, "max": READ_LIMIT_CHARS }))
                    .await?;
                Ok(if read["password"] == true {
                    ActionResult::failed("Refusing to read a password field.")
                } else if read["found"] == true {
                    ActionResult::ok_with(read["text"].clone()).with_page_content()
                } else {
                    ActionResult::failed("Element not found: it left the page")
                })
            }
            Action::Screenshot => {
                let png = self.page.screenshot_png().await?;
                Ok(ActionResult::ok_with(
                    json!({ "captured": true, "bytes": png.len() }),
                ))
            }
            Action::WaitFor {
                selector,
                timeout_ms,
            } => self.wait_for(selector, *timeout_ms).await,
            Action::Navigate { url } => {
                let page_url = self.page.url().await.unwrap_or_default();
                let url = match navigation_target(url, &page_url) {
                    Ok(url) => url,
                    Err(why) => return Ok(ActionResult::failed(why)),
                };
                Ok(
                    match timeout(NAVIGATE_TIMEOUT, self.page.navigate(url.as_str())).await {
                        Ok(loaded) => {
                            loaded?;
                            ActionResult::ok()
                        }
                        Err(_) => ActionResult {
                            success: true,
                            warning: Some(format!(
                                "Page load timed out after {}ms",
                                NAVIGATE_TIMEOUT.as_millis()
                            )),
                            ..ActionResult::default()
                        },
                    },
                )
            }
            Action::RunJs { code } => self.run_js(code).await,
            Action::Sleep { ms } => {
                let capped = (*ms).min(SLEEP_MAX_MS);
                sleep(Duration::from_millis(capped)).await;
                Ok(ActionResult::ok_with(json!({ "sleptMs": capped })))
            }
            Action::PressKey { key } => {
                self.page.press_key(&normalize_key(key)).await?;
                Ok(ActionResult::ok())
            }
            Action::WriteCodeMirror { selector, value } => {
                let target = need()?;
                let written = self
                    .page_op(json!({
                        "op": "writeCodeMirror",
                        "ref": target.ref_id,
                        "selector": selector,
                        "value": value,
                    }))
                    .await?;
                Ok(ActionResult {
                    success: written["success"] == true,
                    error: written["error"].as_str().map(str::to_owned),
                    data: written.get("data").filter(|data| !data.is_null()).cloned(),
                    ..ActionResult::default()
                })
            }
            Action::Done { success, message } => Ok(ActionResult {
                success: *success,
                data: Some(json!({ "message": message })),
                ..ActionResult::default()
            }),
        }
    }

    async fn click(&mut self, target: &Target) -> PageResult<ActionResult> {
        if !target.has_box {
            // No mouse can reach an element with no size; the desktop app
            // fell back to a scripted click here too.
            let clicked = self.element_op(target, "click").await?;
            return Ok(match clicked.error {
                None if clicked.ok => ActionResult::ok_with(json!({
                    "fallback": "clicked by script, because the element has no size on screen"
                })),
                error => ActionResult::failed(error.unwrap_or_else(|| "Click failed".to_owned())),
            });
        }
        if !target.in_viewport {
            return Ok(ActionResult::failed(format!(
                "Could not scroll {} into view to click it",
                target.element.describe()
            )));
        }
        self.page.click_at(target.x, target.y).await?;
        Ok(ActionResult::ok())
    }

    async fn type_text(
        &mut self,
        target: &Target,
        text: &str,
        clear: bool,
    ) -> PageResult<ActionResult> {
        if target.element.disabled || target.element.read_only {
            return Ok(ActionResult::failed(format!(
                "Cannot type into {}: it is disabled or read-only.",
                target.element.describe()
            )));
        }
        // A real click gives the field the focus the way a person would, which
        // rich text editors need. A field with no size gets a scripted focus.
        if target.has_box && target.in_viewport {
            self.page.click_at(target.x, target.y).await?;
        }
        if let Some(refused) = self.focus_problem(target, "focus").await? {
            return Ok(refused);
        }

        if clear {
            self.element_op(target, "selectAll").await?;
            if target.element.empty != Some(true) {
                self.page.press_key("Backspace").await?;
            }
        } else {
            self.element_op(target, "caretToEnd").await?;
        }

        if !text.is_empty() {
            // Typed text goes to whatever has the focus, so make sure, at the
            // last moment, that it is still this field and not a password.
            if let Some(refused) = self.focus_problem(target, "focused").await? {
                return Ok(refused);
            }
            self.page.insert_text(text).await?;
        }

        let after = self.element_op(target, "value").await?;
        Ok(match after.value {
            Some(value) => ActionResult::ok_with(json!({ "value": value })).with_page_content(),
            None => ActionResult::ok(),
        })
    }

    /// Checks (`focused`) or first sets (`focus`) the keyboard focus, and
    /// says why typing cannot go ahead if it is not on the target.
    async fn focus_problem(&self, target: &Target, op: &str) -> PageResult<Option<ActionResult>> {
        let focus = self.element_op(target, op).await?;
        Ok(if focus.password {
            Some(ActionResult::failed(
                "Refusing to type: a password field has the keyboard focus.",
            ))
        } else if !focus.ok {
            Some(ActionResult::failed(format!(
                "The keyboard focus is not on {}; nothing was typed",
                target.element.describe()
            )))
        } else {
            None
        })
    }

    async fn wait_for(
        &mut self,
        selector: &str,
        timeout_ms: Option<u64>,
    ) -> PageResult<ActionResult> {
        let limit = timeout_ms
            .map_or(WAIT_DEFAULT, Duration::from_millis)
            .min(WAIT_MAX);
        let started = Instant::now();
        loop {
            let present = match Named::parse(selector) {
                Named::Ref(_) => match self.locate(selector, false).await {
                    Ok(_) => true,
                    Err(Missing::NotFound(_)) => false,
                    Err(Missing::Page(e)) => return Ok(ActionResult::failed(e)),
                },
                Named::Selector(css) => {
                    let found = self
                        .page_op(json!({ "op": "exists", "selector": css }))
                        .await?;
                    if let Some(invalid) = found["invalid"].as_str() {
                        return Ok(ActionResult::failed(format!(
                            "'{css}' is not a valid selector ({invalid})"
                        )));
                    }
                    found["exists"] == true
                }
            };
            if present {
                return Ok(ActionResult::ok());
            }
            if started.elapsed() >= limit {
                return Ok(ActionResult::failed(format!(
                    "Timeout waiting for {selector}"
                )));
            }
            sleep(WAIT_POLL).await;
        }
    }

    async fn run_js(&mut self, code: &str) -> PageResult<ActionResult> {
        if let Some(pattern) = DANGEROUS_JS_PATTERNS
            .iter()
            .find(|pattern| code.contains(**pattern))
        {
            return Ok(ActionResult::failed(format!(
                "Blocked dangerous pattern: {pattern}"
            )));
        }
        let value = self.page.eval(code).await?;
        let shown = match &value {
            Value::String(text) => text.clone(),
            other => other.to_string(),
        };
        let leaks = self
            .page_op(json!({ "op": "leaksPassword", "result": shown }))
            .await
            .map(|checked| checked["leaks"] != false)
            // If the page cannot be asked, assume the worst.
            .unwrap_or(true);
        let data = if leaks {
            json!("[withheld: the result contained what is typed in a password field]")
        } else if shown.chars().count() > READ_LIMIT_CHARS {
            let cut: String = shown.chars().take(READ_LIMIT_CHARS).collect();
            json!(format!("{cut}… (cut off)"))
        } else {
            value
        };
        Ok(ActionResult::ok_with(data).with_page_content())
    }

    async fn element_op(&self, target: &Target, op: &str) -> PageResult<ElementOp> {
        Script::ElementOp
            .run(self.page, &json!({ "ref": target.ref_id, "op": op }))
            .await
    }

    async fn page_op(&self, args: Value) -> PageResult<Value> {
        Script::PageOp.run(self.page, &args).await
    }
}
