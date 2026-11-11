use std::fmt;

/// Why a run folder call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunStoreError {
    /// The run id couldn't be a plain file name in the run folder.
    InvalidRunId { run_id: String },
    /// The lines to append are not whole, non-empty lines, each ending in a
    /// line break.
    InvalidLines,
    /// The log's whole lines are not UTF-8 text. `file` is the log's name.
    BrokenLog { file: String },
    /// The run folder ignores case, and `<run_id>.jsonl` opens the log of
    /// another run, whose id differs only in case. Run ids are
    /// case-sensitive, so the run can't be stored in this folder.
    OtherRunsLog { run_id: String },
    /// Reading or writing a file, or taking the lock, failed.
    Io { message: String },
}

impl RunStoreError {
    /// A short, stable name for the error, for the page to pick its words.
    pub fn kind(&self) -> &'static str {
        match self {
            RunStoreError::InvalidRunId { .. } => "invalid_run_id",
            RunStoreError::InvalidLines => "invalid_lines",
            RunStoreError::BrokenLog { .. } => "broken_log",
            RunStoreError::OtherRunsLog { .. } => "other_runs_log",
            RunStoreError::Io { .. } => "io",
        }
    }
}

impl From<std::io::Error> for RunStoreError {
    fn from(error: std::io::Error) -> Self {
        RunStoreError::Io {
            message: error.to_string(),
        }
    }
}

/// The same words as `checkRunId` in the `RunStore` port and `parseRunLog`
/// in `fs-node`, so the page shows one message whichever side refused.
impl fmt::Display for RunStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunStoreError::InvalidRunId { run_id } => write!(
                formatter,
                "Unsafe run id {run_id:?}: use 1 to 128 letters, digits, \"_\", \"-\" or \".\", not starting with \".\"."
            ),
            RunStoreError::InvalidLines => write!(
                formatter,
                "The lines to append must be whole lines, each ending in a line break."
            ),
            RunStoreError::BrokenLog { file } => {
                write!(
                    formatter,
                    "Broken run log {file}: it is not valid UTF-8 text."
                )
            }
            RunStoreError::OtherRunsLog { run_id } => write!(
                formatter,
                "Run {run_id} can't be stored here: the run folder ignores case, and {run_id}.jsonl opens another run's log."
            ),
            RunStoreError::Io { message } => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for RunStoreError {}
