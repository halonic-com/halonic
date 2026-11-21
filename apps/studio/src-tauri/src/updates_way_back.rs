//! The way back when an updated version doesn't start (HAL-1206, failure
//! path 2): the line in `updates.log` written before an installer runs, and
//! the proof, once this version has started, that the kept installers of
//! other versions can go.

use std::path::Path;

use halonic_update_state::Version;
use tauri::{AppHandle, Runtime};

use super::{Inner, lock, now};

/// The kept installers' file name, as the release names them (HAL-1119).
fn installer_name(version: &str) -> String {
    format!("Halonic-{version}-windows-x64-setup.exe")
}

/// Whether `name` in the kept installers' folder is kept for a version other
/// than `version`: its installer, or the record beside it of the setup
/// version its srt needs (`Halonic-<version>.srt-setup`, HAL-5404 S3).
fn kept_for_another_version(name: &str, version: &str) -> bool {
    let Some(rest) = name.strip_prefix("Halonic-") else {
        return false;
    };
    let kept_for = rest
        .strip_suffix("-windows-x64-setup.exe")
        .or_else(|| rest.strip_suffix(".srt-setup"));
    kept_for.is_some_and(|kept_for| kept_for != version)
}

/// The proof that this version works (failure path 2). The window is open;
/// once the agent host answers too, `started-<version>` is written and the
/// installers kept for other versions go. Until then the installer that
/// updated Halonic can still go back to the version before
/// (windows/installer.nsi, `/ROLLBACK`).
pub(super) fn prove_started<R: Runtime>(app: &AppHandle<R>) {
    let (folder, version) = {
        let inner = lock(app);
        let folder = inner
            .file
            .as_deref()
            .and_then(Path::parent)
            .map(Path::to_path_buf);
        (folder, inner.current.clone())
    };
    let Some(folder) = folder else {
        return;
    };
    let marker = folder.join(format!("started-{version}"));
    if marker.exists() {
        return;
    }
    if !tauri::async_runtime::block_on(crate::agent_host::host_answers(app)) {
        halonic_shell_log::record(
            "updates",
            format!("the agent host didn't answer, so {version} hasn't proved it starts"),
        );
        return;
    }
    if let Err(error) = std::fs::create_dir_all(&folder).and_then(|()| std::fs::write(&marker, b""))
    {
        halonic_shell_log::record(
            "updates",
            format!("{} can't be written: {error}", marker.display()),
        );
        return;
    }
    {
        let mut inner = lock(app);
        if let Some(current) = Version::parse(&inner.current.clone()) {
            let before = inner.record.install.clone();
            inner.record.after_proved(&current);
            if inner.record.install != before {
                inner.save();
            }
        }
    }
    let Ok(entries) = std::fs::read_dir(folder.join("installers")) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if kept_for_another_version(&name, &version)
            && let Err(error) = std::fs::remove_file(entry.path())
        {
            halonic_shell_log::record("updates", format!("{name} can't be removed: {error}"));
        }
    }
}

/// Writes in `updates.log` how to go back, just before an installer runs:
/// when the new version doesn't start and nothing can go back by itself,
/// the kept installer of this version is the way.
pub(super) fn log_way_back(inner: &Inner, target: &str) {
    let Some(folder) = inner.file.as_deref().and_then(Path::parent) else {
        return;
    };
    let current = &inner.current;
    let kept = folder.join("installers").join(installer_name(current));
    let line = format!(
        "{} Installing {target} over {current}. If {target} doesn't start, run {} to go back.\n",
        now(),
        kept.display()
    );
    let written = std::fs::create_dir_all(folder).and_then(|()| {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(folder.join("updates.log"))
            .and_then(|mut log| std::io::Write::write_all(&mut log, line.as_bytes()))
    });
    if let Err(error) = written {
        halonic_shell_log::record("updates", format!("updates.log can't be written: {error}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installers_and_records_kept_for_other_versions_go() {
        assert!(kept_for_another_version(
            "Halonic-0.1.0-windows-x64-setup.exe",
            "0.1.1"
        ));
        assert!(kept_for_another_version("Halonic-0.1.0.srt-setup", "0.1.1"));
    }

    #[test]
    fn this_versions_own_and_anything_else_stay() {
        assert!(!kept_for_another_version(
            "Halonic-0.1.1-windows-x64-setup.exe",
            "0.1.1"
        ));
        assert!(!kept_for_another_version(
            "Halonic-0.1.1.srt-setup",
            "0.1.1"
        ));
        assert!(!kept_for_another_version("notes.txt", "0.1.1"));
        assert!(!kept_for_another_version("Halonic-0.1.0.zip", "0.1.1"));
    }
}
