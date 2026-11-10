//! The run folder's files, as `FolderRunStore` in `fs-node` keeps them.
//! Requirement `run-store`.

mod support;

use halonic_run_store::{AppendOutcome, RunLog, RunStoreError, StoredSnapshot, is_run_id};
use support::{Scratch, folders, lines};

fn appended(last_seq: u64) -> Result<AppendOutcome, RunStoreError> {
    Ok(AppendOutcome::Appended {
        last_seq,
        snapshot_error: None,
    })
}

#[test]
fn run_store_appends_lines_and_reads_them_back() {
    let scratch = Scratch::new("append");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    assert_eq!(runs.events("r1"), Ok(String::new()));

    assert_eq!(runs.append("r1", 0, &lines("r1", 1, 2), None), appended(2));
    assert_eq!(runs.append("r1", 2, &lines("r1", 3, 3), None), appended(3));
    assert_eq!(runs.events("r1"), Ok(lines("r1", 1, 3)));
    // The lock is released again, and nothing else is left.
    assert_eq!(scratch.names(), ["r1.jsonl"]);
}

#[test]
fn run_store_refuses_an_append_whose_expected_seq_is_not_the_last() {
    let scratch = Scratch::new("conflict");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    assert_eq!(
        runs.append("r1", 1, &lines("r1", 2, 2), None),
        Ok(AppendOutcome::Conflict { last_seq: 0 })
    );
    runs.append("r1", 0, &lines("r1", 1, 1), None).unwrap();
    assert_eq!(
        runs.append("r1", 0, &lines("r1", 1, 1), None),
        Ok(AppendOutcome::Conflict { last_seq: 1 })
    );
    assert_eq!(runs.events("r1"), Ok(lines("r1", 1, 1)));
}

#[test]
fn run_store_leaves_out_a_torn_last_line_and_cuts_it_off_before_an_append() {
    let scratch = Scratch::new("torn");
    let torn = format!("{}{{\"runId\":\"r1\",\"seq\":2", lines("r1", 1, 1));
    scratch.plant("r1.jsonl", &torn);
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    assert_eq!(runs.events("r1"), Ok(lines("r1", 1, 1)));

    assert_eq!(runs.append("r1", 1, &lines("r1", 2, 2), None), appended(2));
    let log = std::fs::read_to_string(scratch.file("r1.jsonl")).unwrap();
    assert_eq!(log, lines("r1", 1, 2));
}

#[test]
fn run_store_keeps_the_snapshot_and_gives_it_with_the_log_s_length() {
    let scratch = Scratch::new("snapshot");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    assert_eq!(runs.snapshot("r1"), Ok(None));

    let snapshot = r#"{"seq":2,"state":{"at":"s"}}"#;
    assert_eq!(
        runs.append("r1", 0, &lines("r1", 1, 2), Some(snapshot)),
        appended(2)
    );
    assert_eq!(
        runs.snapshot("r1"),
        Ok(Some(StoredSnapshot {
            text: snapshot.to_owned(),
            log_events: 2,
        }))
    );
    // Written through a temporary file, which is gone again.
    assert_eq!(scratch.names(), ["r1.jsonl", "r1.snapshot.json"]);
}

#[test]
fn run_store_drops_a_snapshot_left_from_a_deleted_log_when_a_run_starts() {
    let scratch = Scratch::new("old-snapshot");
    scratch.plant("r1.snapshot.json", r#"{"seq":5,"state":{}}"#);
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    runs.append("r1", 0, &lines("r1", 1, 1), None).unwrap();
    assert_eq!(runs.snapshot("r1"), Ok(None));
}

#[test]
fn run_store_stores_the_events_when_the_snapshot_can_t_be_written() {
    let scratch = Scratch::new("snapshot-error");
    scratch.plant("r1.jsonl", lines("r1", 1, 1));
    // A folder where the snapshot goes: the rename over it fails.
    std::fs::create_dir_all(scratch.file("r1.snapshot.json")).unwrap();
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    let outcome = runs.append("r1", 1, &lines("r1", 2, 2), Some(r#"{"seq":2,"state":{}}"#));
    let Ok(AppendOutcome::Appended {
        last_seq: 2,
        snapshot_error: Some(error),
    }) = outcome
    else {
        panic!("expected an append with a snapshot error, got {outcome:?}");
    };
    assert_eq!(error.kind(), "io");
    assert_eq!(runs.events("r1"), Ok(lines("r1", 1, 2)));
    assert_eq!(scratch.names(), ["r1.jsonl", "r1.snapshot.json"]);
}

#[test]
fn run_store_lists_the_logs_of_valid_run_ids_only() {
    let scratch = Scratch::new("logs");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    assert_eq!(runs.logs(), Ok(Vec::new()));

    scratch.plant("r2.jsonl", lines("r2", 1, 1));
    scratch.plant("r1.jsonl", lines("r1", 1, 2));
    scratch.plant("r1.snapshot.json", "{}");
    scratch.plant(".hidden.jsonl", lines(".hidden", 1, 1));
    scratch.plant("r 3.jsonl", lines("r 3", 1, 1));
    scratch.plant("notes.txt", "");
    assert_eq!(
        runs.logs(),
        Ok(vec![
            RunLog {
                run_id: "r1".to_owned(),
                lines: lines("r1", 1, 2),
            },
            RunLog {
                run_id: "r2".to_owned(),
                lines: lines("r2", 1, 1),
            },
        ])
    );
}

#[test]
fn run_store_refuses_a_log_that_is_not_utf8_text() {
    let scratch = Scratch::new("broken");
    scratch.plant("r1.jsonl", b"{\"runId\":\"r1\xff\"}\n");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    let broken = RunStoreError::BrokenLog {
        file: "r1.jsonl".to_owned(),
    };
    assert_eq!(runs.events("r1"), Err(broken.clone()));
    assert_eq!(
        runs.append("r1", 1, &lines("r1", 2, 2), None),
        Err(broken.clone())
    );
    assert_eq!(
        broken.to_string(),
        "Broken run log r1.jsonl: it is not valid UTF-8 text."
    );
}

#[test]
fn run_store_refuses_unsafe_run_ids_and_lines_that_aren_t_whole() {
    let scratch = Scratch::new("refuse");
    let folders = folders();
    let runs = folders.folder(scratch.runs());
    for run_id in ["", ".hidden", "../r1", "a/b", "a\\b", "NUL.jsonl", "ré"] {
        let refused = RunStoreError::InvalidRunId {
            run_id: run_id.to_owned(),
        };
        assert_eq!(
            runs.append(run_id, 0, &lines("r1", 1, 1), None),
            Err(refused.clone())
        );
        assert_eq!(runs.events(run_id), Err(refused.clone()));
        assert_eq!(runs.snapshot(run_id), Err(refused));
    }
    for torn in ["", "\n", "{}", "{}\n\n{}\n", "{}\n{}"] {
        assert_eq!(
            runs.append("r1", 0, torn, None),
            Err(RunStoreError::InvalidLines)
        );
    }
    // Nothing was created.
    assert!(!scratch.runs().exists());
}

#[test]
fn run_store_takes_the_run_id_rule_of_the_run_store_port() {
    let long = "a".repeat(128);
    for run_id in [
        "r1",
        "run_2026-01-01.a",
        "_r",
        "-r",
        long.as_str(),
        "con1",
        "nulls",
        "com10",
    ] {
        assert!(is_run_id(run_id), "{run_id:?} is a run id");
    }
    let too_long = "a".repeat(129);
    let refused = [
        "",
        ".hidden",
        "..",
        "../r1",
        "a/b",
        "a\\b",
        "/r1",
        "r 1",
        "ré",
        too_long.as_str(),
        "con",
        "NUL.jsonl",
        "Com1",
        "lpt9.x",
    ];
    for run_id in refused {
        assert!(!is_run_id(run_id), "{run_id:?} is not a run id");
    }
}
