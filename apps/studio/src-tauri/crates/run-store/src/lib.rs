//! The run folders the Studio shell writes, in the same files as
//! `FolderRunStore` in `fs-node`: `<runId>.jsonl` holds the run's events,
//! one per line, and only ever grows; `<runId>.snapshot.json` caches the
//! engine's state and may be deleted at any time. Appends hold
//! `<runId>.lock` from `halonic-run-lock` while they check `expectedSeq`
//! and write, so a CLI and the desktop app writing one run can't both win.
//!
//! Run ids are case-sensitive, also in a folder that ignores case (on
//! Windows and macOS), where `RUN_X.jsonl` opens the log of `run_x`. Such a
//! log reads as an unknown run, and an append to it is refused (HAL-4749).
//!
//! This crate does only the file work. The page keeps everything else in
//! TypeScript, shared with `fs-node` through the `RunStore` port: it checks
//! the events and writes them as lines, reads lines back into events, and
//! works out summaries. Plain Rust with no Tauri types; the shell's
//! commands wrap it.

mod error;
mod log_file;
mod run_id;
mod turns;

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub use error::RunStoreError;
pub use halonic_run_lock::ThisComputer;
pub use run_id::{check_run_id, is_run_id};

use halonic_run_lock::with_run_lock;
use log_file::{LogFile, append_lines, are_whole_lines, count_lines, cut_back, read_log};
use turns::Turns;

const LOG_SUFFIX: &str = ".jsonl";
const SNAPSHOT_SUFFIX: &str = ".snapshot.json";
const LOCK_SUFFIX: &str = ".lock";

/// What an append did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppendOutcome {
    /// The lines are stored, and the log's last event is now `last_seq`.
    /// When a snapshot was given but couldn't be written, `snapshot_error`
    /// says why: the append still succeeded, since the snapshot is only a
    /// cache, so the shell logs it as a warning.
    ///
    /// When the run's lock couldn't be released afterwards, `release_error`
    /// says why. The lines are stored all the same, so the append must not
    /// fail: a caller that tried it again would get `Conflict` with its own
    /// events in the log. The lock left behind is stale after
    /// `halonic_run_lock::STALE_AFTER_MS`, and the next writer removes it.
    Appended {
        last_seq: u64,
        snapshot_error: Option<RunStoreError>,
        release_error: Option<RunStoreError>,
    },
    /// The log's last event isn't `expectedSeq`; nothing was stored.
    Conflict { last_seq: u64 },
}

/// A cached snapshot, with the number of events in the log it was read
/// with, so the page can drop a snapshot ahead of the log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredSnapshot {
    /// The file's text, as the page wrote it.
    pub text: String,
    pub log_events: u64,
}

/// One run's log, as `logs` lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunLog {
    pub run_id: String,
    /// The log's whole lines.
    pub lines: String,
}

/// Every run folder the shell writes: what each lock is judged against, and
/// one turn at a time per run inside the shell. The shell keeps one, so its
/// commands take turns on a run whichever folder they reach it through.
#[derive(Debug, Default)]
pub struct RunFolders<C> {
    computer: C,
    turns: Turns,
}

impl<C: ThisComputer> RunFolders<C> {
    /// Run folders whose locks are judged against `computer`.
    pub fn new(computer: C) -> Self {
        Self {
            computer,
            turns: Turns::default(),
        }
    }

    /// The run folder `root`, which is created on the first append. A
    /// relative `root` is made absolute against the current folder now, as
    /// `resolve(root)` in `fs-node`, so the folder stays the same when the
    /// current folder changes later and each run takes its turns under one
    /// lock file name.
    pub fn folder(&self, root: &Path) -> Result<RunFolder<'_, C>, RunStoreError> {
        Ok(RunFolder {
            root: std::path::absolute(root)?,
            folders: self,
        })
    }
}

/// One run folder: `<profile>/workspaces/<key>/runs`, or a deployment's.
#[derive(Debug)]
pub struct RunFolder<'a, C> {
    root: PathBuf,
    folders: &'a RunFolders<C>,
}

impl<C: ThisComputer> RunFolder<'_, C> {
    /// Where the run folder is, always an absolute path.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Appends `lines`, one event per line, when the log's last event is
    /// `expected_seq`; otherwise stores nothing and gives the conflict. A
    /// new run (`expected_seq` 0) drops a snapshot left from a deleted log
    /// of the same id. `snapshot` replaces the cached snapshot once the
    /// lines are stored.
    pub fn append(
        &self,
        run_id: &str,
        expected_seq: u64,
        lines: &str,
        snapshot: Option<&str>,
    ) -> Result<AppendOutcome, RunStoreError> {
        check_run_id(run_id)?;
        if !are_whole_lines(lines) {
            return Err(RunStoreError::InvalidLines);
        }
        let lock_file = self.file(run_id, LOCK_SUFFIX);
        self.take_turn(&lock_file, || -> Result<AppendOutcome, RunStoreError> {
            fs::create_dir_all(&self.root)?;
            let mut outcome = None;
            let released = with_run_lock(&lock_file, &self.folders.computer, || {
                outcome = Some(self.append_locked(run_id, expected_seq, lines, snapshot));
            });
            match (outcome, released) {
                (Some(outcome), Ok(())) => outcome,
                (Some(outcome), Err(release)) => with_release_error(outcome, release.into()),
                // The lock couldn't be taken, so nothing ran.
                (None, Err(error)) => Err(error.into()),
                (None, Ok(())) => {
                    unreachable!("with_run_lock runs the work once it holds the lock")
                }
            }
        })
    }

    /// The log's whole lines, empty when the run has no log, or when the
    /// log is another run's whose id differs only in case.
    pub fn events(&self, run_id: &str) -> Result<String, RunStoreError> {
        check_run_id(run_id)?;
        let lock_file = self.file(run_id, LOCK_SUFFIX);
        self.take_turn(&lock_file, || -> Result<String, RunStoreError> {
            let log = self.read_log(run_id)?;
            if log.is_other_runs(run_id) {
                return Ok(String::new());
            }
            Ok(log.lines)
        })
    }

    /// The cached snapshot, or `None` when there is none, it can't be read,
    /// or the log is another run's whose id differs only in case. Bytes that
    /// aren't UTF-8 become U+FFFD, as when `fs-node` reads the file as `utf8`.
    pub fn snapshot(&self, run_id: &str) -> Result<Option<StoredSnapshot>, RunStoreError> {
        check_run_id(run_id)?;
        let lock_file = self.file(run_id, LOCK_SUFFIX);
        self.take_turn(
            &lock_file,
            || -> Result<Option<StoredSnapshot>, RunStoreError> {
                let Ok(bytes) = fs::read(self.file(run_id, SNAPSHOT_SUFFIX)) else {
                    // Missing or not readable: either way the cache can't be used.
                    return Ok(None);
                };
                let log = self.read_log(run_id)?;
                if log.is_other_runs(run_id) {
                    return Ok(None);
                }
                Ok(Some(StoredSnapshot {
                    text: String::from_utf8_lossy(&bytes).into_owned(),
                    log_events: log.last_seq(),
                }))
            },
        )
    }

    /// Every run's log, sorted by run id, for the page to work out the list
    /// from, as `fs-node` does on every call. Only files named
    /// `<runId>.jsonl` for a valid run id are read.
    pub fn logs(&self) -> Result<Vec<RunLog>, RunStoreError> {
        let entries = match fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut run_ids = Vec::new();
        for entry in entries {
            let name = entry?.file_name();
            let run_id = name.to_str().and_then(|name| name.strip_suffix(LOG_SUFFIX));
            if let Some(run_id) = run_id.filter(|run_id| is_run_id(run_id)) {
                run_ids.push(run_id.to_owned());
            }
        }
        run_ids.sort();
        run_ids
            .into_iter()
            .map(|run_id| {
                let lines = self.events(&run_id)?;
                Ok(RunLog { run_id, lines })
            })
            .collect()
    }

    /// Checks `expected_seq` and writes an append, with the run's lock held.
    fn append_locked(
        &self,
        run_id: &str,
        expected_seq: u64,
        lines: &str,
        snapshot: Option<&str>,
    ) -> Result<AppendOutcome, RunStoreError> {
        let log = self.read_log(run_id)?;
        self.refuse_other_runs_log(run_id, &log)?;
        if log.last_seq() != expected_seq {
            return Ok(AppendOutcome::Conflict {
                last_seq: log.last_seq(),
            });
        }
        let log_file = self.file(run_id, LOG_SUFFIX);
        if log.torn {
            // So the new lines aren't glued onto a line a crash cut off.
            cut_back(&log_file, log.intact_bytes())?;
        }
        if expected_seq == 0 {
            remove_if_there(&self.file(run_id, SNAPSHOT_SUFFIX))?;
        }
        append_lines(&log_file, lines, log.intact_bytes())?;
        let snapshot_error = snapshot.and_then(|text| self.write_snapshot(run_id, text).err());
        Ok(AppendOutcome::Appended {
            last_seq: expected_seq + count_lines(lines),
            snapshot_error,
            release_error: None,
        })
    }

    /// Refuses an append to `run_id` when its log is another run's, whose
    /// id differs only in case. A log without a whole line can't tell by
    /// what it holds, so then the folder's names do; that costs a listing
    /// only for such a log, never for a missing one or one with events.
    fn refuse_other_runs_log(&self, run_id: &str, log: &LogFile) -> Result<(), RunStoreError> {
        let other_runs = log.is_other_runs(run_id)
            || (log.last_seq() == 0 && self.listed_under_other_name(run_id)?);
        if other_runs {
            return Err(RunStoreError::OtherRunsLog {
                run_id: run_id.to_owned(),
            });
        }
        Ok(())
    }

    /// Whether `<run_id>.jsonl` opens a file the folder lists under another
    /// name, as only a folder that ignores case does.
    fn listed_under_other_name(&self, run_id: &str) -> Result<bool, RunStoreError> {
        let name = format!("{run_id}{LOG_SUFFIX}");
        match fs::metadata(self.root.join(&name)) {
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error.into()),
        }
        for entry in fs::read_dir(&self.root)? {
            if entry?.file_name() == name.as_str() {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Replaces the snapshot through a temporary file and a rename, so a
    /// reader sees the old snapshot or the new one, never half of one.
    fn write_snapshot(&self, run_id: &str, text: &str) -> Result<(), RunStoreError> {
        let file = self.file(run_id, SNAPSHOT_SUFFIX);
        let temporary = self.file(run_id, &format!("{SNAPSHOT_SUFFIX}.tmp"));
        let written = fs::write(&temporary, text).and_then(|()| fs::rename(&temporary, &file));
        if written.is_err() {
            // A temporary file left behind is replaced by the next snapshot.
            let _ = fs::remove_file(&temporary);
        }
        written.map_err(RunStoreError::from)
    }

    fn read_log(&self, run_id: &str) -> Result<LogFile, RunStoreError> {
        let name = format!("{run_id}{LOG_SUFFIX}");
        read_log(&self.root.join(&name), &name)
    }

    fn take_turn<T>(&self, lock_file: &Path, work: impl FnOnce() -> T) -> T {
        self.folders.turns.take(lock_file, work)
    }

    fn file(&self, run_id: &str, suffix: &str) -> PathBuf {
        self.root.join(format!("{run_id}{suffix}"))
    }
}

/// What an append gives when the run's lock couldn't be released: stored
/// lines stay `Appended`, with the error for the shell to log; anything else
/// stored nothing, so the error is the answer.
fn with_release_error(
    outcome: Result<AppendOutcome, RunStoreError>,
    release: RunStoreError,
) -> Result<AppendOutcome, RunStoreError> {
    match outcome {
        Ok(AppendOutcome::Appended {
            last_seq,
            snapshot_error,
            ..
        }) => Ok(AppendOutcome::Appended {
            last_seq,
            snapshot_error,
            release_error: Some(release),
        }),
        Err(error) => Err(error),
        Ok(AppendOutcome::Conflict { .. }) => Err(release),
    }
}

fn remove_if_there(file: &Path) -> std::io::Result<()> {
    match fs::remove_file(file) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        removed => removed,
    }
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
