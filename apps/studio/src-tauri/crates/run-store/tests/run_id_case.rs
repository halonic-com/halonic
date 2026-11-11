//! Run ids are case-sensitive, also in a folder that ignores case (on
//! Windows and macOS), where `RUN_X.jsonl` opens the log of `run_x`
//! (HAL-4749). Requirement `run-store`.

mod support;

use halonic_run_store::RunStoreError;
use support::{Scratch, appended, folders, lines};

fn refused(run_id: &str) -> RunStoreError {
    RunStoreError::OtherRunsLog {
        run_id: run_id.to_owned(),
    }
}

#[test]
fn run_store_reads_another_runs_log_through_an_id_in_another_case_as_an_unknown_run() {
    // Files planted under the other name show the store what a folder that
    // ignores case shows it, on any system.
    let scratch = Scratch::new("other-case");
    scratch.plant("RUN_X.jsonl", lines("run_x", 1, 2));
    scratch.plant("RUN_X.snapshot.json", r#"{"seq":2,"state":{"step":2}}"#);
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();

    assert_eq!(runs.events("RUN_X"), Ok(String::new()));
    assert_eq!(runs.snapshot("RUN_X"), Ok(None));
    for expected_seq in [0, 2] {
        let next = expected_seq + 1;
        assert_eq!(
            runs.append("RUN_X", expected_seq, &lines("RUN_X", next, next), None),
            Err(refused("RUN_X"))
        );
    }
    // Nothing changed, and the lock is gone again.
    let log = std::fs::read_to_string(scratch.file("RUN_X.jsonl")).unwrap();
    assert_eq!(log, lines("run_x", 1, 2));
    assert_eq!(scratch.names(), ["RUN_X.jsonl", "RUN_X.snapshot.json"]);
}

#[test]
fn run_store_tells_a_log_without_a_whole_line_by_the_folders_names() {
    // A crash on the first write of `run_x` left half a line, which can't
    // tell whose log it is.
    let scratch = Scratch::new("other-case-torn");
    let torn = r#"{"runId":"run_x","seq":1"#;
    scratch.plant("run_x.jsonl", torn);
    let folder_ignores_case = scratch.file("RUN_X.jsonl").exists();
    let folders = folders();
    let runs = folders.folder(&scratch.runs()).unwrap();
    let outcome = runs.append("RUN_X", 0, &lines("RUN_X", 1, 1), None);

    if folder_ignores_case {
        // As on Windows, where the tauri-windows job runs this: refused, unchanged.
        assert_eq!(outcome, Err(refused("RUN_X")));
        let log = std::fs::read_to_string(scratch.file("run_x.jsonl")).unwrap();
        assert_eq!(log, torn);
    } else {
        // The folder tells case apart: two runs, each in its own log.
        assert_eq!(outcome, appended(1));
        assert_eq!(scratch.names(), ["RUN_X.jsonl", "run_x.jsonl"]);
    }
}

#[test]
fn run_store_names_the_folder_and_the_log_when_it_refuses_a_run() {
    let refusal = refused("RUN_X");
    assert_eq!(refusal.kind(), "other_runs_log");
    assert_eq!(
        refusal.to_string(),
        "Run RUN_X can't be stored here: the run folder ignores case, and RUN_X.jsonl opens another run's log."
    );
}
