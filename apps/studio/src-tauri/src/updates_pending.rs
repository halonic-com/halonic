//! The pending update on disk (HAL-19635): a downloaded installer, its
//! signature checked, waits in `<profile>/updates/pending/` instead of in
//! memory, so a restart reuses it instead of downloading it again, and a
//! newer release replaces it. At most one pair stays there; the file rules
//! are `halonic_update_state`'s (`pending.rs`).
//!
//! A pair is reused only when the updater restores its update as newer than
//! the running version on this install's track, and the installer's bytes
//! verify against that track's key (`on_track_key`). A restored update
//! needs the signature to name its version, so a record edited to name
//! another version doesn't verify. `Update::install` verifies the bytes
//! again before it runs them.

use std::path::{Path, PathBuf};

use halonic_update_state::{
    PENDING_FOLDER, PendingRecord, UpdateState, UpdateTrack, Version, complete_pairs, notes_url,
    offered_notes, pending_installer_name, pending_record_name, pending_record_text,
    pending_to_remove, read_pending_record,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

use super::check::on_track_key;
use super::download::bad_signature;
use super::lock;

/// The pending folder beside the updater's record, `updater_file`.
pub(super) fn pending_folder(updater_file: Option<&Path>) -> Option<PathBuf> {
    Some(updater_file?.parent()?.join(PENDING_FOLDER))
}

/// `name` in the pending folder as the log writes it: relative to the
/// profile, never the full path under the home folder.
fn shown(name: &str) -> String {
    format!("updates/{PENDING_FOLDER}/{name}")
}

/// The state of a ready `update`, with what changed since `current`.
pub(super) fn ready_state(update: &Update, current: &str) -> UpdateState {
    UpdateState::Ready {
        notes_url: notes_url(&update.version),
        changes: offered_notes(&update.raw_json, current, &update.version),
        version: update.version.clone(),
    }
}

/// Whether `found` is newer than `ready`, so its download may replace it.
pub(super) fn newer_than(found: &str, ready: &str) -> bool {
    match (Version::parse(found), Version::parse(ready)) {
        (Some(found), Some(ready)) => found > ready,
        _ => false,
    }
}

/// Writes `update`'s checked `bytes` to `folder`: the installer first, then
/// its record, each through a `.tmp` file and a rename, so a crash leaves
/// no record without its installer. Answers the installer's path. The other
/// pairs stay until [`prune`] runs, so the ready one can still install.
pub(super) fn write_pending(
    folder: &Path,
    update: &Update,
    track: UpdateTrack,
    bytes: &[u8],
) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(folder)?;
    let installer = folder.join(pending_installer_name(&update.version));
    let record = folder.join(pending_record_name(&update.version));
    let text = pending_record_text(&PendingRecord {
        track,
        update: update.raw_json.clone(),
    });
    for (file, content) in [(&installer, bytes), (&record, text.as_bytes())] {
        let mut temporary = file.clone().into_os_string();
        temporary.push(".tmp");
        std::fs::write(&temporary, content)?;
        std::fs::rename(&temporary, file)?;
    }
    Ok(installer)
}

fn names_in(folder: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

/// Removes everything in `folder` but `keep`'s pair.
pub(super) fn prune(folder: &Path, keep: Option<&str>) {
    for name in pending_to_remove(&names_in(folder), keep) {
        if let Err(error) = std::fs::remove_file(folder.join(&name)) {
            halonic_shell_log::record(
                "updates",
                format!("{} can't be removed: {error}", shown(&name)),
            );
        }
    }
}

/// The update of the pair `stem` in `folder`, when it was downloaded on
/// `track`, `updater` restores it as newer than the running version, and
/// its installer verifies. Answers why not, for the log, or `None` when it
/// is simply no longer an update.
fn reusable(
    folder: &Path,
    stem: &str,
    track: UpdateTrack,
    updater: &Updater,
) -> Result<Option<(Update, PathBuf)>, String> {
    let record = std::fs::read_to_string(folder.join(pending_record_name(stem)))
        .map_err(|error| error.to_string())?;
    let record = read_pending_record(&record).ok_or("its record can't be read")?;
    if record.track != track {
        return Ok(None);
    }
    let Some(update) = updater
        .restore_update(record.update)
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    if update.version != stem {
        return Err(format!("its record names {}", update.version));
    }
    let installer = folder.join(pending_installer_name(stem));
    let bytes = std::fs::read(&installer).map_err(|error| error.to_string())?;
    update.verify(&bytes).map_err(|error| error.to_string())?;
    Ok(Some((update, installer)))
}

/// The newest pair in `folder` that is still an update on `track` and
/// verifies with `updater`'s key; every other file in `folder` goes.
pub(super) fn reuse(
    folder: &Path,
    track: UpdateTrack,
    updater: &Updater,
) -> Option<(Update, PathBuf)> {
    let mut newest: Option<(Update, PathBuf)> = None;
    for stem in complete_pairs(&names_in(folder)) {
        match reusable(folder, &stem, track, updater) {
            Ok(Some(found)) => {
                if newest
                    .as_ref()
                    .is_none_or(|(kept, _)| newer_than(&found.0.version, &kept.version))
                {
                    newest = Some(found);
                }
            }
            Ok(None) => {}
            Err(why) => halonic_shell_log::record(
                "updates",
                format!(
                    "{} isn't reused: {why}",
                    shown(&pending_installer_name(&stem))
                ),
            ),
        }
    }
    prune(
        folder,
        newest.as_ref().map(|(update, _)| update.version.as_str()),
    );
    newest
}

/// At start: makes a pending update ready again without downloading it, or
/// clears the folder. Runs on the updater's thread, outside the lock, since
/// reading and verifying the installer takes a moment.
pub(super) fn reuse_at_start<R: Runtime>(app: &AppHandle<R>) {
    let (folder, track, managed) = {
        let inner = lock(app);
        let folder = pending_folder(inner.file.as_deref());
        (folder, inner.track(), inner.managed.is_some())
    };
    let Some(folder) = folder else {
        return;
    };
    let updater = on_track_key(app.updater_builder(), track).and_then(|builder| builder.build());
    let reused = match updater {
        Ok(updater) if !managed => reuse(&folder, track, &updater),
        Ok(_) => {
            prune(&folder, None);
            None
        }
        Err(error) => {
            halonic_shell_log::record("updates", format!("no pending update is reused: {error}"));
            prune(&folder, None);
            None
        }
    };
    let Some((update, installer)) = reused else {
        return;
    };
    halonic_shell_log::record(
        "updates",
        format!("reusing the pending download {}", update.version),
    );
    let mut inner = lock(app);
    if inner.track() != track || inner.busy() {
        return;
    }
    let current = inner.current.clone();
    inner.state = Some(ready_state(&update, &current));
    inner.ready = Some((update, installer));
    inner.notify();
}

/// Installs `update` from its pending `installer`. The updater verifies the
/// bytes first; a file changed since it was checked is removed.
pub(super) fn install_from(update: &Update, installer: &Path) -> Result<(), String> {
    let bytes = std::fs::read(installer).map_err(|error| error.to_string())?;
    update.install(bytes).map_err(|error| {
        if bad_signature(&error)
            && let Some(folder) = installer.parent()
        {
            prune(folder, None);
        }
        error.to_string()
    })
}

#[cfg(test)]
#[path = "updates_pending_tests.rs"]
mod tests;
