//! Shared by the tests that open the saved MyOpenMath page from disk.
#![allow(dead_code)] // each test binary uses a different part

use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use ogre_core::{GradeWrite, GradingPage, Rubric};
use ogre_harness::sites::imathas::IMathAs;
use ogre_harness::sites::{SiteAdapter, Sites, WriteReceipt};
use ogre_harness::{PageDriver, Result as PageResult};

/// MyOpenMath's adapter, also answering for the saved copy of its page that
/// these tests open from disk.
struct SavedMyOpenMath;

#[async_trait]
impl SiteAdapter for SavedMyOpenMath {
    fn name(&self) -> &'static str {
        IMathAs.name()
    }
    fn matches(&self, url: &str) -> bool {
        url.ends_with("/imathas-gradeallq2.html")
    }
    async fn read_page(&self, page: &dyn PageDriver) -> PageResult<GradingPage> {
        IMathAs.read_page(page).await
    }
    async fn read_rubric(&self, page: &dyn PageDriver) -> PageResult<Rubric> {
        IMathAs.read_rubric(page).await
    }
    async fn write_grade(
        &self,
        page: &dyn PageDriver,
        write: &GradeWrite,
    ) -> PageResult<WriteReceipt> {
        IMathAs.write_grade(page, write).await
    }
    fn saves_on_write(&self) -> bool {
        IMathAs.saves_on_write()
    }
    async fn save(&self, page: &dyn PageDriver) -> PageResult<()> {
        IMathAs.save(page).await
    }
}

/// The built-in sites, plus the saved MyOpenMath page.
pub fn saved_page_sites() -> Sites {
    Sites::built_in().with(Arc::new(SavedMyOpenMath))
}

/// The `file://` address of a page under `rust/fixtures`.
pub fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
        .canonicalize()
        .expect("fixture exists");
    format!("file://{}", path.display())
}
