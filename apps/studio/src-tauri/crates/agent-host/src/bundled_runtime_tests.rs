//! The runtime beside the app, and installing it through a stand-in
//! `wsl.exe` that records its arguments and input.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

#[cfg(unix)]
use std::time::Instant;

use super::{
    BundledRuntime, RUNTIME_ARCHIVE, RUNTIME_MANIFEST, RuntimeUpdate, bundled_runtime,
    update_runtime,
};
use crate::wsl::WslError;

const ARCHIVE: &[u8] = b"a runtime archive\n";
/// The SHA-256 of [`ARCHIVE`].
const ARCHIVE_SHA: &str = "042110a7eb741c1bf4ebc3564b3eb31aae57b57a76ecba9a469fc6dffccdb9c2";
const VERSION: &str = "0.1.1+0123456789ab";

static NEXT_FOLDER: AtomicU32 = AtomicU32::new(0);

/// A folder in the system's temporary folder, removed when the test ends.
struct TempFolder(PathBuf);

impl TempFolder {
    fn new() -> Self {
        let number = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
        let name = format!("halonic-bundled-runtime-{}-{number}", std::process::id());
        let path = std::env::temp_dir().join(name);
        std::fs::create_dir_all(&path).expect("make the folder");
        Self(path)
    }

    fn write(&self, name: &str, contents: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        std::fs::write(&path, contents).expect("write the file");
        path
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn manifest(version: &str, sha256: &str) -> String {
    format!(r#"{{"version":"{version}","sha256":"{sha256}","size":18}}"#)
}

fn shipped(folder: &TempFolder) -> BundledRuntime {
    BundledRuntime {
        version: VERSION.to_owned(),
        sha256: ARCHIVE_SHA.to_owned(),
        archive: folder.write(RUNTIME_ARCHIVE, ARCHIVE),
    }
}

/// A stand-in for `wsl.exe` that writes its arguments to `arguments`, its
/// input to `input`, then runs `then`.
#[cfg(unix)]
fn stand_in_wsl(folder: &TempFolder, then: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let script = format!(
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > '{arguments}'\ncat > '{input}'\n{then}\n",
        arguments = folder.0.join("arguments").display(),
        input = folder.0.join("input").display(),
    );
    let wsl = folder.write("wsl", script.as_bytes());
    std::fs::set_permissions(&wsl, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    wsl
}

#[test]
fn runtime_update_reads_the_runtime_beside_the_app() {
    let folder = TempFolder::new();
    folder.write(RUNTIME_MANIFEST, manifest(VERSION, ARCHIVE_SHA).as_bytes());
    assert_eq!(
        bundled_runtime(&folder.0),
        Ok(Some(BundledRuntime {
            version: VERSION.to_owned(),
            sha256: ARCHIVE_SHA.to_owned(),
            archive: folder.0.join(RUNTIME_ARCHIVE),
        }))
    );
}

#[test]
fn runtime_update_finds_none_in_a_build_that_ships_none() {
    let folder = TempFolder::new();
    assert_eq!(bundled_runtime(&folder.0), Ok(None));
}

#[test]
fn runtime_update_refuses_a_manifest_the_updater_would_refuse() {
    let folder = TempFolder::new();
    for text in ["not JSON", r#"{"version":"0.1.1"}"#] {
        folder.write(RUNTIME_MANIFEST, text.as_bytes());
        assert!(
            matches!(bundled_runtime(&folder.0), Err(WslError::Archive(_))),
            "{text}"
        );
    }
    for (version, sha256) in [
        ("current", ARCHIVE_SHA),
        ("../0.1.1", ARCHIVE_SHA),
        (VERSION, "ABC"),
        (VERSION, &ARCHIVE_SHA.to_uppercase()),
    ] {
        folder.write(RUNTIME_MANIFEST, manifest(version, sha256).as_bytes());
        assert!(
            matches!(bundled_runtime(&folder.0), Err(WslError::BadArgument(_))),
            "{version} {sha256}"
        );
    }
}

#[test]
fn runtime_update_runs_nothing_when_the_runtime_is_already_current() {
    let folder = TempFolder::new();
    // No `wsl.exe` there: running it would fail to start.
    let wsl = folder.0.join("no-wsl");
    let update = update_runtime(&wsl, &shipped(&folder), Some(VERSION), Duration::MAX);
    assert_eq!(update, Ok(RuntimeUpdate::AlreadyCurrent));
}

#[cfg(unix)]
#[test]
fn runtime_update_installs_the_checked_archive_as_root_for_another_or_no_runtime() {
    for current in [Some("0.1.0"), None] {
        let folder = TempFolder::new();
        let wsl = stand_in_wsl(&folder, "exit 0");
        let update = update_runtime(&wsl, &shipped(&folder), current, Duration::from_secs(30));
        assert_eq!(update, Ok(RuntimeUpdate::Installed));
        let arguments = std::fs::read_to_string(folder.0.join("arguments")).expect("read");
        let expected = [
            "-d",
            "halonic",
            "-u",
            "root",
            "--cd",
            "/",
            "--exec",
            "/usr/local/sbin/halonic-runtime",
            "install",
            VERSION,
            ARCHIVE_SHA,
        ];
        assert_eq!(arguments.lines().collect::<Vec<_>>(), expected);
        assert_eq!(
            std::fs::read(folder.0.join("input")).expect("read"),
            ARCHIVE
        );
    }
}

#[test]
fn runtime_update_sends_nothing_when_the_archive_isnt_the_pinned_one() {
    let folder = TempFolder::new();
    let mut runtime = shipped(&folder);
    runtime.archive = folder.write(RUNTIME_ARCHIVE, b"another archive\n");
    let wsl = folder.0.join("no-wsl");
    let update = update_runtime(&wsl, &runtime, None, Duration::MAX);
    assert_eq!(update, Err(WslError::ChecksumDiffers));
    assert!(!folder.0.join("input").exists());
}

#[cfg(unix)]
#[test]
fn runtime_update_reports_the_updaters_reason_and_stops_a_stuck_one() {
    let folder = TempFolder::new();
    let wsl = stand_in_wsl(&folder, "exit 5");
    let update = update_runtime(&wsl, &shipped(&folder), None, Duration::from_secs(30));
    assert_eq!(update, Err(WslError::ArchiveRefused));

    let wsl = stand_in_wsl(&folder, "sleep 30");
    let started = Instant::now();
    let update = update_runtime(&wsl, &shipped(&folder), None, Duration::from_millis(200));
    assert_eq!(update, Err(WslError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));
}
