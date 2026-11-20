//! The person's sandbox choice, `sandbox-setting.json`, as the shell needs
//! it (HAL-7373, HAL-13319): which backend it names, and saving or removing
//! it. The file is the one `FileSandboxSettingStore` in
//! `packages/adapters/fs-node` reads and writes, and is read here as
//! strictly: a file that isn't exactly a valid choice, a link or a folder is
//! refused, never read as "no choice", because an agent that could damage
//! the file would otherwise move Studio to another host. A save writes a
//! temporary file and renames it over the choice, as `fs-node` does.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde_json::{Map, Value};

use crate::error::HostSettingsError;
use crate::store::{create_private_folder, unreadable, write_replacing};
use crate::unlinked::{ReadFailure, read_unlinked};

/// The file's name inside the folder, as in `fs-node`.
const SANDBOX_FILE: &str = "sandbox-setting.json";

/// The backends a choice may name besides `none`: `sandboxBackendIds` in
/// `packages/core/ports`.
pub const SANDBOX_BACKENDS: [&str; 6] = ["srt", "srt-wsl", "mxc", "docker-sbx", "cloud", "none"];

/// A saved choice: the backend it names and the file's text, checked to be
/// exactly a choice, so a copy of it is one too.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxSetting {
    /// One of [`SANDBOX_BACKENDS`].
    pub backend: &'static str,
    /// The whole file, as saved.
    pub text: String,
}

impl SandboxSetting {
    /// A new choice of `backend`, chosen at `chosen_at` (an ISO 8601 time).
    /// `app_version` is kept only for `none`, as the port's `SandboxSetting`
    /// says: turning the sandbox off is asked again after an update.
    ///
    /// # Errors
    ///
    /// `InvalidChoice` when `backend` isn't one of [`SANDBOX_BACKENDS`].
    pub fn new(
        backend: &str,
        chosen_at: &str,
        app_version: &str,
    ) -> Result<SandboxSetting, HostSettingsError> {
        let mut record = Map::new();
        record.insert("backend".to_owned(), Value::from(backend));
        record.insert("chosenAt".to_owned(), Value::from(chosen_at));
        if backend == "none" {
            record.insert("appVersion".to_owned(), Value::from(app_version));
        }
        let mut text = serde_json::to_string_pretty(&Value::Object(record))
            .map_err(|error| HostSettingsError::from(std::io::Error::other(error)))?;
        text.push('\n');
        let backend =
            parse_backend(text.as_bytes()).map_err(|reason| HostSettingsError::InvalidChoice {
                reason: reason.to_owned(),
            })?;
        Ok(SandboxSetting { backend, text })
    }
}

/// The backend the choice in `folder` names, `None` when there is no choice.
///
/// # Errors
///
/// As [`read_sandbox_setting`].
pub fn read_sandbox_backend(folder: &Path) -> Result<Option<&'static str>, HostSettingsError> {
    Ok(read_sandbox_setting(folder)?.map(|setting| setting.backend))
}

/// The choice in `folder`, `None` when there is no choice.
///
/// # Errors
///
/// `Unreadable` naming the file when it is a link, a hard link, a folder,
/// can't be read, or isn't exactly a valid choice.
pub fn read_sandbox_setting(folder: &Path) -> Result<Option<SandboxSetting>, HostSettingsError> {
    let file = folder.join(SANDBOX_FILE);
    let bytes = match read_unlinked(&file) {
        Ok(bytes) => bytes,
        Err(ReadFailure::Missing) => return Ok(None),
        Err(failure) => return Err(unreadable(&file, failure)),
    };
    let not_a_choice = |reason: &str| HostSettingsError::Unreadable {
        file: file.clone(),
        reason: reason.to_owned(),
    };
    let backend = parse_backend(&bytes).map_err(not_a_choice)?;
    let text = String::from_utf8(bytes).map_err(|_| not_a_choice("it isn't UTF-8"))?;
    Ok(Some(SandboxSetting { backend, text }))
}

/// Saves `setting` as the choice in `folder`, creating the folder readable
/// by its owner only.
///
/// # Errors
///
/// `Io` when the folder can't be made or the file can't be written; the
/// choice saved before stays as it was.
pub fn save_sandbox_setting(
    folder: &Path,
    setting: &SandboxSetting,
) -> Result<(), HostSettingsError> {
    create_private_folder(folder)?;
    write_replacing(&folder.join(SANDBOX_FILE), &setting.text)
}

/// Removes the choice in `folder`, without reading it, so a damaged choice
/// goes too. No choice there is not an error.
///
/// # Errors
///
/// `Io` when the file is there and can't be removed.
pub fn remove_sandbox_setting(folder: &Path) -> Result<(), HostSettingsError> {
    match fs::remove_file(folder.join(SANDBOX_FILE)) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
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

    /// A folder for one test, gone once the test ends.
    struct Scratch(std::path::PathBuf);

    impl Scratch {
        fn new(name: &str) -> Scratch {
            let folder = std::env::temp_dir()
                .join(format!("halonic-{name}-{}", std::process::id()))
                .join("sandbox");
            let _ = std::fs::remove_dir_all(&folder);
            Scratch(folder)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Some(parent) = self.0.parent() {
                let _ = std::fs::remove_dir_all(parent);
            }
        }
    }

    #[test]
    fn a_saved_choice_reads_back_as_saved() {
        let folder = Scratch::new("choice-save");
        let setting =
            SandboxSetting::new("srt-wsl", "2026-11-19T09:00:00.000Z", "0.1.0").expect("a choice");
        assert_eq!(
            setting.text,
            "{\n  \"backend\": \"srt-wsl\",\n  \"chosenAt\": \"2026-11-19T09:00:00.000Z\"\n}\n"
        );
        save_sandbox_setting(&folder.0, &setting).expect("saved");
        assert_eq!(read_sandbox_setting(&folder.0), Ok(Some(setting)));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = |path: &Path| std::fs::metadata(path).expect("there").permissions().mode();
            assert_eq!(mode(&folder.0) & 0o777, 0o700);
            assert_eq!(mode(&folder.0.join(SANDBOX_FILE)) & 0o777, 0o600);
        }
    }

    #[test]
    fn turning_the_sandbox_off_keeps_the_app_version() {
        let off = SandboxSetting::new("none", "x", "0.1.0").expect("a choice");
        assert_eq!(off.backend, "none");
        assert!(off.text.contains("\"appVersion\": \"0.1.0\""));
        let on = SandboxSetting::new("srt", "x", "0.1.0").expect("a choice");
        assert!(!on.text.contains("appVersion"));
    }

    #[test]
    fn an_unknown_backend_is_never_saved() {
        let refused = SandboxSetting::new("docker", "x", "0.1.0");
        assert!(matches!(
            refused,
            Err(HostSettingsError::InvalidChoice { .. })
        ));
    }

    #[test]
    fn removing_takes_away_even_a_damaged_choice_and_no_choice_is_fine() {
        let folder = Scratch::new("choice-remove");
        assert_eq!(remove_sandbox_setting(&folder.0), Ok(()));
        std::fs::create_dir_all(&folder.0).expect("a folder");
        std::fs::write(folder.0.join(SANDBOX_FILE), "{").expect("damaged");
        assert_eq!(remove_sandbox_setting(&folder.0), Ok(()));
        assert_eq!(read_sandbox_setting(&folder.0), Ok(None));
    }

    #[cfg(unix)]
    #[test]
    fn a_save_replaces_a_link_rather_than_writing_through_it() {
        let folder = Scratch::new("choice-link");
        std::fs::create_dir_all(&folder.0).expect("a folder");
        let elsewhere = folder.0.join("elsewhere.json");
        std::fs::write(&elsewhere, "kept").expect("a file");
        std::os::unix::fs::symlink(&elsewhere, folder.0.join(SANDBOX_FILE)).expect("a link");
        let setting = SandboxSetting::new("srt", "x", "0.1.0").expect("a choice");
        save_sandbox_setting(&folder.0, &setting).expect("saved");
        assert_eq!(std::fs::read_to_string(&elsewhere).expect("there"), "kept");
        assert_eq!(read_sandbox_backend(&folder.0), Ok(Some("srt")));
    }
}
