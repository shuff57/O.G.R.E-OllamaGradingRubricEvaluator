//! Stand-ins for the browser, the AI and the teacher, for testing the loop
//! without any of them.

use std::collections::VecDeque;
use std::sync::Mutex;

use async_trait::async_trait;
use serde_json::{Value, json};

use ogre_harness::{Error, InputDriver, PageDriver, Result};
use ogre_llm::{ChatProvider, ChatRequest, LlmError};

use crate::agent::{Approver, Decision, ProposedAction};
use crate::page::ElementInfo;
use crate::script::parse_call;

/// One element of a [`FakePage`].
#[derive(Debug, Clone)]
pub(crate) struct FakeElement {
    pub(crate) ref_id: String,
    pub(crate) selector: String,
    pub(crate) info: ElementInfo,
    pub(crate) control: Option<ElementInfo>,
    pub(crate) cover: Option<ElementInfo>,
    pub(crate) protected: bool,
    pub(crate) has_box: bool,
    /// Where a click on the element takes the page.
    pub(crate) goes_to: Option<String>,
}

impl FakeElement {
    pub(crate) fn new(ref_id: &str, tag: &str, selector: &str) -> Self {
        Self {
            ref_id: ref_id.to_owned(),
            selector: selector.to_owned(),
            info: ElementInfo {
                tag: tag.to_owned(),
                empty: Some(true),
                ..ElementInfo::default()
            },
            control: None,
            cover: None,
            protected: false,
            has_box: true,
            goes_to: None,
        }
    }

    pub(crate) fn text(mut self, text: &str) -> Self {
        self.info.text = text.to_owned();
        self
    }

    pub(crate) fn kind(mut self, kind: &str) -> Self {
        self.info.kind = Some(kind.to_owned());
        self.info.password = kind == "password";
        self
    }

    pub(crate) fn id(mut self, id: &str) -> Self {
        self.info.id = Some(id.to_owned());
        self
    }

    pub(crate) fn label(mut self, label: &str) -> Self {
        self.info.label = Some(label.to_owned());
        self
    }

    pub(crate) fn value(mut self, value: &str) -> Self {
        self.info.value = Some(value.to_owned());
        self.info.empty = Some(value.is_empty());
        self
    }

    pub(crate) fn href(mut self, href: &str) -> Self {
        self.info.href = Some(href.to_owned());
        self
    }

    pub(crate) fn in_form(mut self) -> Self {
        self.info.in_form = true;
        self
    }

    pub(crate) fn goes_to(mut self, url: &str) -> Self {
        self.goes_to = Some(url.to_owned());
        self
    }

    pub(crate) fn with(mut self, change: impl FnOnce(&mut Self)) -> Self {
        change(&mut self);
        self
    }
}

/// Something done to a [`FakePage`] that a person watching would notice.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Call {
    /// A real mouse click, with the ref of the element at that point.
    Click(String),
    /// A click made by script.
    ScriptClick(String),
    InsertText(String),
    PressKey(String),
    Navigate(String),
    RunJs(String),
    WriteCodeMirror(String, String),
}

#[derive(Debug)]
struct Inner {
    url: String,
    elements: Vec<FakeElement>,
    focused: Option<String>,
    all_selected: Option<String>,
    calls: Vec<Call>,
    screenshots_taken: usize,
    screenshots_work: bool,
    js_result: Value,
    page_text: String,
    password: Option<String>,
}

impl Inner {
    fn find(&self, ref_id: &str) -> Option<&FakeElement> {
        self.elements.iter().find(|el| el.ref_id == ref_id)
    }

    fn position(&self, ref_id: &str) -> Option<(f64, f64)> {
        let index = self.elements.iter().position(|el| el.ref_id == ref_id)?;
        Some((100.0, 20.0 * (index as f64 + 1.0)))
    }

    fn at(&self, y: f64) -> Option<&FakeElement> {
        self.elements
            .get(((y / 20.0).round() as usize).checked_sub(1)?)
    }

    fn focused_is_password(&self) -> bool {
        self.focused
            .as_deref()
            .and_then(|ref_id| self.find(ref_id))
            .is_some_and(|el| el.info.password)
    }
}

/// A page made of a list of elements, which records what is done to it.
#[derive(Debug)]
pub(crate) struct FakePage(Mutex<Inner>);

impl FakePage {
    pub(crate) fn new(url: &str, elements: impl IntoIterator<Item = FakeElement>) -> Self {
        Self(Mutex::new(Inner {
            url: url.to_owned(),
            elements: elements.into_iter().collect(),
            focused: None,
            all_selected: None,
            calls: Vec::new(),
            screenshots_taken: 0,
            screenshots_work: true,
            js_result: Value::Null,
            page_text: String::new(),
            password: None,
        }))
    }

    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.0
            .lock()
            .expect("no test panics while holding the page")
    }

    pub(crate) fn calls(&self) -> Vec<Call> {
        self.inner().calls.clone()
    }

    pub(crate) fn screenshots_taken(&self) -> usize {
        self.inner().screenshots_taken
    }

    pub(crate) fn value_of(&self, ref_id: &str) -> Option<String> {
        self.inner().find(ref_id)?.info.value.clone()
    }

    pub(crate) fn current_url(&self) -> String {
        self.inner().url.clone()
    }

    pub(crate) fn focus(&self, ref_id: &str) {
        self.inner().focused = Some(ref_id.to_owned());
    }

    /// Swaps an element for another one, as a page that redraws itself would.
    pub(crate) fn replace(&self, ref_id: &str, replacement: FakeElement) {
        let mut inner = self.inner();
        if let Some(slot) = inner.elements.iter_mut().find(|el| el.ref_id == ref_id) {
            *slot = replacement;
        }
    }

    pub(crate) fn without_screenshots(self) -> Self {
        self.inner().screenshots_work = false;
        self
    }

    pub(crate) fn with_js_result(self, result: Value) -> Self {
        self.inner().js_result = result;
        self
    }

    pub(crate) fn with_text(self, text: &str) -> Self {
        self.inner().page_text = text.to_owned();
        self
    }

    /// What is typed in the page's password field, which nothing may reveal.
    pub(crate) fn with_password(self, password: &str) -> Self {
        self.inner().password = Some(password.to_owned());
        self
    }

    fn resolve(inner: &Inner, args: &Value) -> Value {
        let missing = |error: &str| json!({ "found": false, "error": error });
        let found = if args["focused"] == true {
            match inner
                .focused
                .as_deref()
                .and_then(|ref_id| inner.find(ref_id))
            {
                Some(el) => el,
                None => return missing("nofocus"),
            }
        } else if let Some(ref_id) = args["ref"].as_str() {
            match inner.find(ref_id) {
                Some(el) => el,
                None => return missing("stale"),
            }
        } else {
            let selector = args["selector"].as_str().unwrap_or_default();
            if selector.contains(":has-text") {
                return json!({ "found": false, "error": "invalid", "message": "SyntaxError" });
            }
            match inner.elements.iter().find(|el| el.selector == selector) {
                Some(el) => el,
                None => return missing("missing"),
            }
        };
        let (x, y) = inner.position(&found.ref_id).unwrap_or_default();
        let protected = args["protectedSelectors"].as_array().is_some_and(|list| {
            list.iter()
                .any(|s| s.as_str() == Some(found.selector.as_str()))
        });
        json!({
            "found": true,
            "ref": found.ref_id,
            "selector": found.selector,
            "element": found.info,
            "control": found.control,
            "hit": found.cover,
            "x": x,
            "y": y,
            "hasBox": found.has_box,
            "inViewport": found.has_box,
            "isProtected": found.protected || protected,
            "nextRef": 1000,
        })
    }

    fn element_op(inner: &mut Inner, args: &Value) -> Value {
        let ref_id = args["ref"].as_str().unwrap_or_default().to_owned();
        let Some(element) = inner.find(&ref_id).cloned() else {
            return json!({ "ok": false, "error": "Element is no longer on the page" });
        };
        match args["op"].as_str().unwrap_or_default() {
            "click" => {
                inner.calls.push(Call::ScriptClick(ref_id));
                json!({ "ok": true })
            }
            "focus" => {
                inner.focused = Some(ref_id);
                json!({ "ok": true, "password": element.info.password })
            }
            "focused" => json!({
                "ok": inner.focused.as_deref() == Some(ref_id.as_str()),
                "password": inner.focused_is_password(),
            }),
            "selectAll" => {
                inner.all_selected = Some(ref_id);
                json!({ "ok": true })
            }
            "caretToEnd" => json!({ "ok": true }),
            "value" if element.info.password => json!({ "ok": true }),
            "value" => json!({ "ok": true, "value": element.info.value }),
            other => json!({ "ok": false, "error": format!("Unknown operation: {other}") }),
        }
    }

    fn page_op(inner: &mut Inner, args: &Value) -> Value {
        let by_ref = |inner: &Inner| args["ref"].as_str().and_then(|r| inner.find(r)).cloned();
        match args["op"].as_str().unwrap_or_default() {
            "scroll" => json!({ "scrollX": args["x"], "scrollY": args["y"] }),
            "scrollToText" => {
                let needle = args["text"].as_str().unwrap_or_default().to_lowercase();
                match inner
                    .elements
                    .iter()
                    .find(|el| el.info.text.to_lowercase().contains(&needle))
                {
                    Some(el) => json!({ "found": true, "matched": el.info.text }),
                    None => json!({ "found": false }),
                }
            }
            "readPage" => json!({ "text": inner.page_text }),
            "readElement" => match by_ref(inner) {
                Some(el) if el.info.password => json!({ "found": true, "password": true }),
                Some(el) => {
                    json!({ "found": true, "text": el.info.value.unwrap_or(el.info.text) })
                }
                None => json!({ "found": false }),
            },
            "exists" => {
                let selector = args["selector"].as_str().unwrap_or_default();
                json!({ "exists": inner.elements.iter().any(|el| el.selector == selector) })
            }
            "leaksPassword" => {
                let result = args["result"].as_str().unwrap_or_default();
                let leaks = inner
                    .password
                    .as_deref()
                    .is_some_and(|password| result.contains(password));
                json!({ "leaks": leaks })
            }
            "writeCodeMirror" => match by_ref(inner) {
                Some(el) => {
                    let value = args["value"].as_str().unwrap_or_default().to_owned();
                    let lines = value.lines().count();
                    inner.calls.push(Call::WriteCodeMirror(el.ref_id, value));
                    json!({ "success": true, "data": { "lines": lines } })
                }
                None => json!({ "success": false, "error": "Element not found" }),
            },
            other => json!({ "error": format!("Unknown operation: {other}") }),
        }
    }
}

#[async_trait]
impl PageDriver for FakePage {
    async fn url(&self) -> Result<String> {
        Ok(self.inner().url.clone())
    }

    async fn navigate(&self, url: &str) -> Result<()> {
        let mut inner = self.inner();
        inner.calls.push(Call::Navigate(url.to_owned()));
        inner.url = url.to_owned();
        Ok(())
    }

    async fn eval(&self, expression: &str) -> Result<Value> {
        let mut inner = self.inner();
        let Some((name, args)) = parse_call(expression) else {
            // Not one of the agent's own scripts: this is `runJS`.
            inner.calls.push(Call::RunJs(expression.to_owned()));
            return Ok(inner.js_result.clone());
        };
        Ok(match name.as_str() {
            "capture" => json!({
                "url": inner.url,
                "title": "Fake page",
                "total": inner.elements.len(),
                "nextRef": 1000,
                "elements": inner.elements.iter().map(|el| {
                    let mut listed = serde_json::to_value(&el.info).unwrap_or_default();
                    listed["ref"] = json!(el.ref_id);
                    listed["selector"] = json!(el.selector);
                    listed["inViewport"] = json!(true);
                    listed
                }).collect::<Vec<_>>(),
            }),
            "resolve" => Self::resolve(&inner, &args),
            "element-op" => Self::element_op(&mut inner, &args),
            "page-op" => Self::page_op(&mut inner, &args),
            other => return Err(Error::Script(format!("unknown script {other}"))),
        })
    }
}

#[async_trait]
impl InputDriver for FakePage {
    async fn click_at(&self, _x: f64, y: f64) -> Result<()> {
        let mut inner = self.inner();
        let Some(element) = inner.at(y).cloned() else {
            return Err(Error::Browser(format!("nothing to click at y={y}")));
        };
        inner.calls.push(Call::Click(element.ref_id.clone()));
        inner.all_selected = None;
        // A covered element does not get the click, so it does not get the focus.
        if element.cover.is_none() {
            inner.focused = Some(element.ref_id);
        }
        if let Some(url) = element.goes_to {
            inner.url = url;
        }
        Ok(())
    }

    async fn insert_text(&self, text: &str) -> Result<()> {
        let mut inner = self.inner();
        inner.calls.push(Call::InsertText(text.to_owned()));
        let replace = inner.all_selected.take() == inner.focused;
        let Some(ref_id) = inner.focused.clone() else {
            return Ok(());
        };
        if let Some(element) = inner.elements.iter_mut().find(|el| el.ref_id == ref_id) {
            let before = element.info.value.take().unwrap_or_default();
            let after = if replace {
                text.to_owned()
            } else {
                before + text
            };
            element.info.empty = Some(after.is_empty());
            element.info.value = Some(after);
        }
        Ok(())
    }

    async fn press_key(&self, key: &str) -> Result<()> {
        let mut inner = self.inner();
        inner.calls.push(Call::PressKey(key.to_owned()));
        if key == "Backspace"
            && inner.all_selected.is_some()
            && inner.all_selected == inner.focused
            && let Some(ref_id) = inner.all_selected.take()
            && let Some(element) = inner.elements.iter_mut().find(|el| el.ref_id == ref_id)
        {
            element.info.value = Some(String::new());
            element.info.empty = Some(true);
        }
        Ok(())
    }

    async fn screenshot_png(&self) -> Result<Vec<u8>> {
        let mut inner = self.inner();
        if !inner.screenshots_work {
            return Err(Error::Browser("no screenshot".to_owned()));
        }
        inner.screenshots_taken += 1;
        Ok(b"png".to_vec())
    }
}

/// An AI that says what it was told to say, and remembers what it was asked.
pub(crate) struct ScriptedProvider {
    replies: Mutex<VecDeque<String>>,
    /// Said for ever once the script runs out.
    then: Option<String>,
    requests: Mutex<Vec<ChatRequest>>,
    hang: bool,
}

impl ScriptedProvider {
    pub(crate) fn new<'a>(replies: impl IntoIterator<Item = &'a str>) -> Self {
        Self {
            replies: Mutex::new(replies.into_iter().map(str::to_owned).collect()),
            then: None,
            requests: Mutex::new(Vec::new()),
            hang: false,
        }
    }

    pub(crate) fn then_always(mut self, reply: &str) -> Self {
        self.then = Some(reply.to_owned());
        self
    }

    /// Never answers.
    pub(crate) fn hanging() -> Self {
        Self {
            hang: true,
            ..Self::new([])
        }
    }

    pub(crate) fn requests(&self) -> Vec<ChatRequest> {
        self.requests.lock().expect("lock").clone()
    }

    /// The text of the last message of the `n`th request, counting from 0.
    pub(crate) fn asked(&self, n: usize) -> String {
        let requests = self.requests();
        let request = requests
            .get(n)
            .unwrap_or_else(|| panic!("only {} requests", requests.len()));
        request
            .messages
            .last()
            .map(|m| m.text.clone())
            .unwrap_or_default()
    }
}

#[async_trait]
impl ChatProvider for ScriptedProvider {
    async fn chat(&self, request: &ChatRequest) -> ogre_llm::Result<String> {
        self.requests.lock().expect("lock").push(request.clone());
        if self.hang {
            std::future::pending::<()>().await;
        }
        let next = self.replies.lock().expect("lock").pop_front();
        next.or_else(|| self.then.clone()).ok_or_else(|| {
            LlmError::InvalidResponse("the scripted AI ran out of replies".to_owned())
        })
    }
}

type OnAsked = Box<dyn FnMut(&ProposedAction) + Send>;

/// A teacher who answers from a list, then with a standing answer.
pub(crate) struct ScriptedApprover {
    answers: VecDeque<Decision>,
    then: Option<Decision>,
    pub(crate) asked: Vec<ProposedAction>,
    on_asked: Option<OnAsked>,
}

impl ScriptedApprover {
    pub(crate) fn answering(answers: impl IntoIterator<Item = Decision>) -> Self {
        Self {
            answers: answers.into_iter().collect(),
            then: None,
            asked: Vec::new(),
            on_asked: None,
        }
    }

    pub(crate) fn always(answer: Decision) -> Self {
        Self {
            then: Some(answer),
            ..Self::answering([])
        }
    }

    /// Never answers.
    pub(crate) fn silent() -> Self {
        Self::answering([])
    }

    /// Runs `hook` each time the teacher is asked, before they answer.
    pub(crate) fn on_asked(mut self, hook: impl FnMut(&ProposedAction) + Send + 'static) -> Self {
        self.on_asked = Some(Box::new(hook));
        self
    }
}

#[async_trait]
impl Approver for ScriptedApprover {
    async fn review(&mut self, proposal: &ProposedAction) -> Decision {
        self.asked.push(proposal.clone());
        if let Some(hook) = &mut self.on_asked {
            hook(proposal);
        }
        match self.answers.pop_front().or_else(|| self.then.clone()) {
            Some(answer) => answer,
            None => std::future::pending().await,
        }
    }
}

pub(crate) fn deny() -> Decision {
    Decision::Deny { note: None }
}
