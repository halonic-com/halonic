//! Reading the person's sandbox choice, `sandbox-setting.json`, as the
//! shell needs it (HAL-7373): only which backend it names. The file is
//! written by `FileSandboxSettingStore` in `packages/adapters/fs-node`, and
//! read here as strictly: a file that isn't exactly a valid choice, a link
//! or a folder is refused, never read as "no choice", because an agent that
//! could damage the file would otherwise move Studio to another host.

use std::path::Path;

use serde_json::Value;

use crate::error::HostSettingsError;
use crate::store::unreadable;
use crate::unlinked::{ReadFailure, read_unlinked};

/// The file's name inside the folder, as in `fs-node`.
const SANDBOX_FILE: &str = "sandbox-setting.json";

/// The backends a choice may name besides `none`: `sandboxBackendIds` in
/// `packages/core/ports`.
pub const SANDBOX_BACKENDS: [&str; 6] = ["srt", "srt-wsl", "mxc", "docker-sbx", "cloud", "none"];

/// The backend the choice in `folder` names, `None` when there is no choice.
///
/// # Errors
///
/// `Unreadable` naming the file when it is a link, a hard link, a folder,
/// can't be read, or isn't exactly a valid choice.
pub fn read_sandbox_backend(folder: &Path) -> Result<Option<&'static str>, HostSettingsError> {
    let file = folder.join(SANDBOX_FILE);
    let bytes = match read_unlinked(&file) {
        Ok(bytes) => bytes,
        Err(ReadFailure::Missing) => return Ok(None),
        Err(failure) => return Err(unreadable(&file, failure)),
    };
    parse_backend(&bytes)
        .map(Some)
        .map_err(|reason| HostSettingsError::Unreadable {
            file,
            reason: reason.to_owned(),
        })
}

/// The fields of a choice: a backend and when it was chosen; `none` also
/// has the app version.
fn parse_backend(bytes: &[u8]) -> Result<&'static str, &'static str> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "it isn't JSON")?;
    let record = value.as_object().ok_or("it isn't an object")?;
    let backend = record
        .get("backend")
        .and_then(Value::as_str)
        .ok_or("it names no backend")?;
    let backend = SANDBOX_BACKENDS
        .iter()
        .find(|known| **known == backend)
        .ok_or("it names an unknown backend")?;
    let fields: &[&str] = if *backend == "none" {
        &["backend", "chosenAt", "appVersion"]
    } else {
        &["backend", "chosenAt"]
    };
    let exact = record.len() == fields.len()
        && fields
            .iter()
            .all(|field| record.get(*field).is_some_and(Value::is_string));
    if exact {
        Ok(backend)
    } else {
        Err("it isn't exactly a sandbox choice")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(text: &str) -> Result<&'static str, &'static str> {
        parse_backend(text.as_bytes())
    }

    #[test]
    fn a_valid_choice_names_its_backend() {
        assert_eq!(
            read(r#"{"backend":"srt-wsl","chosenAt":"x"}"#),
            Ok("srt-wsl")
        );
        let none = r#"{"backend":"none","chosenAt":"x","appVersion":"0.1.0"}"#;
        assert_eq!(read(none), Ok("none"));
    }

    #[test]
    fn anything_but_exactly_a_choice_is_refused() {
        for text in [
            "",
            "[]",
            r#"{"chosenAt":"x"}"#,
            r#"{"backend":"docker","chosenAt":"x"}"#,
            r#"{"backend":"srt","chosenAt":"x","command":"sh"}"#,
            r#"{"backend":"srt","chosenAt":1}"#,
            r#"{"backend":"none","chosenAt":"x"}"#,
        ] {
            assert!(read(text).is_err(), "{text}");
        }
    }

    #[test]
    fn no_file_is_no_choice_and_a_folder_in_its_place_is_refused() {
        let folder = std::env::temp_dir().join(format!("halonic-choice-{}", std::process::id()));
        std::fs::create_dir_all(folder.join(SANDBOX_FILE)).expect("a folder");
        assert!(read_sandbox_backend(&folder).is_err());
        std::fs::remove_dir(folder.join(SANDBOX_FILE)).expect("remove it");
        assert_eq!(read_sandbox_backend(&folder), Ok(None));
        std::fs::write(
            folder.join(SANDBOX_FILE),
            r#"{"backend":"srt","chosenAt":"x"}"#,
        )
        .expect("a choice");
        assert_eq!(read_sandbox_backend(&folder), Ok(Some("srt")));
        std::fs::remove_dir_all(&folder).expect("clean up");
    }
}
