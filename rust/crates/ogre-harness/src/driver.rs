use async_trait::async_trait;
use serde::de::DeserializeOwned;

use crate::Result;

/// One open web page that OGRE can read and act on.
#[async_trait]
pub trait PageDriver: Send + Sync {
    /// The page's current address.
    async fn url(&self) -> Result<String>;

    /// Loads `url` and waits for the page to finish loading.
    async fn navigate(&self, url: &str) -> Result<()>;

    /// Evaluates a JavaScript expression in the page and returns its value as
    /// JSON. A promise is awaited first. Fails with [`crate::Error::Script`]
    /// if the expression throws.
    async fn eval(&self, expression: &str) -> Result<serde_json::Value>;
}

/// A page that can also be operated the way a person would: real mouse and
/// keyboard input, and a picture of what is on screen. Sites treat this input
/// as genuine, unlike events made up by a script.
#[async_trait]
pub trait InputDriver: PageDriver {
    /// Clicks at a point given in CSS pixels from the top left of the viewport.
    async fn click_at(&self, x: f64, y: f64) -> Result<()>;

    /// Types `text` into whatever has the keyboard focus.
    async fn insert_text(&self, text: &str) -> Result<()>;

    /// Presses and releases one key, named as in the DOM `KeyboardEvent.key`
    /// values: `"Enter"`, `"Tab"`, `"ArrowDown"`, `"a"`.
    async fn press_key(&self, key: &str) -> Result<()>;

    /// A PNG of the visible part of the page.
    async fn screenshot_png(&self) -> Result<Vec<u8>>;
}

/// Evaluates `expression` and decodes the result.
pub(crate) async fn eval_as<T: DeserializeOwned>(
    page: &dyn PageDriver,
    expression: &str,
) -> Result<T> {
    Ok(serde_json::from_value(page.eval(expression).await?)?)
}
