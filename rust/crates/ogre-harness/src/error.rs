pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The browser could not be started, reached, or it dropped the connection.
    #[error("browser: {0}")]
    Browser(String),

    /// A script run in the page threw.
    #[error("page script failed: {0}")]
    Script(String),

    /// A script returned something other than what the caller expects.
    #[error("page returned unexpected data: {0}")]
    Shape(#[from] serde_json::Error),

    /// The page is not what the caller needs, such as a grading page with no students.
    #[error("{0}")]
    Page(String),
}
