//! Requirement `studio.src-tauri.crates.action-send.action-records`.
//!
//! Each request's record is one user-only file of events the allow-list
//! takes. These tests write to a scratch folder of their own.

use std::fs;
use std::path::PathBuf;

use halonic_action_send::{
    KEEP_FINISHED_SECONDS, MAX_RECORD_BYTES, RecordError, RecordFiles, check_record_event,
    seconds_of,
};
use serde_json::{Value, json};

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("action-records-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        Self(folder)
    }

    fn records(&self) -> PathBuf {
        self.0.join("action-records")
    }

    fn files(&self) -> RecordFiles {
        RecordFiles::new(self.records())
    }

    fn names(&self) -> Vec<String> {
        let Ok(entries) = fs::read_dir(self.records()) else {
            return Vec::new();
        };
        entries
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect()
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

const AT: &str = "2026-11-25T09:00:00.000Z";

fn started(request: &str, step: u32) -> Value {
    json!({"type": "action.step.started", "request": request, "at": AT, "step": step})
}

fn finished(request: &str) -> Value {
    json!({"type": "action.finished", "request": request, "at": AT, "outcome": "succeeded"})
}

fn now() -> u64 {
    seconds_of(AT).expect("a UTC time")
}

#[test]
fn a_record_reads_back_oldest_first_apart_from_another_requests() {
    let scratch = Scratch::new("order");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    files.append(&started("req-2", 1)).expect("written");
    files.append(&finished("req-1")).expect("written");
    let record = files.read("req-1", now()).expect("read");
    assert_eq!(record.events, [started("req-1", 1), finished("req-1")]);
    assert_eq!(
        files.read("req-2", now()).expect("read").events,
        [started("req-2", 1)]
    );
    assert_eq!(
        files.read("req-3", now()).expect("read").events,
        Vec::<Value>::new()
    );
}

#[test]
fn an_event_with_an_extra_field_is_refused_and_nothing_is_written() {
    let scratch = Scratch::new("extra-field");
    let files = scratch.files();
    let mut smuggled = started("req-1", 1);
    smuggled["authorization"] = json!("acme-fake-token");
    let refused = files.append(&smuggled).expect_err("refused");
    assert_eq!(refused.kind(), "refused-event");
    assert_eq!(
        refused,
        RecordError::Refused(vec!["authorization: not allowed".to_owned()])
    );
    assert!(!refused.to_string().contains("acme-fake-token"));
    assert_eq!(scratch.names(), Vec::<String>::new(), "no folder, no file");
    assert_eq!(
        files.read("req-1", now()).expect("read").events,
        Vec::<Value>::new()
    );
}

/// The cases `checkActionEvent` is checked against in the adapter's tests.
fn shared_cases(group: &str) -> Vec<(String, Value)> {
    let golden: Value = serde_json::from_str(include_str!(
        "../../../../../../packages/adapters/action-send-tauri/src/golden/record-events.json"
    ))
    .expect("the shared cases are JSON");
    golden[group]
        .as_array()
        .expect("a list of cases")
        .iter()
        .map(|case| (case["case"].to_string(), case["event"].clone()))
        .collect()
}

#[test]
fn the_allow_list_matches_check_action_event() {
    for (case, event) in shared_cases("refused") {
        assert!(check_record_event(&event).is_err(), "refused: {case}");
    }
    for (case, event) in shared_cases("taken") {
        assert_eq!(check_record_event(&event), Ok(()), "taken: {case}");
    }
}

#[test]
fn a_request_id_never_names_a_path() {
    let scratch = Scratch::new("names");
    let files = scratch.files();
    files.append(&started("../../escape", 1)).expect("written");
    let names = scratch.names();
    assert_eq!(names.len(), 1);
    let name = &names[0];
    assert!(
        name.ends_with(".jsonl") && name.len() == 64 + ".jsonl".len(),
        "{name}"
    );
    assert!(!scratch.0.join("escape").exists());
    assert_eq!(
        files.read("../../escape", now()).expect("read").events,
        [started("../../escape", 1)]
    );
    let refused = files.read("req\u{0}1", now()).expect_err("refused");
    assert_eq!(refused.kind(), "refused-event");
}

#[cfg(unix)]
#[test]
fn the_folder_and_the_files_are_the_users_only() {
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    let scratch = Scratch::new("private");
    fs::create_dir_all(scratch.records()).expect("made");
    fs::set_permissions(scratch.records(), fs::Permissions::from_mode(0o755)).expect("widened");
    scratch
        .files()
        .append(&started("req-1", 1))
        .expect("written");
    let mode = |path: &Path| fs::metadata(path).expect("there").permissions().mode() & 0o777;
    assert_eq!(mode(&scratch.records()), 0o700);
    let file = scratch.records().join(&scratch.names()[0]);
    assert_eq!(mode(&file), 0o600);
}

#[cfg(unix)]
#[test]
fn a_link_in_a_records_place_is_refused_not_followed() {
    let scratch = Scratch::new("link");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    let elsewhere = scratch.0.join("elsewhere.jsonl");
    fs::write(&elsewhere, "").expect("written");
    fs::remove_file(&file).expect("removed");
    std::os::unix::fs::symlink(&elsewhere, &file).expect("linked");
    assert_eq!(
        files
            .append(&started("req-1", 2))
            .expect_err("refused")
            .kind(),
        "storage"
    );
    assert_eq!(
        files.read("req-1", now()).expect_err("refused").kind(),
        "storage"
    );
    assert_eq!(fs::read_to_string(&elsewhere).expect("read"), "");
}

#[cfg(unix)]
#[test]
fn a_hard_link_in_a_records_place_is_refused_not_written() {
    let scratch = Scratch::new("hard-link");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    let elsewhere = scratch.0.join("workspace-file.jsonl");
    fs::write(&elsewhere, "").expect("written");
    fs::remove_file(&file).expect("removed");
    fs::hard_link(&elsewhere, &file).expect("linked");
    assert_eq!(
        files
            .append(&started("req-1", 2))
            .expect_err("refused")
            .kind(),
        "storage"
    );
    assert_eq!(
        files.read("req-1", now()).expect_err("refused").kind(),
        "storage"
    );
    assert_eq!(fs::read_to_string(&elsewhere).expect("read"), "");
}

#[cfg(unix)]
#[test]
#[allow(
    clippy::disallowed_methods,
    reason = "a Unix-only test: mkfifo opens no console window"
)]
fn a_named_pipe_in_a_records_place_is_refused_without_waiting() {
    let scratch = Scratch::new("pipe");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    fs::remove_file(&file).expect("removed");
    let made = std::process::Command::new("mkfifo")
        .arg(&file)
        .status()
        .expect("mkfifo runs");
    assert!(made.success(), "mkfifo makes the pipe");
    // An open that waited on the pipe would hang the records lock forever,
    // so the calls run on their own thread and the test gives them five
    // seconds.
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let appended = files.append(&started("req-1", 2)).map_err(|e| e.kind());
        let read = files.read("req-1", now()).map_err(|e| e.kind());
        let _ = sender.send((appended, read.map(|record| record.events.len())));
    });
    let (appended, read) = receiver
        .recv_timeout(std::time::Duration::from_secs(5))
        .expect("refused without waiting");
    assert_eq!(appended, Err("storage"));
    assert_eq!(read, Err("storage"));
}

#[cfg(unix)]
#[test]
fn a_linked_records_folder_is_refused_not_followed() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("linked-folder");
    let elsewhere = scratch.0.join("workspace");
    fs::create_dir_all(&elsewhere).expect("made");
    fs::set_permissions(&elsewhere, fs::Permissions::from_mode(0o755)).expect("set");
    std::os::unix::fs::symlink(&elsewhere, scratch.records()).expect("linked");
    let files = scratch.files();
    assert_eq!(
        files
            .append(&started("req-1", 1))
            .expect_err("refused")
            .kind(),
        "storage"
    );
    assert_eq!(
        files.read("req-1", now()).expect_err("refused").kind(),
        "storage"
    );
    let (deleted, problems) = files.sweep(now());
    assert_eq!((deleted, problems.len()), (0, 1));
    assert_eq!(fs::read_dir(&elsewhere).expect("there").count(), 0);
    let mode = fs::metadata(&elsewhere)
        .expect("there")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o755, "the link's target is left as it was");
}

#[test]
fn a_planted_record_is_read_only_up_to_the_limit() {
    let scratch = Scratch::new("planted");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    let mut text = fs::read_to_string(&file).expect("read");
    let padding = usize::try_from(MAX_RECORD_BYTES).expect("fits");
    text.push_str(&" ".repeat(padding));
    text.push_str(&format!("\n{}\n", started("req-1", 2)));
    fs::write(&file, text).expect("written");
    let record = files.read("req-1", now()).expect("read");
    assert_eq!(record.events, [started("req-1", 1)]);
}

#[test]
fn lines_the_allow_list_no_longer_takes_are_dropped_on_reading() {
    let scratch = Scratch::new("hand-edit");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    let mut text = fs::read_to_string(&file).expect("read");
    text.push_str("{\"type\":\"action.step.started\",\"request\":\"req-1\",\"at\":\"");
    text.push_str(AT);
    text.push_str("\",\"step\":2,\"token\":\"acme-fake-token\"}\nnot json\n");
    text.push_str(&format!("{}\n", started("req-2", 1)));
    fs::write(&file, text).expect("written");
    let record = files.read("req-1", now()).expect("read");
    assert_eq!(record.events, [started("req-1", 1)]);
    assert_eq!(record.dropped, 3);
}

#[test]
fn a_finished_record_is_deleted_ninety_days_after_its_end() {
    let scratch = Scratch::new("retention");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    files.append(&finished("req-1")).expect("written");
    files.append(&started("req-2", 1)).expect("written");
    let day_before = now() + KEEP_FINISHED_SECONDS - 1;
    assert_eq!(
        files.read("req-1", day_before).expect("read").events.len(),
        2
    );
    assert_eq!(files.sweep(day_before), (0, Vec::new()));
    let ninety_days = now() + KEEP_FINISHED_SECONDS;
    assert_eq!(
        files.read("req-1", ninety_days).expect("read").events,
        Vec::<Value>::new()
    );
    assert_eq!(
        scratch.names().len(),
        1,
        "only the unfinished request's record is left"
    );
    files.append(&finished("req-2")).expect("written");
    assert_eq!(files.sweep(ninety_days), (1, Vec::new()));
    assert_eq!(scratch.names(), Vec::<String>::new());
}

#[test]
fn a_full_record_takes_no_more() {
    let scratch = Scratch::new("full");
    let files = scratch.files();
    files.append(&started("req-1", 1)).expect("written");
    let file = scratch.records().join(&scratch.names()[0]);
    let padding = usize::try_from(MAX_RECORD_BYTES).expect("fits") - 10;
    fs::write(&file, " ".repeat(padding)).expect("written");
    assert_eq!(files.append(&started("req-1", 2)), Err(RecordError::Full));
    assert_eq!(fs::metadata(&file).expect("there").len(), padding as u64);
}

#[test]
fn times_count_from_1970() {
    assert_eq!(seconds_of("1970-01-01T00:00:00Z"), Some(0));
    assert_eq!(seconds_of("2000-03-01T00:00:00.5Z"), Some(951_868_800));
    assert_eq!(seconds_of("2026-11-25T09:00:00.000Z"), Some(1_795_597_200));
    assert_eq!(seconds_of("2026-13-01T00:00:00Z"), None);
    assert_eq!(seconds_of("2026-11-25 09:00:00Z"), None);
}
