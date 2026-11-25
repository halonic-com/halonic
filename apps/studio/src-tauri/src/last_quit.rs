//! The workspaces open at the last Quit (B1 step 6c, design note D9): Quit
//! records the workspaces that had a background engine, and the start at
//! login (`background_start.rs`) starts engines for those again. The list
//! lives in the CLI's profile, `studio/open-at-quit.json`, next to the
//! picked folders; only the shell reads and writes it. A start never takes
//! a workspace from its arguments (security review HAL-14212, section 5).
//!
//! The list fails closed, like the picked folders: a file that is missing,
//! can't be read, is too big or isn't the format below is an empty list, so
//! nothing starts.

use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::Path;

use halonic_trust_grant::MAX_PICKED_FOLDERS;
use serde::{Deserialize, Serialize};

/// The file's name, in the profile's `studio` folder.
pub const FILE_NAME: &str = "open-at-quit.json";

/// The file's format. A file with another version is read as an empty list.
const FORMAT_VERSION: u32 = 1;

/// The most of the file that is read: far more than
/// [`MAX_PICKED_FOLDERS`] paths take.
const MAX_FILE_BYTES: u64 = 64 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ListFile {
    version: u32,
    workspaces: Vec<String>,
}

/// Replaces the list in `file` with `locations`, at most
/// [`MAX_PICKED_FOLDERS`] of them: only a picked folder starts again, and the
/// shell remembers no more picks than that. A temporary file next to it,
/// then a rename, so a crash leaves the old list or the new one.
pub fn record(file: &Path, locations: &[String]) -> std::io::Result<()> {
    let list = ListFile {
        version: FORMAT_VERSION,
        workspaces: locations.iter().take(MAX_PICKED_FOLDERS).cloned().collect(),
    };
    let mut text = serde_json::to_string_pretty(&list)?;
    text.push('\n');
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut name = file.file_name().unwrap_or_default().to_owned();
    name.push(".tmp");
    let temporary = file.with_file_name(name);
    let written = write_then_rename(&temporary, file, &text);
    if written.is_err() {
        // A half-written temporary file must not stay behind. If removing it
        // fails too, the write's own error is the one to report.
        let _ = fs::remove_file(&temporary);
    }
    written
}

fn write_then_rename(temporary: &Path, file: &Path, text: &str) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut opened = options.open(temporary)?;
    opened.write_all(text.as_bytes())?;
    opened.sync_all()?;
    drop(opened);
    fs::rename(temporary, file)
}

/// The recorded locations, at most [`MAX_PICKED_FOLDERS`], or none when the
/// file is missing or can't be trusted. Why it can't goes to the log.
pub fn read(file: &Path) -> Vec<String> {
    match read_list(file) {
        Ok(mut workspaces) => {
            workspaces.truncate(MAX_PICKED_FOLDERS);
            workspaces
        }
        Err(problem) => {
            halonic_shell_log::record(
                "background start",
                format_args!("the workspaces open at the last Quit can't be read: {problem}"),
            );
            Vec::new()
        }
    }
}

fn read_list(file: &Path) -> Result<Vec<String>, String> {
    let opened = match File::open(file) {
        Ok(opened) => opened,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut text = String::new();
    opened
        .take(MAX_FILE_BYTES + 1)
        .read_to_string(&mut text)
        .map_err(|error| error.to_string())?;
    if text.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("it is over {MAX_FILE_BYTES} bytes"));
    }
    let list: ListFile = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    if list.version != FORMAT_VERSION {
        return Err(format!(
            "it has version {}, not {FORMAT_VERSION}",
            list.version
        ));
    }
    Ok(list.workspaces)
}
