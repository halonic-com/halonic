//! The shared run-store cases (`contracts.run-store-shared` in
//! `packages/testing/contracts`) on real files: two stores on one run
//! folder, as a CLI and the desktop app have it, keep the `expectedSeq`
//! guarantee between them, and a lock a crashed writer left doesn't block
//! the run. Requirement `run-store`.

mod support;

use std::sync::Barrier;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use halonic_run_lock::{STALE_AFTER_MS, record_text};
use halonic_run_store::{AppendOutcome, RunFolders};
use support::{FakeComputer, Scratch, THIS_HOST, appended, folders, lines};

/// A process id that doesn't run on the fake computer.
const GONE_PID: u32 = 4_000_000;

fn now_ms() -> i64 {
    let since_1970 = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    i64::try_from(since_1970.as_millis()).unwrap()
}

#[test]
fn run_store_lets_exactly_one_of_two_stores_win_each_round() {
    let scratch = Scratch::new("shared-race");
    let (cli, desktop) = (folders(), folders());
    cli.folder(&scratch.runs())
        .unwrap()
        .append("r1", 0, &lines("r1", 1, 1), None)
        .unwrap();

    const ROUNDS: u64 = 10;
    let start = Barrier::new(2);
    let race = |folders: &RunFolders<FakeComputer>| {
        let runs = folders.folder(&scratch.runs()).unwrap();
        (1..=ROUNDS)
            .map(|round| {
                start.wait();
                let outcome = runs.append("r1", round, &lines("r1", round + 1, round + 1), None);
                // Both have tried before either goes on to the next round.
                start.wait();
                outcome.unwrap()
            })
            .collect::<Vec<_>>()
    };
    let (cli_outcomes, desktop_outcomes) = thread::scope(|scope| {
        let cli_side = scope.spawn(|| race(&cli));
        let desktop_side = scope.spawn(|| race(&desktop));
        (cli_side.join().unwrap(), desktop_side.join().unwrap())
    });

    for (round, outcomes) in (1..=ROUNDS).zip(cli_outcomes.iter().zip(&desktop_outcomes)) {
        let won = appended(round + 1).unwrap();
        let lost = AppendOutcome::Conflict {
            last_seq: round + 1,
        };
        assert!(
            outcomes == (&won, &lost) || outcomes == (&lost, &won),
            "round {round}: {outcomes:?}"
        );
    }
    let log = cli.folder(&scratch.runs()).unwrap().events("r1").unwrap();
    assert_eq!(log, lines("r1", 1, ROUNDS + 1));
}

#[test]
fn run_store_removes_a_lock_whose_process_no_longer_runs() {
    let scratch = Scratch::new("shared-gone");
    scratch.plant("r1.jsonl", lines("r1", 1, 1));
    scratch.plant("r1.lock", record_text(GONE_PID, THIS_HOST, now_ms()));
    let (cli, desktop) = (folders(), folders());

    let outcome = cli
        .folder(&scratch.runs())
        .unwrap()
        .append("r1", 1, &lines("r1", 2, 2), None);
    assert_eq!(outcome, appended(2));
    let outcome =
        desktop
            .folder(&scratch.runs())
            .unwrap()
            .append("r1", 2, &lines("r1", 3, 3), None);
    assert_eq!(outcome, appended(3));
    assert_eq!(scratch.names(), ["r1.jsonl"]);
}

#[test]
fn run_store_removes_another_computer_s_lock_once_it_is_too_old() {
    let scratch = Scratch::new("shared-old");
    scratch.plant("r1.jsonl", lines("r1", 1, 1));
    let taken_at = now_ms() - STALE_AFTER_MS - 1_000;
    scratch.plant(
        "r1.lock",
        record_text(std::process::id(), "other-computer", taken_at),
    );

    let folders = folders();
    let outcome =
        folders
            .folder(&scratch.runs())
            .unwrap()
            .append("r1", 1, &lines("r1", 2, 2), None);
    assert_eq!(outcome, appended(2));
    assert_eq!(scratch.names(), ["r1.jsonl"]);
}
