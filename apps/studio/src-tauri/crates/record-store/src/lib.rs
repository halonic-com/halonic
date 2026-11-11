//! The record logs the Studio shell writes, in the same files as
//! `FileRecordStore` in `fs-node`: one log per collection in the workspace's
//! records folder, one JSON change per line, that only ever grows until it
//! is compacted. A log is named by the SHA-256 of its collection's UTF-16
//! code units, little-endian, and `.jsonl`, never by the collection itself,
//! so a name such as `../leads` is just a value and a folder that ignores
//! case still keeps `Leads` and `leads` apart.
//!
//! Every write holds the store's write lock, `write.lock` beside the logs,
//! with `halonic-run-lock`, so a CLI and the desktop app writing one folder
//! take turns, and an append can't land between a compact's read and its
//! replace. Reads take no lock: a line counts once its line break is
//! written, so whatever follows the last one is a torn line, left out on
//! read and cut off before the next append.
//!
//! This crate does only the file work. The page keeps everything else in
//! TypeScript, shared with `fs-node` through the `RecordStore` port: it
//! writes changes as lines (`formatRecordLines`), reads them back
//! (`parseRecordLines`), and folds a collection for a compact
//! (`compactedChanges`). So a compact is two calls: the page reads the log
//! with its version, folds it, and asks to replace the log only if it still
//! has that version; when an append came in between, it reads again.
//! Plain Rust with no Tauri types; the shell's commands wrap it.

mod error;
mod log_file;

use std::collections::HashSet;
use std::fs::DirBuilder;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

pub use error::RecordStoreError;
pub use halonic_run_lock::ThisComputer;

use halonic_run_lock::with_run_lock;
use log_file::{
    cut_back, intact_end, intact_size, open_for_append, read_log, remove_log, replace_file,
    write_lines,
};
use sha2::{Digest, Sha256};

const LOG_SUFFIX: &str = ".jsonl";

/// The store's write lock, beside the logs. Log names are hashes, so it can't be one.
const LOCK_NAME: &str = "write.lock";

/// A temporary file a compact renames over a log; it can't be a log's name.
const TEMPORARY_SUFFIX: &str = ".compact.tmp";

/// The lines of one collection to append.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionLines {
    pub collection: String,
    /// Whole lines, each a JSON change to `collection` ending in a line break.
    pub lines: String,
}

/// A collection's log as read: its whole lines and a version to replace it by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredLog {
    /// The whole lines, up to and including the last line break; `""` when
    /// there is no log.
    pub lines: String,
    /// The hex SHA-256 of `lines`, which a replace names to make sure the
    /// log hasn't changed since.
    pub version: String,
    /// The log's path, for the page's messages, as `fs-node` names it.
    pub file: PathBuf,
}

/// What a replace did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplaceOutcome {
    /// The log holds the new lines now, or is gone when they were empty.
    Replaced,
    /// The log's whole lines aren't the version named any more: something
    /// was appended or compacted in between. Nothing was written.
    Changed,
}

/// The outcome of a write, and the error of releasing the write lock
/// afterwards, if any. The write stands all the same, so it must not fail:
/// a caller that tried an append again would store its changes twice. The
/// lock left behind is stale after `halonic_run_lock::STALE_AFTER_MS`, and
/// the next writer removes it; the shell logs the error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written<T> {
    pub outcome: T,
    pub release_error: Option<RecordStoreError>,
}

/// Every record folder the shell writes: what each lock is judged against,
/// and one write at a time inside the shell, as the store's `KeyedQueue`
/// gives `fs-node`. The shell keeps one.
#[derive(Debug, Default)]
pub struct RecordFolders<C> {
    computer: C,
    writing: Mutex<()>,
}

impl<C: ThisComputer> RecordFolders<C> {
    /// Record folders whose locks are judged against `computer`.
    pub fn new(computer: C) -> Self {
        Self {
            computer,
            writing: Mutex::new(()),
        }
    }

    /// The record folder `root`, which is created on the first write. A
    /// relative `root` is made absolute against the current folder now, as
    /// `resolve(root)` in `fs-node`.
    pub fn folder(&self, root: &Path) -> Result<RecordFolder<'_, C>, RecordStoreError> {
        Ok(RecordFolder {
            root: std::path::absolute(root)?,
            folders: self,
        })
    }
}

/// One record folder: `<profile>/workspaces/<key>/records`.
#[derive(Debug)]
pub struct RecordFolder<'a, C> {
    root: PathBuf,
    folders: &'a RecordFolders<C>,
}

impl<C: ThisComputer> RecordFolder<'_, C> {
    /// Where the record folder is, always an absolute path.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The log of `collection`: `<sha256 of its UTF-16 code units>.jsonl`.
    pub fn log_file(&self, collection: &str) -> PathBuf {
        self.root.join(log_name(collection))
    }

    /// Appends each collection's lines to its log, all of them or none: when
    /// one fails, every log already added to is cut back to its size before.
    /// A torn last line a crash left is cut off first, so the new lines
    /// aren't glued onto it. Each collection comes once, with all its lines,
    /// as the page sends them.
    pub fn append(&self, appends: &[CollectionLines]) -> Result<Written<()>, RecordStoreError> {
        let mut collections = HashSet::new();
        for append in appends {
            if !collections.insert(append.collection.as_str()) {
                return Err(RecordStoreError::RepeatedCollection {
                    collection: append.collection.clone(),
                });
            }
            check_lines(&append.collection, &append.lines)?;
        }
        self.while_writing(|| {
            let mut before: Vec<(PathBuf, u64)> = Vec::new();
            for append in appends {
                if let Err(error) = self.append_lines(append, &mut before) {
                    cut_back_all(&before);
                    return Err(error);
                }
            }
            Ok(())
        })
    }

    /// The log's whole lines and their version. A missing log reads as no
    /// lines. A log whose whole lines aren't UTF-8 is a `BrokenLog`.
    pub fn read(&self, collection: &str) -> Result<StoredLog, RecordStoreError> {
        let file = self.log_file(collection);
        let mut bytes = read_log(&file)?;
        bytes.truncate(intact_end(&bytes));
        let version = hex_sha256(&bytes);
        let lines = String::from_utf8(bytes)
            .map_err(|_| RecordStoreError::BrokenLog { file: file.clone() })?;
        Ok(StoredLog {
            lines,
            version,
            file,
        })
    }

    /// Replaces the log of `collection` with `lines` if its whole lines are
    /// still `version`, as `read` gave it; removes it when `lines` is empty.
    /// The new log is written to a temporary file, flushed and renamed over
    /// the old one, so a crash leaves the old log or the new.
    pub fn replace(
        &self,
        collection: &str,
        version: &str,
        lines: &str,
    ) -> Result<Written<ReplaceOutcome>, RecordStoreError> {
        if !lines.is_empty() {
            check_lines(collection, lines)?;
        }
        self.while_writing(|| {
            if self.read(collection)?.version != version {
                return Ok(ReplaceOutcome::Changed);
            }
            let file = self.log_file(collection);
            if lines.is_empty() {
                remove_log(&file)?;
            } else {
                let mut temporary = file.clone().into_os_string();
                temporary.push(TEMPORARY_SUFFIX);
                replace_file(&file, Path::new(&temporary), lines)?;
            }
            Ok(ReplaceOutcome::Replaced)
        })
    }

    /// Runs `work` as the only writer: first in the shell, then across
    /// processes with the write lock.
    fn while_writing<T>(
        &self,
        work: impl FnOnce() -> Result<T, RecordStoreError>,
    ) -> Result<Written<T>, RecordStoreError> {
        let _turn = self
            .folders
            .writing
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        create_private_folder(&self.root)?;
        let mut outcome = None;
        let released = with_run_lock(&self.root.join(LOCK_NAME), &self.folders.computer, || {
            outcome = Some(work());
        });
        match (outcome, released) {
            (Some(outcome), Ok(())) => Ok(Written {
                outcome: outcome?,
                release_error: None,
            }),
            (Some(outcome), Err(release)) => Ok(Written {
                // A write that failed stored nothing, so its own error is the answer.
                outcome: outcome?,
                release_error: Some(release.into()),
            }),
            // The lock couldn't be taken, so nothing ran.
            (None, Err(error)) => Err(error.into()),
            (None, Ok(())) => unreachable!("with_run_lock runs the work once it holds the lock"),
        }
    }

    /// Adds one collection's lines to its log, noting the log's size before
    /// in `before`, so a failed append can cut it back.
    fn append_lines(
        &self,
        append: &CollectionLines,
        before: &mut Vec<(PathBuf, u64)>,
    ) -> Result<(), RecordStoreError> {
        let file = self.log_file(&append.collection);
        let (mut log, size) = open_for_append(&file)?;
        let intact = intact_size(&file, size)?;
        if intact < size {
            cut_back(&file, intact)?;
        }
        before.push((file, intact));
        write_lines(&mut log, &append.lines)?;
        Ok(())
    }
}

/// The name of a collection's log: the hex SHA-256 of its UTF-16 code
/// units, little-endian, and `.jsonl`, as `fs-node` names it. (UTF-8 would
/// turn a lone surrogate into U+FFFD; Rust strings can't hold one, so a
/// collection name with one never reaches the shell.)
pub fn log_name(collection: &str) -> String {
    let units: Vec<u8> = collection
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    format!("{}{LOG_SUFFIX}", hex_sha256(&units))
}

fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Refuses lines that aren't whole, non-empty lines, each a JSON object
/// whose `collection` is `collection`: the log counts one change per line,
/// and a change to another collection would make the log unreadable.
fn check_lines(collection: &str, lines: &str) -> Result<(), RecordStoreError> {
    let is_change_to_collection = |line: &str| {
        serde_json::from_str::<serde_json::Value>(line).is_ok_and(|change| {
            change.get("collection").and_then(serde_json::Value::as_str) == Some(collection)
        })
    };
    let whole = lines.ends_with('\n') && lines.split_terminator('\n').all(is_change_to_collection);
    if whole {
        Ok(())
    } else {
        Err(RecordStoreError::InvalidLines {
            collection: collection.to_owned(),
        })
    }
}

/// Cuts every log a failed append added to back to its size before, the
/// last one first. When a cut fails too, the append's own error is the one
/// worth reporting; its lines left behind then count as stored, as after a
/// crash.
fn cut_back_all(before: &[(PathBuf, u64)]) {
    for (file, size) in before.iter().rev() {
        let _ = cut_back(file, *size);
    }
}

/// Creates the folder, and any missing parents, readable by its owner only.
fn create_private_folder(folder: &Path) -> Result<(), RecordStoreError> {
    let mut builder = DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)?;
    Ok(())
}
