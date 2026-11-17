//! `plugin_folder_place` (HAL-11571): writes one plugin's files into the
//! profile's plugins folder, for the Add plugin dialog. Core's
//! `PluginService.add` has read the source through `plugin_source_*`
//! (`plugin_source.rs`), checked and hashed it, and hands over exactly the
//! bytes it hashed. The reading and removing commands are in
//! `plugin_folder.rs` and `plugin_folder_remove.rs`.
//!
//! The page names one plugin and its files, never a path. Whole or not at
//! all: the files go into a new folder next to the plugins folder, on the
//! same disk, and the folder is then renamed into place, so a reader never
//! lists a half-written plugin. A name that exists, in any case, answers
//! `taken` and nothing is written. Nothing runs: no script, no install. The
//! plugin lands not trusted, and the trust check turns it on.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};

use halonic_blob_store::base64url;
use halonic_workspace_files::{check_workspace_path, segment_as_opened};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::plugin_folder::{io, plugins_reader, plugins_root};
use crate::plugin_source::{InstallRefusal, MAX_BYTES, MAX_ENTRIES, on_worker};

/// One file of the plugin: its path from the plugin's folder, and its bytes
/// as base64url.
#[derive(Debug, Deserialize)]
pub struct PlacedFile {
    path: String,
    bytes: String,
}

/// What a placing did: the folder is `placed`, or the name was `taken` and
/// nothing was written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
    Placed,
    Taken,
}

/// One placing at a time, so two can't both find a name free.
static PLACING: Mutex<()> = Mutex::new(());

/// Makes each stage folder's name its own.
static STAGES: AtomicU64 = AtomicU64::new(0);

fn unsafe_name(what: &str, reason: &str) -> InstallRefusal {
    InstallRefusal::new("unsafe_path", format!("{what:?} isn't allowed: {reason}."))
}

/// Why Windows or macOS would open `name` as another entry, or can't name it,
/// as `whyNotPortable` in `@halonicjs/ports` says.
fn why_not_portable(name: &str) -> Option<&'static str> {
    if name.contains(':') {
        return Some("no `:`, which Windows opens as a stream");
    }
    if name.ends_with(['.', ' ']) {
        return Some("no trailing dot or space, which Windows drops");
    }
    let chars: Vec<char> = name.chars().collect();
    if chars
        .windows(2)
        .any(|pair| pair[0] == '~' && pair[1].is_ascii_digit())
    {
        return Some("no `~` followed by a digit, which Windows opens as a short name");
    }
    if chars.iter().any(|c| u32::from(*c) < 0x20 || *c == '\u{7f}') {
        return Some("no control character");
    }
    if chars.iter().any(|c| "<>\"|?*".contains(*c)) {
        return Some("no `<`, `>`, `\"`, `|`, `?` or `*`, which Windows refuses");
    }
    let opened = segment_as_opened(name);
    let base = opened.split('.').next().unwrap_or_default().trim_end();
    let numbered = |prefix: &str| {
        base.strip_prefix(prefix).is_some_and(|rest| {
            let mut rest = rest.chars();
            matches!(rest.next(), Some('0'..='9' | '¹' | '²' | '³')) && rest.next().is_none()
        })
    };
    if matches!(base, "con" | "prn" | "aux" | "nul" | "conin$" | "conout$")
        || numbered("com")
        || numbered("lpt")
    {
        return Some("not a Windows device name such as `con` or `nul`");
    }
    None
}

/// Refuses a plugin name that isn't one plain folder name every system opens
/// the same way.
fn check_plugin_name(plugin: &str) -> Result<(), InstallRefusal> {
    if plugin.is_empty() || plugin == "." || plugin == ".." || plugin.contains(['/', '\\', '\0']) {
        return Err(unsafe_name(plugin, "a plugin's folder is one name"));
    }
    match why_not_portable(plugin) {
        Some(reason) => Err(unsafe_name(plugin, reason)),
        None => Ok(()),
    }
}

/// The files, decoded and checked: a safe path each, no `.git`, none the same
/// file as another on a disk that ignores case, none both a file and a
/// folder, and not more entries or bytes than a plugin may have.
fn decode_files(files: Vec<PlacedFile>) -> Result<Vec<(String, Vec<u8>)>, InstallRefusal> {
    if files.len() > MAX_ENTRIES {
        return Err(InstallRefusal::new(
            "too_many_files",
            "The plugin has more files than a plugin may have.",
        ));
    }
    let mut seen = HashSet::new();
    let mut decoded = Vec::with_capacity(files.len());
    let mut total: u64 = 0;
    for file in files {
        check_workspace_path(&file.path)?;
        let mut opened = Vec::new();
        for segment in file.path.split('/') {
            if let Some(reason) = why_not_portable(segment) {
                return Err(unsafe_name(&file.path, reason));
            }
            opened.push(segment_as_opened(segment));
        }
        if opened.first().is_some_and(|first| first == ".git") {
            return Err(unsafe_name(&file.path, "a plugin has no `.git` folder"));
        }
        if !seen.insert(opened.join("/")) {
            return Err(unsafe_name(
                &file.path,
                "the same file as another on a disk that ignores case",
            ));
        }
        let bytes = base64url::decode(&file.bytes).ok_or_else(|| {
            InstallRefusal::io(format!("{:?}'s bytes aren't base64url", file.path))
        })?;
        total += bytes.len() as u64;
        if total > MAX_BYTES {
            return Err(InstallRefusal::new(
                "too_big",
                "The plugin is larger than a plugin may be.",
            ));
        }
        decoded.push((file.path, bytes));
    }
    for key in &seen {
        let segments: Vec<&str> = key.split('/').collect();
        for depth in 1..segments.len() {
            if seen.contains(&segments[..depth].join("/")) {
                return Err(unsafe_name(
                    key,
                    "a file and also a folder above another file",
                ));
            }
        }
    }
    Ok(decoded)
}

/// A folder made next to the plugins folder, removed when dropped unless it
/// was renamed away by then.
struct Scratch(PathBuf);

impl Scratch {
    fn new(beside: &Path, kind: &str) -> Self {
        let number = STAGES.fetch_add(1, Ordering::Relaxed);
        Self(beside.join(format!(".plugin-{kind}-{}-{number}", std::process::id())))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        // Gone already when it was renamed into place; nothing else to do.
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// What the top of `root` holds under the name `plugin`: `None` when nothing
/// is called that in any case, `Some(true)` for a real folder named exactly
/// so and nothing else like it, `Some(false)` for anything else.
fn existing(root: &Path, plugin: &str) -> Result<Option<bool>, InstallRefusal> {
    let wanted = segment_as_opened(plugin);
    let mut same_name = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| io("", &error))? {
        let entry = entry.map_err(|error| io("", &error))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if segment_as_opened(&name) == wanted {
            same_name.push(entry);
        }
    }
    let [only] = same_name.as_slice() else {
        return Ok(if same_name.is_empty() {
            None
        } else {
            Some(false)
        });
    };
    let exact = only.file_name() == plugin;
    let real_folder = fs::symlink_metadata(only.path())
        .map(|seen| seen.file_type().is_dir())
        .unwrap_or(false);
    Ok(Some(exact && real_folder))
}

/// Writes `files` as the plugin folder `plugin` in the plugins folder `root`.
/// Without `replace`, an entry with the name in any case answers `Taken`.
/// With it, a real folder named exactly so is replaced and anything else is
/// `Taken`.
pub(crate) fn place_plugin(
    root: &Path,
    plugin: &str,
    files: &[(String, Vec<u8>)],
    replace: bool,
) -> Result<Placement, InstallRefusal> {
    check_plugin_name(plugin)?;
    let _turn = PLACING.lock().unwrap_or_else(PoisonError::into_inner);
    // Refuses a plugins folder that is a link or a file.
    if plugins_reader(root)?.is_none() {
        fs::create_dir_all(root).map_err(|error| io("", &error))?;
    }
    let real_root = fs::canonicalize(root).map_err(|error| io("", &error))?;
    let target = real_root.join(plugin);
    let replacing = match existing(&real_root, plugin)? {
        None => false,
        Some(true) if replace => true,
        Some(_) => return Ok(Placement::Taken),
    };
    let beside = real_root
        .parent()
        .ok_or_else(|| InstallRefusal::io("the plugins folder has no parent"))?;
    let stage = Scratch::new(beside, "stage");
    fs::create_dir(&stage.0).map_err(|error| io("", &error))?;
    for (path, bytes) in files {
        let file = stage.0.join(path);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(|error| io(path, &error))?;
        }
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)
            .map_err(|error| io(path, &error))?;
        out.write_all(bytes).map_err(|error| io(path, &error))?;
    }
    if replacing {
        let old = Scratch::new(beside, "old");
        fs::rename(&target, &old.0).map_err(|error| io(plugin, &error))?;
        if let Err(error) = fs::rename(&stage.0, &target) {
            // Put the plugin back as it was. If that fails too, the old
            // folder is kept where it is rather than deleted.
            if fs::rename(&old.0, &target).is_err() {
                std::mem::forget(old);
            }
            return Err(io(plugin, &error).into());
        }
        return Ok(Placement::Placed);
    }
    // A folder that appeared since the look above is never written over.
    match fs::symlink_metadata(&target) {
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(io(plugin, &error).into()),
        Ok(_) => return Ok(Placement::Taken),
    }
    fs::rename(&stage.0, &target).map_err(|error| io(plugin, &error))?;
    Ok(Placement::Placed)
}

/// Writes the files of the plugin `plugin` into the plugins folder, whole or
/// not at all. Answers `placed`, or `taken` when the name is in use, in any
/// case, and nothing was written. `replace` puts the files in place of the
/// plugin's own folder, for a new commit of the same plugin.
#[tauri::command]
pub async fn plugin_folder_place<R: Runtime>(
    app: AppHandle<R>,
    plugin: String,
    files: Vec<PlacedFile>,
    replace: Option<bool>,
) -> Result<Placement, InstallRefusal> {
    on_worker(app, move |_, profile| {
        check_plugin_name(&plugin)?;
        let files = decode_files(files)?;
        place_plugin(
            &plugins_root(&profile),
            &plugin,
            &files,
            replace.unwrap_or(false),
        )
    })
    .await
}

#[cfg(test)]
#[path = "plugin_folder_place_tests.rs"]
mod tests;
