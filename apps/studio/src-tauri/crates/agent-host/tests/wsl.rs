//! The `wsl.exe` commands are pinned argument by argument (security review
//! W7), and the runtime archive is checked before anything starts (W2).
//! The updater's endings are tested beside `send_archive`, in `src/wsl/tests.rs`.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

use halonic_agent_host::{
    RuntimeStep, WslError, distro_host_command, file_sha256, install_runtime, runtime_command,
    wsl_exe,
};

const WSL: &str = r"C:\Windows\System32\wsl.exe"; // leak-guard: allow absolute-path fixed Windows and distro paths under test
const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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
    let name = format!("halonic-wsl-test-{}-{number}", std::process::id());
    let path = std::env::temp_dir().join(name).with_extension(extension);
    std::fs::write(&path, contents).expect("write the file");
    TempFile(path)
}

/// A path in the temporary folder that no file has.
fn missing_file() -> PathBuf {
    let number = NEXT_FILE.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "halonic-wsl-test-{}-{number}.gone",
        std::process::id()
    ))
}

fn arguments(command: &Command) -> Vec<&OsStr> {
    command.get_args().collect()
}

fn pinned(command: &Command, expected: &[&str]) {
    assert_eq!(command.get_program(), OsStr::new(WSL));
    let expected: Vec<&OsStr> = expected.iter().map(OsStr::new).collect();
    assert_eq!(arguments(command), expected);
    // None of the person's `WSLENV` variables cross into the distro.
    let environment: Vec<(&OsStr, Option<&OsStr>)> = command.get_envs().collect();
    assert_eq!(environment, vec![(OsStr::new("WSLENV"), None)]);
}

#[test]
fn wsl_launch_starts_wsl_exe_by_its_full_path_under_system_root() {
    assert_eq!(wsl_exe(Some(r"C:\Windows")), Ok(PathBuf::from(WSL))); // leak-guard: allow absolute-path fixed Windows and distro paths under test
    assert_eq!(wsl_exe(Some(r"C:\Windows\")), Ok(PathBuf::from(WSL))); // leak-guard: allow absolute-path fixed Windows and distro paths under test
    assert_eq!(
        wsl_exe(Some(r"D:\WINNT")), // leak-guard: allow absolute-path fixed Windows and distro paths under test
        Ok(PathBuf::from(r"D:\WINNT\System32\wsl.exe")) // leak-guard: allow absolute-path fixed Windows and distro paths under test
    );
}

#[test]
fn wsl_launch_refuses_a_system_root_that_isnt_a_full_drive_path() {
    for root in [
        None,
        Some(""),
        Some("Windows"),
        Some(r"\Windows"),
        Some(r"\\server\share"),
        Some("C:"),
        Some(r"C:\Windows\..\Users"), // leak-guard: allow absolute-path fixed Windows and distro paths under test
    ] {
        assert_eq!(wsl_exe(root), Err(WslError::NoSystemRoot), "{root:?}");
    }
}

#[test]
fn wsl_launch_starts_the_agent_host_in_halonics_distro_with_fixed_arguments() {
    pinned(
        &distro_host_command(Path::new(WSL)),
        &[
            "-d",
            "halonic",
            "-u",
            "halonic",
            "--cd",
            "/",
            "--exec",
            "/opt/halonic/current/bin/halonic-agent-host",
            "--profile-folder",
            concat!("/home", "/halonic/.local/share/halonic"),
        ],
    );
}

#[test]
fn wsl_launch_runs_each_updater_step_as_root_with_fixed_arguments() {
    let prefix = [
        "-d",
        "halonic",
        "-u",
        "root",
        "--cd",
        "/",
        "--exec",
        "/usr/local/sbin/halonic-runtime",
    ];
    let wsl = Path::new(WSL);
    let install = RuntimeStep::Install {
        version: "1.2.0-rc.1+b7",
        sha256: SHA,
    };
    for (step, tail) in [
        (install, vec!["install", "1.2.0-rc.1+b7", SHA]),
        (RuntimeStep::Rollback, vec!["rollback"]),
        (RuntimeStep::SecurityUpdate, vec!["security-update"]),
        (RuntimeStep::Status, vec!["status"]),
    ] {
        let expected: Vec<&str> = prefix.iter().copied().chain(tail).collect();
        pinned(
            &runtime_command(wsl, step).expect("a valid step"),
            &expected,
        );
    }
}

#[test]
fn wsl_launch_refuses_a_version_or_sha256_the_updater_wouldnt_take() {
    let wsl = Path::new(WSL);
    let too_long = "9".repeat(65);
    let bad_versions = [
        "",
        "current",
        "previous",
        ".hidden",
        "1.0 beta",
        "1/2",
        "a;b",
        "$(x)",
        too_long.as_str(),
    ];
    for version in bad_versions {
        let step = RuntimeStep::Install {
            version,
            sha256: SHA,
        };
        assert!(
            matches!(runtime_command(wsl, step), Err(WslError::BadArgument(_))),
            "{version:?}"
        );
    }
    let upper_case = SHA.to_uppercase();
    let not_hex = format!("{}g", &SHA[1..]);
    for sha256 in ["", &SHA[1..], upper_case.as_str(), not_hex.as_str()] {
        let step = RuntimeStep::Install {
            version: "1.0.0",
            sha256,
        };
        assert!(
            matches!(runtime_command(wsl, step), Err(WslError::BadArgument(_))),
            "{sha256:?}"
        );
    }
}

#[test]
fn runtime_update_reads_the_archives_sha256_on_windows() {
    let archive = temp_file("tar.gz", ARCHIVE);
    assert_eq!(file_sha256(&archive), Ok(ARCHIVE_SHA.to_owned()));
}

#[test]
fn runtime_update_sends_nothing_when_the_archives_sha256_differs() {
    let archive = temp_file("tar.gz", ARCHIVE);
    // A `wsl.exe` that doesn't exist: had it been started, the error would be `Start`.
    let never_started = missing_file();
    assert_eq!(
        install_runtime(&never_started, "1.0.0", &archive, SHA),
        Err(WslError::ChecksumDiffers)
    );
}

#[test]
fn runtime_update_refuses_an_archive_it_cant_read() {
    let missing = missing_file();
    assert!(matches!(
        install_runtime(&missing_file(), "1.0.0", &missing, ARCHIVE_SHA),
        Err(WslError::Archive(_))
    ));
}

#[test]
fn runtime_update_refuses_a_version_before_reading_the_archive() {
    let missing = missing_file();
    assert!(matches!(
        install_runtime(&missing_file(), "$(x)", &missing, ARCHIVE_SHA),
        Err(WslError::BadArgument(_))
    ));
}
