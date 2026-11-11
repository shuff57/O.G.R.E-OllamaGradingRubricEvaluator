//! The JavaScript the agent runs in the page.
//!
//! Every script is a fixed function body; what varies travels as a JSON
//! argument. Nothing the AI or the page supplied is ever spliced into code.

use serde::de::DeserializeOwned;
use serde_json::Value;

use ogre_harness::{Error, PageDriver, Result};

const COMMON: &str = include_str!("js/common.js");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Script {
    Capture,
    Resolve,
    ElementOp,
    PageOp,
}

impl Script {
    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::Capture => "capture",
            Self::Resolve => "resolve",
            Self::ElementOp => "element-op",
            Self::PageOp => "page-op",
        }
    }

    const fn body(self) -> &'static str {
        match self {
            Self::Capture => include_str!("js/capture.js"),
            Self::Resolve => include_str!("js/resolve.js"),
            Self::ElementOp => include_str!("js/element_op.js"),
            Self::PageOp => include_str!("js/page_op.js"),
        }
    }

    /// The expression to evaluate. The name and the arguments sit alone on
    /// the first two lines, where [`parse_call`] finds them again.
    pub(crate) fn call(self, args: &Value) -> String {
        format!(
            "/*ogre-agent:{}*/\n(function () {{ var args = {args};\n{COMMON}\n{}\n}})()",
            self.name(),
            self.body()
        )
    }

    pub(crate) async fn run<T: DeserializeOwned>(
        self,
        page: &dyn PageDriver,
        args: &Value,
    ) -> Result<T> {
        let value = page.eval(&self.call(args)).await?;
        serde_json::from_value(value).map_err(Error::Shape)
    }
}

/// Splits an expression built by [`Script::call`] back into the script's name
/// and arguments, so a stand-in page can answer it.
#[cfg(test)]
pub(crate) fn parse_call(expression: &str) -> Option<(String, Value)> {
    let mut lines = expression.lines();
    let name = lines
        .next()?
        .strip_prefix("/*ogre-agent:")?
        .strip_suffix("*/")?;
    let args = lines
        .next()?
        .strip_prefix("(function () { var args = ")?
        .strip_suffix(';')?;
    Some((name.to_owned(), serde_json::from_str(args).ok()?))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_call_carries_its_arguments_as_data_not_code() {
        let hostile = json!({ "selector": "'); window.pwned = true; ('\n*/", "op": "x" });
        let call = Script::PageOp.call(&hostile);
        let (name, args) = parse_call(&call).expect("call parses back");
        assert_eq!(name, "page-op");
        assert_eq!(args, hostile);
        // The argument is one JSON literal on one line.
        assert_eq!(call.lines().nth(1).unwrap().matches('\n').count(), 0);
    }
}
