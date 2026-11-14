//! A lock one process holds for as long as it runs, such as the engine lock
//! of a workspace (HAL-4032, HAL-8792). It is `holdLock` of `fs-node` step by
//! step: the same record in the same file, taken with an exclusive create,
//! never waited for (a live holder refuses it), a stale one removed as the
//! run lock removes it, and renewed by writing the record again with a new
//! `takenAt`, a third of the stale limit apart, so a lock held for hours
//! never counts as stale. A holder that crashed leaves a lock the next
//! process takes over.

use crate::record::{LockRecord, STALE_AFTER_MS, is_stale, record_text};
use crate::{
    RETRY_DELAY, StaleRemoval, ThisComputer, busy, create_exclusive, now_ms, read_lock,
    read_taken_lock, release_lock, remove_stale,
};
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

/// How often the holder renews its lock: a third of the stale limit
/// (`heldLockRenewEveryMs`).
pub const RENEW_EVERY: Duration = Duration::from_millis(STALE_AFTER_MS.unsigned_abs() / 3);

/// Why a lock wasn't taken.
#[derive(Debug)]
pub enum HoldError {
    /// Another live process holds it; its record, or `None` when its file
    /// holds none yet.
    Held(Option<LockRecord>),
    /// The file system failed.
    Io(io::Error),
}

impl From<io::Error> for HoldError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// How a renewal ended.
#[derive(Debug, PartialEq)]
pub enum Renewal {
    /// The lock holds a new record.
    Renewed,
    /// The lock isn't this process's any more; the holder must stop what it
    /// guards. It says why.
    Lost(&'static str),
}

/// A lock this process holds until [`EngineLock::release`].
#[derive(Debug)]
pub struct EngineLock {
    file: PathBuf,
    own_text: String,
}

/// Takes the lock `file` (in a folder that exists) without waiting: removes
/// a stale one, and refuses one a live process holds.
pub fn hold_lock(file: &Path, computer: &impl ThisComputer) -> Result<EngineLock, HoldError> {
    let host = computer.host_name();
    loop {
        let own_text = own_record_text(host.as_deref());
        if busy::HERE.run(|| create_exclusive(file, &own_text))? {
            return Ok(EngineLock {
                file: file.to_owned(),
                own_text,
            });
        }
        let Some(found) = read_taken_lock(file)? else {
            // Released between our create and our read: try again straight away.
            continue;
        };
        if !is_stale(&found, now_ms(), host.as_deref(), |pid| {
            computer.process_alive(pid)
        }) {
            return Err(HoldError::Held(found.record));
        }
        match remove_stale(file, &found.text, &own_text)? {
            StaleRemoval::Done => {}
            StaleRemoval::AnotherWriterIsRemoving => thread::sleep(RETRY_DELAY),
        }
    }
}

impl EngineLock {
    /// Writes this process's record again, with `takenAt` now. The new record
    /// replaces the old one whole, by a rename, so no process reads half of
    /// it. A lock that isn't ours any more, or is older than the stale limit
    /// (this process missed its renewals, say while the computer slept, and
    /// another may be taking it over right now), is given up instead.
    pub fn renew(&mut self, computer: &impl ThisComputer) -> io::Result<Renewal> {
        let host = computer.host_name();
        let found = busy::HERE.run(|| read_lock(&self.file))?;
        let Some(found) = found.filter(|found| found.text == self.own_text) else {
            return Ok(Renewal::Lost("was taken over by another process"));
        };
        if is_stale(&found, now_ms(), host.as_deref(), |pid| {
            computer.process_alive(pid)
        }) {
            release_lock(&self.file, &self.own_text)?;
            return Ok(Renewal::Lost(
                "wasn't renewed within the stale limit, so it was given up",
            ));
        }
        let renewed = own_record_text(host.as_deref());
        replace_whole(&self.file, &renewed)?;
        self.own_text = renewed;
        Ok(Renewal::Renewed)
    }

    /// Removes the lock, while it is still this process's.
    pub fn release(self) -> io::Result<()> {
        release_lock(&self.file, &self.own_text)
    }
}

/// This process's record; an unknown host name is written as `""`, which no
/// computer has.
fn own_record_text(host: Option<&str>) -> String {
    record_text(std::process::id(), host.unwrap_or(""), now_ms())
}

/// Puts `text` in `file` by writing a file next to it and renaming it over.
fn replace_whole(file: &Path, text: &str) -> io::Result<()> {
    let mut name = file.as_os_str().to_owned();
    name.push(format!(".{}.renew", now_ms()));
    let next = PathBuf::from(name);
    let written = write_private(&next, text);
    let renamed = written.and_then(|()| busy::HERE.run(|| fs::rename(&next, file)));
    if renamed.is_err() {
        let _ = fs::remove_file(&next);
    }
    renamed
}

/// Creates `file`, readable by this user only, as the lock is when taken.
fn write_private(file: &Path, text: &str) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(file)?.write_all(text.as_bytes())
}

#[cfg(test)]
#[path = "held_tests.rs"]
mod tests;
