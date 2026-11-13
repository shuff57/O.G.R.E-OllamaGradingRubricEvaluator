//! Pointing at an element of the page to get a selector for it, for a
//! teacher putting a mapping right by hand.

use serde::Deserialize;
use serde_json::json;

use crate::driver::eval_as;
use crate::{PageDriver, Result};

const PICK_JS: &str = include_str!("pick.js");

/// How long the page waits for a click before giving up. Shorter than the
/// longest a script may run.
pub const PICK_SECONDS: u32 = 90;

/// What the teacher is pointing at, which decides the kind of selector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickFor {
    /// The block that repeats once per student. The selector matches every
    /// such block on the page.
    StudentSection,
    /// Something inside a student's block, found by this selector, or
    /// anywhere on a page that shows one student (`None`). The selector is
    /// one to look up inside each block.
    InsideSection(Option<String>),
    /// One element of the whole page, such as its save button.
    WholePage,
}

#[derive(Deserialize)]
struct Picked {
    selector: Option<String>,
}

/// Waits for the teacher to click an element of `page` and gives a selector
/// for it. `None` when they press Escape instead, when [`PICK_SECONDS`] pass,
/// or when what they clicked cannot be used: for
/// [`PickFor::StudentSection`], something no repeating block is around, and
/// for [`PickFor::InsideSection`], something outside every student's block.
///
/// The click is not passed on to the page, and nothing on it is changed.
/// The selector is a proposal: [`super::validate_profile`] says whether it
/// holds for every student.
pub async fn pick_element(page: &dyn PageDriver, what: &PickFor) -> Result<Option<String>> {
    let (mode, section) = match what {
        PickFor::StudentSection => ("section", None),
        PickFor::InsideSection(section) => ("inside", section.as_deref()),
        PickFor::WholePage => ("page", None),
    };
    let args = json!({ "mode": mode, "section": section, "seconds": PICK_SECONDS });
    let picked: Picked = eval_as(page, &format!("({PICK_JS})({args})")).await?;
    Ok(picked.selector.filter(|selector| !selector.is_empty()))
}
