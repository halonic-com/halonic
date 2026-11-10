use super::{AppendOutcome, RunStoreError, with_release_error};

fn release_failed() -> RunStoreError {
    RunStoreError::Io {
        message: "the lock can't be removed".to_owned(),
    }
}

#[test]
fn run_store_keeps_an_append_whose_lock_wasn_t_released() {
    // The lines are stored: failing now would make a retry conflict with
    // its own events.
    let stored = Ok(AppendOutcome::Appended {
        last_seq: 2,
        snapshot_error: None,
        release_error: None,
    });
    assert_eq!(
        with_release_error(stored, release_failed()),
        Ok(AppendOutcome::Appended {
            last_seq: 2,
            snapshot_error: None,
            release_error: Some(release_failed()),
        })
    );
}

#[test]
fn run_store_gives_the_release_error_when_nothing_was_stored() {
    let conflict = Ok(AppendOutcome::Conflict { last_seq: 1 });
    assert_eq!(
        with_release_error(conflict, release_failed()),
        Err(release_failed())
    );
    // The error that stopped the append comes first.
    let refused = Err(RunStoreError::BrokenLog {
        file: "r1.jsonl".to_owned(),
    });
    assert_eq!(
        with_release_error(refused.clone(), release_failed()),
        refused
    );
}
