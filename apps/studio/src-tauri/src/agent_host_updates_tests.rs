//! What the page is told about the security updates and the default distro.

use halonic_agent_host::WslError;

use super::{DistroStartChecks, answer, cleanup_log, default_distro};

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
