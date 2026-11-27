use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// The runs that have a turn going or waiting, by their lock file.
type Runs = Mutex<HashMap<PathBuf, Run>>;

/// A run's mutex and how many of its turns are going or waiting.
#[derive(Debug, Default)]
struct Run {
    turn: Arc<Mutex<()>>,
    /// Changed only under the map's lock. Counting the mutex's `Arc`s
    /// instead raced (HAL-20427): a turn dropped its `Arc` only after it let
    /// go of the map, so two turns ending together could each still count
    /// the other's and both leave the entry behind.
    turns: usize,
}

/// One turn at a time per run inside the shell, as `KeyedQueue` gives
/// `fs-node`: the run lock keeps other processes out, and this keeps the
/// shell's own commands from reading a log while another appends to it.
#[derive(Debug, Default)]
pub(crate) struct Turns {
    /// A run's entry is removed when its last turn ends.
    runs: Runs,
}

impl Turns {
    /// Runs `work` once no other turn of the run with this lock file is
    /// going.
    pub(crate) fn take<T>(&self, lock_file: &Path, work: impl FnOnce() -> T) -> T {
        let turn = self.count_turn(lock_file);
        let _ending = TurnEnd {
            runs: &self.runs,
            lock_file,
        };
        // A turn that panicked guarded nothing but the turn itself.
        let _turn = turn.lock().unwrap_or_else(PoisonError::into_inner);
        work()
    }

    /// Counts a new turn of the run with this lock file and returns the
    /// run's mutex, which the turn waits for.
    fn count_turn(&self, lock_file: &Path) -> Arc<Mutex<()>> {
        let mut runs = lock(&self.runs);
        let run = runs.entry(lock_file.to_owned()).or_default();
        run.turns += 1;
        Arc::clone(&run.turn)
    }

    /// How many runs have a turn going or waiting.
    #[cfg(test)]
    pub(crate) fn runs_with_turns(&self) -> usize {
        lock(&self.runs).len()
    }
}

/// Removes a run's entry when its last turn ends, also when the turn
/// panics, so the map holds only runs that have a turn going or waiting.
struct TurnEnd<'a> {
    runs: &'a Runs,
    lock_file: &'a Path,
}

impl Drop for TurnEnd<'_> {
    fn drop(&mut self) {
        let mut runs = lock(self.runs);
        // `take` counted this turn under the same lock, so the entry is there.
        let Some(run) = runs.get_mut(self.lock_file) else {
            return;
        };
        run.turns -= 1;
        if run.turns == 0 {
            runs.remove(self.lock_file);
        }
    }
}

fn lock(runs: &Runs) -> MutexGuard<'_, HashMap<PathBuf, Run>> {
    runs.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
#[path = "turns_tests.rs"]
mod tests;
