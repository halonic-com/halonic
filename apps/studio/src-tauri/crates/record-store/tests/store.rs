//! The record folder's files, as `FileRecordStore` in `fs-node` keeps them.
//! Requirement `record-store`.

mod support;

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use halonic_record_store::{RecordStoreError, ReplaceOutcome, Written, log_name};
use support::{Scratch, THIS_HOST, change, folders, lines};

/// The logs of `leads` and `Leads`, as `fs-node` names them: the SHA-256 of
/// each name's UTF-16 code units, little-endian.
const LEADS_LOG: &str = "fe430a69f415084324c1098aa04ef602dce153539e6fb04888e9b6f75c1b1003.jsonl";
const CAPITAL_LEADS_LOG: &str =
    "95eebf408f1f8f2cee4ea0ecfc29e65bdd73b99911d324d8ddf4881f8997cca4.jsonl";

fn done<T>(outcome: T) -> Result<Written<T>, RecordStoreError> {
    Ok(Written {
        outcome,
        release_error: None,
    })
}

#[test]
fn record_store_names_each_log_by_the_hash_of_its_collection() {
    let scratch = Scratch::new("names");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    let appended = records.append(&[
        lines("leads", change("leads", "1")),
        lines("Leads", change("Leads", "1")),
    ]);
    assert_eq!(appended, done(()));
    assert_eq!(log_name("leads"), LEADS_LOG);
    // Two logs, and the write lock is gone again.
    assert_eq!(scratch.names(), [CAPITAL_LEADS_LOG, LEADS_LOG]);
    assert_eq!(records.read("leads").unwrap().lines, change("leads", "1"));
    assert_eq!(records.read("Leads").unwrap().lines, change("Leads", "1"));
}

#[test]
fn record_store_appends_in_order_and_reads_a_missing_log_as_no_lines() {
    let scratch = Scratch::new("order");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    let empty = records.read("leads").unwrap();
    assert_eq!(empty.lines, "");
    assert_eq!(empty.file, scratch.records().join(LEADS_LOG));

    let both = format!("{}{}", change("leads", "1"), change("leads", "2"));
    records.append(&[lines("leads", both.clone())]).unwrap();
    records
        .append(&[lines("leads", change("leads", "3"))])
        .unwrap();
    assert_eq!(
        records.read("leads").unwrap().lines,
        format!("{both}{}", change("leads", "3"))
    );
}

#[test]
fn record_store_leaves_out_a_torn_last_line_and_cuts_it_off_before_an_append() {
    let scratch = Scratch::new("torn");
    scratch.plant(LEADS_LOG, format!("{}{{\"at\":", change("leads", "1")));
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    assert_eq!(records.read("leads").unwrap().lines, change("leads", "1"));

    records
        .append(&[lines("leads", change("leads", "2"))])
        .unwrap();
    let log = std::fs::read_to_string(scratch.records().join(LEADS_LOG)).unwrap();
    assert_eq!(
        log,
        format!("{}{}", change("leads", "1"), change("leads", "2"))
    );
}

#[test]
fn record_store_refuses_a_log_that_isnt_utf8() {
    let scratch = Scratch::new("utf8");
    scratch.plant(LEADS_LOG, b"\xff\n");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    assert_eq!(
        records.read("leads"),
        Err(RecordStoreError::BrokenLog {
            file: scratch.records().join(LEADS_LOG)
        })
    );
}

#[test]
fn record_store_refuses_lines_that_arent_whole_changes_to_the_collection() {
    let scratch = Scratch::new("lines");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    let torn = change("leads", "1").trim_end().to_owned();
    for text in [
        String::new(),
        torn,
        format!("{}\n", change("leads", "1")),
        change("orders", "1"),
        "[]\n".to_owned(),
    ] {
        let refused = records.append(&[lines("leads", text.clone())]);
        assert_eq!(refused.unwrap_err().kind(), "invalid_lines", "{text:?}");
    }
    // Refused before anything is written, the folder too.
    assert!(!scratch.records().exists());
}

#[test]
fn record_store_replaces_a_log_only_at_the_version_read() {
    let scratch = Scratch::new("replace");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    records
        .append(&[lines("leads", change("leads", "1"))])
        .unwrap();
    let read = records.read("leads").unwrap();
    records
        .append(&[lines("leads", change("leads", "2"))])
        .unwrap();

    let stale = records.replace("leads", &read.version, &change("leads", "seed"));
    assert_eq!(stale, done(ReplaceOutcome::Changed));
    let current = records.read("leads").unwrap();
    assert_eq!(
        current.lines,
        format!("{}{}", change("leads", "1"), change("leads", "2"))
    );

    let replaced = records.replace("leads", &current.version, &change("leads", "seed"));
    assert_eq!(replaced, done(ReplaceOutcome::Replaced));
    assert_eq!(
        records.read("leads").unwrap().lines,
        change("leads", "seed")
    );
    assert_eq!(scratch.names(), [LEADS_LOG]);
}

#[test]
fn record_store_removes_a_log_replaced_with_no_lines() {
    let scratch = Scratch::new("remove");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    records
        .append(&[lines("leads", change("leads", "1"))])
        .unwrap();
    let read = records.read("leads").unwrap();
    assert_eq!(
        records.replace("leads", &read.version, ""),
        done(ReplaceOutcome::Replaced)
    );
    assert_eq!(scratch.names(), Vec::<String>::new());
    assert_eq!(records.read("leads").unwrap().lines, "");
}

#[test]
fn record_store_waits_while_another_process_holds_the_write_lock() {
    let scratch = Scratch::new("lock");
    std::fs::create_dir_all(scratch.records()).unwrap();
    let lock = scratch.records().join("write.lock");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    // A live writer: this process on this computer, so the lock isn't stale.
    let record = halonic_run_lock::record_text(std::process::id(), THIS_HOST, now);
    std::fs::write(&lock, record).unwrap();
    let release = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        std::fs::remove_file(lock).unwrap();
    });

    let started = Instant::now();
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    records
        .append(&[lines("leads", change("leads", "1"))])
        .unwrap();
    assert!(started.elapsed() >= Duration::from_millis(200));
    release.join().unwrap();
    assert_eq!(scratch.names(), [LEADS_LOG]);
}

#[test]
fn record_store_cuts_back_every_log_when_an_append_fails() {
    let scratch = Scratch::new("cut-back");
    let folders = folders();
    let records = folders.folder(&scratch.records()).unwrap();
    records
        .append(&[lines("leads", change("leads", "1"))])
        .unwrap();
    // A folder where the log of `orders` would be: its append fails.
    std::fs::create_dir_all(scratch.records().join(log_name("orders"))).unwrap();

    let failed = records.append(&[
        lines("leads", change("leads", "2")),
        lines("orders", change("orders", "1")),
    ]);
    assert_eq!(failed.unwrap_err().kind(), "linked_log");
    assert_eq!(records.read("leads").unwrap().lines, change("leads", "1"));
}

#[cfg(unix)]
mod unix {
    use std::fs;
    use std::os::unix::fs::{PermissionsExt, symlink};

    use super::{LEADS_LOG, Scratch, change, folders, lines};

    fn mode(path: &std::path::Path) -> u32 {
        fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn record_store_keeps_the_folder_and_logs_private() {
        let scratch = Scratch::new("modes");
        let folders = folders();
        let records = folders.folder(&scratch.records()).unwrap();
        records
            .append(&[lines("leads", change("leads", "1"))])
            .unwrap();
        assert_eq!(mode(&scratch.records()), 0o700);
        assert_eq!(mode(&scratch.records().join(LEADS_LOG)), 0o600);
        let read = records.read("leads").unwrap();
        records
            .replace("leads", &read.version, &change("leads", "seed"))
            .unwrap();
        assert_eq!(mode(&scratch.records().join(LEADS_LOG)), 0o600);
    }

    /// A log that is `link` to a file outside holding one change.
    fn linked_log(name: &str, link: impl Fn(&std::path::Path, &std::path::Path)) {
        let scratch = Scratch::new(name);
        let outside = scratch.path().join("elsewhere.jsonl");
        fs::write(&outside, change("leads", "outside")).unwrap();
        fs::create_dir_all(scratch.records()).unwrap();
        link(&outside, &scratch.records().join(LEADS_LOG));
        let folders = folders();
        let records = folders.folder(&scratch.records()).unwrap();

        assert_eq!(records.read("leads").unwrap_err().kind(), "linked_log");
        let appended = records.append(&[lines("leads", change("leads", "1"))]);
        assert_eq!(appended.unwrap_err().kind(), "linked_log");
        let replaced = records.replace("leads", "any", "");
        assert_eq!(replaced.unwrap_err().kind(), "linked_log");
        assert_eq!(
            fs::read_to_string(&outside).unwrap(),
            change("leads", "outside")
        );
    }

    #[test]
    fn record_store_refuses_a_log_that_is_a_symbolic_link() {
        linked_log("symlink", |outside, log| symlink(outside, log).unwrap());
    }

    #[test]
    fn record_store_refuses_a_log_that_is_a_hard_link() {
        linked_log("hard-link", |outside, log| {
            fs::hard_link(outside, log).unwrap()
        });
    }

    #[test]
    fn record_store_refuses_a_log_that_is_a_link_to_nothing() {
        let scratch = Scratch::new("dangling");
        fs::create_dir_all(scratch.records()).unwrap();
        let missing = scratch.path().join("missing.jsonl");
        symlink(&missing, scratch.records().join(LEADS_LOG)).unwrap();
        let folders = folders();
        let records = folders.folder(&scratch.records()).unwrap();
        let appended = records.append(&[lines("leads", change("leads", "1"))]);
        assert_eq!(appended.unwrap_err().kind(), "linked_log");
        assert!(!missing.exists());
    }
}
