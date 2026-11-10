use super::{
    FoundLock, LockRecord, STALE_AFTER_MS, TAKEOVER_STALE_AFTER_MS, is_stale, parse_record,
    record_text,
};
use crate::iso_time::parse_iso;
use serde_json::Value;

/// The cases `fs-node`'s `run-lock.test.ts` reads too.
fn shared_cases() -> Value {
    let text = include_str!("../tests/fixtures/run-lock-cases.json");
    serde_json::from_str(text).expect("the shared cases are JSON")
}

fn time(value: &Value) -> i64 {
    parse_iso(value.as_str().expect("a time")).expect("a time Rust reads")
}

#[test]
fn run_lock_uses_the_same_limits_as_fs_node() {
    let shared = shared_cases();
    assert_eq!(shared["staleAfterMs"].as_i64(), Some(STALE_AFTER_MS));
    assert_eq!(
        shared["takeoverStaleAfterMs"].as_i64(),
        Some(TAKEOVER_STALE_AFTER_MS)
    );
}

#[test]
fn run_lock_judges_the_shared_cases_as_fs_node_does() {
    let shared = shared_cases();
    let now = time(&shared["now"]);
    let this_host = shared["thisHost"].as_str();
    let running = shared["runningPids"].as_array().expect("running ids");
    let process_runs = |pid: u32| running.contains(&Value::from(pid));
    for case in shared["cases"].as_array().expect("cases") {
        let name = case["name"].as_str().expect("a name");
        let text = case["text"].as_str().expect("a text").to_owned();
        let changed_at = if case["changedAt"].is_null() {
            now
        } else {
            time(&case["changedAt"])
        };
        let found = FoundLock::new(text, changed_at);
        let stale = is_stale(&found, now, this_host, process_runs);
        assert_eq!(stale, case["stale"].as_bool().expect("stale"), "{name}");
    }
}

#[test]
fn run_lock_reads_and_writes_the_record_exactly_as_fs_node_does() {
    let shared = &shared_cases()["record"];
    let pid = shared["pid"].as_u64().expect("an id");
    let host = shared["host"].as_str().expect("a host");
    let taken_at = shared["takenAt"].as_str().expect("a time");
    let text = shared["text"].as_str().expect("a text");
    let written = record_text(
        u32::try_from(pid).expect("a 32-bit id"),
        host,
        time(&shared["takenAt"]),
    );
    assert_eq!(written, text);
    let read = LockRecord {
        pid: pid as i64,
        host: host.into(),
        taken_at: taken_at.into(),
    };
    assert_eq!(parse_record(text), Some(read));
}
