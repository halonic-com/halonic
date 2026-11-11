use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, PoisonError};

/// One write or remove at a time for each file, so the check for `expected`
/// and the write it allows are never split by another call (save model 1.7).
///
/// Files are told apart by the path the call names. On a file system that
/// ignores case, `a.yaml` and `A.yaml` are one file with two turns; the
/// adapter's own queue writes one path at a time anyway, and a program
/// outside Halonic can change a file between the check and the rename just
/// as well, which the watch reports.
#[derive(Debug, Default)]
pub struct WriteLocks {
    busy: Mutex<HashSet<PathBuf>>,
    freed: Condvar,
}

impl WriteLocks {
    /// Waits until no other call holds `file`, then holds it until the turn
    /// is dropped.
    pub(crate) fn turn(&self, file: &Path) -> WriteTurn<'_> {
        let mut busy = self.busy.lock().unwrap_or_else(PoisonError::into_inner);
        while busy.contains(file) {
            busy = self
                .freed
                .wait(busy)
                .unwrap_or_else(PoisonError::into_inner);
        }
        busy.insert(file.to_owned());
        WriteTurn {
            locks: self,
            file: file.to_owned(),
        }
    }
}

/// A call's turn on one file. Dropping it lets the next call in.
#[derive(Debug)]
pub(crate) struct WriteTurn<'a> {
    locks: &'a WriteLocks,
    file: PathBuf,
}

impl Drop for WriteTurn<'_> {
    fn drop(&mut self) {
        let mut busy = self
            .locks
            .busy
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        busy.remove(&self.file);
        self.locks.freed.notify_all();
    }
}
