use super::{CheckResult, RecordRead, StartOutcome, UpdaterRecord, read_record, record_text};
use crate::status::{CheckFailure, JustUpdated, UpdateState};
use crate::version::Version;

fn version(text: &str) -> Version {
    Version::parse(text).expect("a version")
}

#[test]
fn update_state_record_round_trips_and_keeps_fields_it_does_not_know() {
    let text = r#"{"format":1,"automatic":false,"lastChecked":5,"addedLater":{"a":1}}"#;
    let RecordRead::Read(record) = read_record(text) else {
        panic!("a record");
    };
    assert!(!record.automatic);
    assert_eq!(record.last_checked, Some(5));
    let again = read_record(&record_text(&record));
    assert_eq!(again, RecordRead::Read(record.clone()));
    assert!(record_text(&record).contains("\"addedLater\""));
}

#[test]
fn update_state_record_never_takes_a_newer_format_or_garbage() {
    assert_eq!(
        read_record(r#"{"format":2,"automatic":false}"#),
        RecordRead::Newer
    );
    for text in [
        "",
        "{",
        "[]",
        r#"{"automatic":true}"#,
        r#"{"format":1,"automatic":"yes"}"#,
    ] {
        assert_eq!(read_record(text), RecordRead::Unreadable, "{text:?}");
    }
    let RecordRead::Read(record) = read_record(r#"{"format":1}"#) else {
        panic!("a record");
    };
    assert_eq!(record, UpdaterRecord::default());
}

#[test]
fn update_state_install_that_worked_says_so_once() {
    let mut record = UpdaterRecord::default();
    record.before_install("0.1.1", "0.1.0");
    let updated = StartOutcome::Updated(JustUpdated {
        from: "0.1.0".to_owned(),
        to: "0.1.1".to_owned(),
    });
    assert_eq!(record.after_start(&version("0.1.1")), updated);
    assert_eq!(record.after_start(&version("0.1.1")), StartOutcome::Nothing);
    assert_eq!(record.install, None);
}

#[test]
fn update_state_install_that_did_not_happen_counts_once_per_try() {
    let mut record = UpdaterRecord::default();
    let old = version("0.1.0");
    record.before_install("0.1.1", "0.1.0");
    let first = record.after_start(&old);
    assert_eq!(
        first,
        StartOutcome::DidNotInstall {
            version: "0.1.1".to_owned(),
            attempts: 1,
            counted: true
        }
    );
    // A second start without a new try doesn't count again, but still says so.
    assert_eq!(
        record.after_start(&old),
        StartOutcome::DidNotInstall {
            version: "0.1.1".to_owned(),
            attempts: 1,
            counted: false
        }
    );
    assert_eq!(
        record.starting_state(&old),
        UpdateState::DidNotInstall {
            version: "0.1.1".to_owned(),
            attempts: 1
        }
    );
    record.before_install("0.1.1", "0.1.0");
    assert_eq!(
        record.after_start(&old),
        StartOutcome::DidNotInstall {
            version: "0.1.1".to_owned(),
            attempts: 2,
            counted: true
        }
    );
}

#[test]
fn update_state_proving_a_start_keeps_the_count_of_an_install_that_did_not_happen() {
    let mut record = UpdaterRecord::default();
    record.before_install("0.1.2", "0.1.1");
    record.after_start(&version("0.1.1"));
    record.after_proved(&version("0.1.1"));
    assert_eq!(
        record.install.as_ref().map(|install| install.failures),
        Some(1)
    );
    // The version that did install clears its record.
    record.before_install("0.1.2", "0.1.1");
    record.after_proved(&version("0.1.2"));
    assert_eq!(record.install, None);
}

#[test]
fn update_state_install_record_clears_on_a_newer_version_installed_by_hand() {
    let mut record = UpdaterRecord::default();
    record.before_install("0.1.1", "0.1.0");
    assert_eq!(record.after_start(&version("0.1.2")), StartOutcome::Nothing);
    assert_eq!(record.install, None);
    // A new target starts its own count.
    record.before_install("0.1.1", "0.1.0");
    record.after_start(&version("0.1.0"));
    record.before_install("0.1.2", "0.1.0");
    assert_eq!(
        record.install.as_ref().map(|install| install.failures),
        Some(0)
    );
}

#[test]
fn update_state_stops_downloading_a_version_after_two_bad_signatures() {
    let mut record = UpdaterRecord::default();
    let bad = version("0.1.1");
    assert!(record.may_download(&bad));
    assert_eq!(record.count_bad_signature("0.1.1"), 1);
    assert!(record.may_download(&bad));
    assert_eq!(record.count_bad_signature("0.1.1"), 2);
    assert!(!record.may_download(&bad));
    assert_eq!(
        record.starting_state(&version("0.1.0")),
        UpdateState::SignatureMismatch {
            version: "0.1.1".to_owned(),
            attempts: 2
        }
    );
    // A newer version is downloaded, and resets the count.
    assert!(record.may_download(&version("0.1.2")));
    assert_eq!(record.bad_signature, None);
}

#[test]
fn update_state_starts_from_the_last_result() {
    let current = version("0.1.0");
    let mut record = UpdaterRecord::default();
    assert_eq!(record.starting_state(&current), UpdateState::NeverChecked);
    record.last_result = Some(CheckResult::CantCheck {
        reason: CheckFailure::Offline,
    });
    assert_eq!(
        record.starting_state(&current),
        UpdateState::CantCheck {
            reason: CheckFailure::Offline
        }
    );
    record.last_result = Some(CheckResult::Available {
        version: "0.1.1".to_owned(),
    });
    assert!(matches!(
        record.starting_state(&current),
        UpdateState::Available { .. }
    ));
    // Once that version runs, it is up to date.
    assert_eq!(
        record.starting_state(&version("0.1.1")),
        UpdateState::UpToDate
    );
}
