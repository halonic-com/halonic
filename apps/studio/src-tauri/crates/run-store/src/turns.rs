use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// One turn at a time per run inside the shell, as `KeyedQueue` gives
/// `fs-node`: the run lock keeps other processes out, and this keeps the
/// shell's own commands from reading a log while another appends to it.
#[derive(Debug, Default)]
pub(crate) struct Turns {
    /// A mutex for each run that has a turn going or waiting, by its lock
    /// file. A run's entry is removed when its last turn ends.
    runs: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl Turns {
    /// Runs `work` once no other turn of the run with this lock file is
    /// going.
    pub(crate) fn take<T>(&self, lock_file: &Path, work: impl FnOnce() -> T) -> T {
        let run = Arc::clone(self.lock_runs().entry(lock_file.to_owned()).or_default());
        let result = {
            // A turn that panicked guarded nothing but the turn itself.
            let _turn = run.lock().unwrap_or_else(PoisonError::into_inner);
            work()
        };
        let mut runs = self.lock_runs();
        // Ours and the map's: no other turn is going or waiting.
        if Arc::strong_count(&run) == 2 {
            runs.remove(lock_file);
        }
        result
    }

    fn lock_runs(&self) -> MutexGuard<'_, HashMap<PathBuf, Arc<Mutex<()>>>> {
        self.runs.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
