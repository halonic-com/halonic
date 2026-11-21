//! What the page is told about the security updates and the default distro.

use std::path::PathBuf;

use halonic_agent_host::{BundledRuntime, RuntimeUpdate, WslError};

use super::{
    DistroStartChecks, answer, cleanup_log, default_distro, runtime_ending, security_update_log,
};

/// 2026-11-15T12:00:00Z.
const NOW: i64 = 1_794_744_000;

fn status(stamp: &str) -> Result<String, WslError> {
    Ok(format!(
        r#"{{"current":"1.2.0","previous":"1.0.0","securityUpdated":"{stamp}"}}"#
    ))
}

fn overdue(last: Option<&str>) -> DistroStartChecks {
    DistroStartChecks {
        overdue: true,
        last: last.map(str::to_owned),
        is_default_distro: false,
    }
}

#[test]
fn updates_from_the_last_week_are_not_overdue() {
    let current = answer(status("2026-11-14T12:00:00Z"), NOW);
    assert_eq!(
        current,
        DistroStartChecks {
            overdue: false,
            last: None,
            is_default_distro: false,
        }
    );
}

#[test]
fn old_updates_are_overdue_and_say_when_they_ran() {
    assert_eq!(
        answer(status("2026-11-01T03:00:00Z"), NOW),
        overdue(Some("2026-11-01T03:00:00Z"))
    );
}

#[test]
fn updates_that_never_ran_or_a_status_that_failed_are_overdue_with_no_date() {
    assert_eq!(answer(status(""), NOW), overdue(None));
    assert_eq!(answer(Ok("not json".to_owned()), NOW), overdue(None));
    assert_eq!(answer(Err(WslError::Failed(Some(1))), NOW), overdue(None));
}

#[test]
fn the_page_gets_camel_case_fields_and_null_for_no_date() {
    let json = serde_json::to_value(overdue(None)).expect("serializes");
    assert_eq!(
        json,
        serde_json::json!({"overdue": true, "last": null, "isDefaultDistro": false})
    );
}

#[test]
fn the_default_distro_is_told_only_when_wsl_says_so() {
    assert!(default_distro(Ok(Some(true))));
    assert!(!default_distro(Ok(Some(false))));
    // Unknown is not "the default": the warning tells the person to change it.
    assert!(!default_distro(Ok(None)));
    assert!(!default_distro(Err(WslError::TimedOut)));
    assert!(!default_distro(Err(WslError::Failed(Some(1)))));
}

#[test]
fn the_cleanup_log_says_what_was_cleaned_and_why_it_didnt_finish() {
    assert_eq!(
        cleanup_log(Ok("nothing to clean up\n".to_owned())),
        "import mounts: nothing to clean up"
    );
    assert_eq!(
        cleanup_log(Ok("cleaned 1 import mounts, 0 left\n".to_owned())),
        "import mounts: cleaned 1 import mounts, 0 left"
    );
    for (error, reason) in [
        (
            WslError::MountsLeft,
            "Some import mounts could not be cleaned up.",
        ),
        (
            WslError::TimedOut,
            "The step took too long and was stopped.",
        ),
        (
            WslError::Failed(Some(1)),
            "The step ended with exit code 1.",
        ),
    ] {
        assert_eq!(
            cleanup_log(Err(error)),
            format!("import mounts: the clean-up didn't finish, starting anyway: {reason}")
        );
    }
}

/// A stand-in for `wsl.exe`: an executable shell script running `body`,
/// removed when dropped.
#[cfg(unix)]
struct StandIn(std::path::PathBuf);

#[cfg(unix)]
impl StandIn {
    fn new(body: &str) -> Self {
        use std::os::unix::fs::PermissionsExt;
        use std::sync::atomic::{AtomicUsize, Ordering};
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let number = NEXT.fetch_add(1, Ordering::Relaxed);
        let name = format!("halonic-updates-status-{}-{number}", std::process::id());
        let path = std::env::temp_dir().join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write the stand-in");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))
            .expect("make it executable");
        Self(path)
    }
}

#[cfg(unix)]
impl Drop for StandIn {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(unix)]
#[test]
fn a_status_that_hangs_is_stopped_and_counts_as_overdue_with_no_date() {
    use std::time::{Duration, Instant};

    use super::security_updates_in_distro;

    let stuck = StandIn::new("sleep 30");
    let started = Instant::now();
    let checks = security_updates_in_distro(&stuck.0, Duration::from_millis(200));
    assert_eq!(checks, overdue(None));
    assert!(started.elapsed() < Duration::from_secs(10));
}

#[test]
fn the_security_update_log_says_what_the_updater_did_and_why_it_didnt_finish() {
    assert_eq!(
        security_update_log(Ok(
            "Reading package lists...\nsecurity updates installed\n".to_owned()
        )),
        "security updates: security updates installed"
    );
    assert_eq!(
        security_update_log(Ok(
            "skipped: security updates ran in the last 24 hours\n".to_owned()
        )),
        "security updates: skipped: security updates ran in the last 24 hours"
    );
    for (error, reason) in [
        (
            WslError::Busy,
            "A sandbox session is running in the distro.",
        ),
        (
            WslError::TimedOut,
            "The step took too long and was stopped.",
        ),
        (
            WslError::Failed(Some(100)),
            "The step ended with exit code 100.",
        ),
    ] {
        assert_eq!(
            security_update_log(Err(error)),
            format!("security updates: they didn't finish, starting anyway: {reason}")
        );
    }
}

fn shipped() -> BundledRuntime {
    BundledRuntime {
        version: "0.1.1+0123456789ab".to_owned(),
        sha256: "0".repeat(64),
        archive: PathBuf::from("halonic-runtime.tar.gz"),
    }
}

/// Requirement `distro-runtime`: an installed or already current runtime,
/// or a build that ships none, lets the host start, and the log says which.
#[test]
fn the_runtime_install_logs_what_it_did_and_lets_the_host_start() {
    let installed = runtime_ending(
        Ok(Some("0.1.0")),
        Ok(Some((shipped(), RuntimeUpdate::Installed))),
    );
    assert_eq!(
        installed,
        (
            "runtime: installed 0.1.1+0123456789ab (was 0.1.0)".to_owned(),
            Ok(())
        )
    );
    let current = runtime_ending(
        Ok(Some("0.1.1+0123456789ab")),
        Ok(Some((shipped(), RuntimeUpdate::AlreadyCurrent))),
    );
    assert_eq!(
        current,
        ("runtime: 0.1.1+0123456789ab is current".to_owned(), Ok(()))
    );
    let none_shipped = runtime_ending(Ok(Some("0.1.0")), Ok(None));
    assert_eq!(
        none_shipped,
        (
            "runtime: this build ships none, keeping the distro's (0.1.0)".to_owned(),
            Ok(())
        )
    );
}

/// Requirement `distro-runtime`: a failed install refuses the start only
/// when `status` answered that the distro has no runtime to start.
#[test]
fn a_failed_runtime_install_refuses_the_start_only_with_no_runtime_left() {
    let (line, outcome) = runtime_ending(Ok(Some("0.1.0")), Err(WslError::TimedOut));
    assert_eq!(
        line,
        "runtime: couldn't install this build's, starting the distro's (0.1.0): \
         The step took too long and was stopped."
    );
    assert_eq!(outcome, Ok(()));

    let (line, outcome) = runtime_ending(Ok(None), Err(WslError::ChecksumDiffers));
    let reason = "the runtime couldn't be installed in Halonic's WSL distro: \
                  The runtime archive isn't the one this release expects.";
    assert_eq!(line, format!("runtime: {reason}"));
    assert_eq!(outcome, Err(reason.to_owned()));
}

/// Requirement `distro-runtime`: a `status` that couldn't be read doesn't
/// say the distro has no runtime, so a failed install still lets the host
/// start, and the log says why (HAL-15147).
#[test]
fn a_failed_runtime_install_starts_the_host_when_status_couldnt_be_read() {
    let unread = WslError::TimedOut;
    let (line, outcome) = runtime_ending(Err(&unread), Err(WslError::ChecksumDiffers));
    assert_eq!(
        line,
        "runtime: couldn't install this build's, starting the distro's \
         (unknown, its status couldn't be read: The step took too long and was stopped.): \
         The runtime archive isn't the one this release expects."
    );
    assert_eq!(outcome, Ok(()));
}
