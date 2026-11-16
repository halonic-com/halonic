//! What the page is told about the security updates.

use halonic_agent_host::WslError;

use super::{SecurityUpdatesAnswer, answer};

/// 2026-11-15T12:00:00Z.
const NOW: i64 = 1_794_744_000;

fn status(stamp: &str) -> Result<String, WslError> {
    Ok(format!(
        r#"{{"current":"1.2.0","previous":"1.0.0","securityUpdated":"{stamp}"}}"#
    ))
}

fn overdue(last: Option<&str>) -> SecurityUpdatesAnswer {
    SecurityUpdatesAnswer {
        overdue: true,
        last: last.map(str::to_owned),
    }
}

#[test]
fn updates_from_the_last_week_are_not_overdue() {
    let current = answer(status("2026-11-14T12:00:00Z"), NOW);
    assert_eq!(
        current,
        SecurityUpdatesAnswer {
            overdue: false,
            last: None
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
    assert_eq!(json, serde_json::json!({"overdue": true, "last": null}));
}
