use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// The runs that have a turn going or waiting: a mutex for each, by its
/// lock file.
type Runs = Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>;

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
        let run = Arc::clone(lock(&self.runs).entry(lock_file.to_owned()).or_default());
        let _ending = TurnEnd {
            runs: &self.runs,
            lock_file,
            run: &run,
        };
        // A turn that panicked guarded nothing but the turn itself.
        let _turn = run.lock().unwrap_or_else(PoisonError::into_inner);
        work()
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
    run: &'a Arc<Mutex<()>>,
}

impl Drop for TurnEnd<'_> {
    fn drop(&mut self) {
        let mut runs = lock(self.runs);
        // Ours and the map's: no other turn is going or waiting.
        if Arc::strong_count(self.run) == 2 {
            runs.remove(self.lock_file);
        }
    }
}

fn lock(runs: &Runs) -> MutexGuard<'_, HashMap<PathBuf, Arc<Mutex<()>>>> {
    runs.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
#[path = "turns_tests.rs"]
mod tests;
