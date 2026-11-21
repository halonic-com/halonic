//! Stand-in scripts take `wsl.exe`'s place for the updater's endings. They
//! test here, beside `send_archive`, because the public `install_runtime`
//! builds its own `wsl.exe` command.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

#[cfg(unix)]
use std::time::Instant;

use super::{SettingCopy, WslError, lists_distro, run_runtime_step, send_archive, send_setting};
#[cfg(unix)]
use super::{distro_listed_within, run_runtime_step_within};

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
    send_archive(updater, &archive, ARCHIVE_SHA, Duration::MAX).expect("installed");
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
        (7, WslError::MountsLeft),
        (8, WslError::UpdateRunning),
        (2, WslError::Failed(Some(2))),
    ] {
        let (updater, _script) = ending_with(code, &received);
        assert_eq!(
            send_archive(updater, &archive, ARCHIVE_SHA, Duration::MAX),
            Err(expected.clone())
        );
        let (updater, _script) = ending_with(code, &received);
        assert_eq!(run_runtime_step(updater), Err(expected));
    }
}

#[cfg(unix)]
#[test]
fn a_step_with_a_time_limit_answers_what_it_printed_or_is_stopped() {
    let script = temp_file("sh", b"echo cleaned 0 import mounts, 0 left\n");
    let mut updater = Command::new("/bin/sh");
    updater.arg(&*script);
    let answer = run_runtime_step_within(updater, Duration::from_secs(30));
    assert_eq!(answer, Ok("cleaned 0 import mounts, 0 left\n".to_owned()));

    let script = temp_file("sh", b"sleep 30\n");
    let mut stuck = Command::new("/bin/sh");
    stuck.arg(&*script);
    let started = Instant::now();
    let answer = run_runtime_step_within(stuck, Duration::from_millis(200));
    assert_eq!(answer, Err(WslError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));
}

#[cfg(unix)]
#[test]
fn a_setting_copy_sends_the_choice_and_a_removal_sends_nothing() {
    let choice = "{\n  \"backend\": \"srt-wsl\",\n  \"chosenAt\": \"x\"\n}\n";
    let received = temp_file("received", b"");
    let (host, _script) = ending_with(0, &received);
    send_setting(host, SettingCopy::Save(choice)).expect("copied");
    assert_eq!(std::fs::read_to_string(&*received).expect("read"), choice);
    let (host, _script) = ending_with(0, &received);
    send_setting(host, SettingCopy::Remove).expect("removed");
    assert_eq!(std::fs::read(&*received).expect("read"), b"");
}

#[test]
fn a_refused_setting_copy_is_an_error_never_done() {
    let received = temp_file("received", b"");
    let (host, _script) = ending_with(1, &received);
    assert_eq!(
        send_setting(host, SettingCopy::Save("{}")),
        Err(WslError::Failed(Some(1)))
    );
}

fn utf16(text: &str) -> Vec<u8> {
    let mut bytes = vec![0xff, 0xfe];
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

#[test]
fn the_listing_has_the_distro_only_as_a_whole_line() {
    assert!(lists_distro(&utf16("Ubuntu\r\nhalonic\r\n")));
    assert!(lists_distro(b"halonic\n"));
    assert!(!lists_distro(&utf16("halonic-old\r\nUbuntu\r\n")));
    assert!(!lists_distro(&utf16("")));
    assert!(!lists_distro(b""));
}

#[cfg(unix)]
#[test]
fn the_distro_listing_with_a_time_limit_answers_or_is_stopped() {
    let script = temp_file("sh", b"printf 'Ubuntu\\nhalonic\\n'\n");
    let mut wsl = Command::new("/bin/sh");
    wsl.arg(&*script);
    assert_eq!(distro_listed_within(wsl, Duration::from_secs(30)), Ok(true));

    let script = temp_file("sh", b"exit 1\n");
    let mut failing = Command::new("/bin/sh");
    failing.arg(&*script);
    let answer = distro_listed_within(failing, Duration::from_secs(30));
    assert_eq!(answer, Err(WslError::Failed(Some(1))));

    let script = temp_file("sh", b"sleep 30\n");
    let mut hung = Command::new("/bin/sh");
    hung.arg(&*script);
    let started = Instant::now();
    let answer = distro_listed_within(hung, Duration::from_millis(200));
    assert_eq!(answer, Err(WslError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));
}
