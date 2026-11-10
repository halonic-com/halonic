use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::sync::mpsc;
use std::thread;

use super::Turns;

#[test]
fn run_store_turns_forget_a_run_once_its_turns_end() {
    let turns = Turns::default();
    let answer = turns.take(Path::new("r1.lock"), || {
        assert_eq!(turns.runs_with_turns(), 1);
        42
    });
    assert_eq!(answer, 42);
    assert_eq!(turns.runs_with_turns(), 0);
}

#[test]
fn run_store_turns_forget_a_run_whose_turn_panicked() {
    let turns = Turns::default();
    let panicked = catch_unwind(AssertUnwindSafe(|| {
        turns.take(Path::new("r1.lock"), || panic!("the turn fails"));
    }));
    assert!(panicked.is_err());
    assert_eq!(turns.runs_with_turns(), 0);
    // The run's next turn isn't held up by the one that panicked.
    assert_eq!(turns.take(Path::new("r1.lock"), || "next"), "next");
}

#[test]
fn run_store_turns_forget_a_run_once_overlapping_turns_end() {
    let turns = &Turns::default();
    let (started, wait_for_start) = mpsc::channel();
    let (finish, wait_for_finish) = mpsc::channel::<()>();
    thread::scope(|scope| {
        // The channel's ends move into the first turn's thread.
        scope.spawn(move || {
            turns.take(Path::new("r1.lock"), || {
                started.send(()).unwrap();
                wait_for_finish.recv().unwrap();
            });
        });
        wait_for_start.recv().unwrap();
        // The second turn starts while the first holds the run, so it waits
        // unless the first has already ended; either way the run is
        // forgotten only once both have.
        let waiting = scope.spawn(|| turns.take(Path::new("r1.lock"), || "second"));
        finish.send(()).unwrap();
        assert_eq!(waiting.join().unwrap(), "second");
    });
    assert_eq!(turns.runs_with_turns(), 0);
}
