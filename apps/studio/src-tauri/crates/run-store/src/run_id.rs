//! The run id rule of `checkRunId` in the `RunStore` port: a run id must be
//! a plain file name everywhere, because it names the run's files.

use crate::error::RunStoreError;

/// The longest run id, in characters.
const MAX_LENGTH: usize = 128;

/// Whether `run_id` is 1 to 128 letters, digits, `_`, `-` or `.`, doesn't
/// start with a dot, and isn't a name Windows opens as a device.
pub fn is_run_id(run_id: &str) -> bool {
    let bytes = run_id.as_bytes();
    (1..=MAX_LENGTH).contains(&bytes.len())
        && bytes[0] != b'.'
        && bytes.iter().all(|&byte| is_allowed(byte))
        && !is_windows_device_name(run_id)
}

/// Refuses a run id that couldn't be a plain file name in the run folder.
pub fn check_run_id(run_id: &str) -> Result<(), RunStoreError> {
    if is_run_id(run_id) {
        Ok(())
    } else {
        Err(RunStoreError::InvalidRunId {
            run_id: run_id.to_owned(),
        })
    }
}

fn is_allowed(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')
}

/// Names Windows opens as a device whatever the extension, such as
/// `NUL.jsonl`: `con`, `prn`, `aux`, `nul`, `com0` to `com9` and `lpt0` to
/// `lpt9` in any case, alone or before a dot.
fn is_windows_device_name(run_id: &str) -> bool {
    let stem = run_id
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match stem.as_str() {
        "con" | "prn" | "aux" | "nul" => true,
        _ => {
            let numbered = stem
                .strip_prefix("com")
                .or_else(|| stem.strip_prefix("lpt"));
            numbered.is_some_and(
                |number| matches!(number.as_bytes(), [digit] if digit.is_ascii_digit()),
            )
        }
    }
}
