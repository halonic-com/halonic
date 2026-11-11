//! Stand-in scripts take `wsl.exe`'s place for the updater's endings. They
//! test here, beside `send_archive`, because the public `install_runtime`
//! builds its own `wsl.exe` command.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

use super::{WslError, run_runtime_step, send_archive};

const ARCHIVE: &[u8] = b"a runtime archive\n";
/// The SHA-256 of [`ARCHIVE`].
const ARCHIVE_SHA: &str = "042110a7eb741c1bf4ebc3564b3eb31aae57b57a76ecba9a469fc6dffccdb9c2";

static NEXT_FILE: AtomicU32 = AtomicU32::new(0);

/// A file in the system's temporary folder, removed when the test ends.
struct TempFile(PathBuf);

impl std::ops::Deref for TempFile {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn temp_file(extension: &str, contents: &[u8]) -> TempFile {
    let number = NEXT_FILE.fetch_add(1, Ordering::Relaxed);
    let name = format!("halonic-wsl-unit-{}-{number}", std::process::id());
    let path = std::env::temp_dir().join(name).with_extension(extension);
    std::fs::write(&path, contents).expect("write the file");
    TempFile(path)
}

/// A stand-in for `wsl.exe` that copies its input to `output` and ends
/// with `code`. Keep the script until the command has run.
#[cfg(unix)]
fn ending_with(code: i32, output: &Path) -> (Command, TempFile) {
    let script = temp_file(
        "sh",
        format!("cat > '{}'\nexit {code}\n", output.display()).as_bytes(),
    );
    let mut command = Command::new("/bin/sh");
    command.arg(&*script);
    (command, script)
}

#[cfg(windows)]
fn ending_with(code: i32, output: &Path) -> (Command, TempFile) {
    let script = temp_file(
        "cmd",
        format!(
            "@echo off\r\nfindstr \"^\" > \"{}\"\r\nexit /b {code}\r\n",
            output.display()
        )
        .as_bytes(),
    );
    (Command::new(&*script), script)
}

#[cfg(unix)]
#[test]
fn runtime_update_streams_the_checked_archive_to_the_updater() {
    let archive = temp_file("tar.gz", ARCHIVE);
    let received = temp_file("received", b"");
    let (updater, _script) = ending_with(0, &received);
    send_archive(updater, &archive, ARCHIVE_SHA).expect("installed");
    assert_eq!(std::fs::read(&*received).expect("read"), ARCHIVE);
}

#[test]
fn runtime_update_reports_the_updaters_reason() {
    let archive = temp_file("tar.gz", ARCHIVE);
    let received = temp_file("received", b"");
    for (code, expected) in [
        (3, WslError::Busy),
        (4, WslError::ChecksumDiffers),
        (5, WslError::ArchiveRefused),
        (6, WslError::NothingToRollBack),
        (2, WslError::Failed(Some(2))),
    ] {
        let (updater, _script) = ending_with(code, &received);
        assert_eq!(
            send_archive(updater, &archive, ARCHIVE_SHA),
            Err(expected.clone())
        );
        let (updater, _script) = ending_with(code, &received);
        assert_eq!(run_runtime_step(updater), Err(expected));
    }
}
