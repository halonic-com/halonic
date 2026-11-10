//! The run lock the Studio shell shares with the CLI. While a writer appends
//! to a run, it holds `<runId>.lock` next to the run's log, so a CLI and the
//! desktop app writing one run exclude each other and one of them gets
//! `conflict` instead of both winning.
//!
//! The format and the rules are `RunLockRecord`'s in `@halonicjs/ports`,
//! and this crate follows `withRunLock` in `fs-node` step by step: take the
//! lock with an exclusive create, wait while a live writer holds it, move a
//! stale one aside before removing it, and release only a lock that still
//! holds our own record. On Windows, a step Windows refuses while another
//! writer deletes or holds the lock file is tried again (see `busy.rs`).
//! Plain Rust with no Tauri types; the shell's run store wraps it.

mod busy;
mod iso_time;
mod record;

use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub use record::{FoundLock, LockRecord, STALE_AFTER_MS, is_stale, parse_record, record_text};

/// How long to wait before trying again to take a lock another writer holds.
const RETRY_DELAY: Duration = Duration::from_millis(15);

/// What a lock is judged against: this computer's name, and whether a
/// process runs here. The shell answers with `halonic-process-probe`, the
/// same calls Node makes; tests answer with fixed values.
pub trait ThisComputer {
    /// This computer's name as Node's `os.hostname()` gives it, or `None`
    /// when it is unknown: every lock then counts as another computer's.
    fn host_name(&self) -> Option<String>;

    /// Whether a process with this id runs on this computer, as Node's
    /// `process.kill(pid, 0)` judges it.
    fn process_alive(&self, pid: u32) -> bool;
}

/// Runs `work` while holding the run lock `file`, so no other process
/// appends to the run at the same time: waits while another writer holds the
/// lock, removes a stale one, and releases the lock once `work` returns,
/// also when it panics.
///
/// `file` is `<runId>.lock` in a folder that exists. An error from the file
/// system ends the wait; `work` then doesn't run.
pub fn with_run_lock<T>(
    file: &Path,
    computer: &impl ThisComputer,
    work: impl FnOnce() -> T,
) -> io::Result<T> {
    let held = take_lock(file, computer)?;
    let result = work();
    held.release()?;
    Ok(result)
}

/// A lock this writer holds. Dropping it without [`HeldLock::release`],
/// when the work panics, still releases it, ignoring any error.
struct HeldLock<'a> {
    file: &'a Path,
    own_text: String,
    released: bool,
}

impl HeldLock<'_> {
    fn release(mut self) -> io::Result<()> {
        self.released = true;
        release_lock(self.file, &self.own_text)
    }
}

impl Drop for HeldLock<'_> {
    fn drop(&mut self) {
        if !self.released {
            let _ = release_lock(self.file, &self.own_text);
        }
    }
}

/// Takes the lock, waiting as long as a live writer holds it.
fn take_lock<'a>(file: &'a Path, computer: &impl ThisComputer) -> io::Result<HeldLock<'a>> {
    let host = computer.host_name();
    loop {
        // An unknown host name is written as "", which no computer has.
        let own_text = record_text(std::process::id(), host.as_deref().unwrap_or(""), now_ms());
        if busy::HERE.run(|| create_exclusive(file, &own_text))? {
            return Ok(HeldLock {
                file,
                own_text,
                released: false,
            });
        }
        let Some(found) = busy::HERE.run(|| read_lock(file))? else {
            // Released between our create and our read: try again straight away.
            continue;
        };
        if is_stale(&found, now_ms(), host.as_deref(), |pid| {
            computer.process_alive(pid)
        }) {
            busy::HERE.run(|| remove_stale(file, &found.text))?;
            continue;
        }
        thread::sleep(RETRY_DELAY);
    }
}

/// Creates `file` holding `text`, or gives `false` when it is already there.
fn create_exclusive(file: &Path, text: &str) -> io::Result<bool> {
    match OpenOptions::new().write(true).create_new(true).open(file) {
        Ok(mut created) => created.write_all(text.as_bytes()).map(|()| true),
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(false),
        Err(error) => Err(error),
    }
}

/// The lock file as it is now, or `None` when there is none.
fn read_lock(file: &Path) -> io::Result<Option<FoundLock>> {
    let read = || -> io::Result<FoundLock> {
        let text = read_text(file)?;
        let changed_at = fs::metadata(file)?.modified()?;
        Ok(FoundLock::new(text, ms_since_1970(changed_at)))
    };
    match read() {
        Ok(found) => Ok(Some(found)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// A file's text. Bytes that aren't UTF-8 become U+FFFD, as when Node reads
/// the file as `utf8`.
fn read_text(file: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(file)?).into_owned())
}

/// Removes a stale lock that held `stale_text`. Another writer may have
/// removed it and taken a fresh lock since it was read, so the lock is moved
/// aside first and checked: when it isn't the stale one any more, it is put
/// back, unless a third writer has taken the lock by then.
fn remove_stale(file: &Path, stale_text: &str) -> io::Result<()> {
    let aside = aside_path(file);
    match fs::rename(file, &aside) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    }
    let checked = read_text(&aside).and_then(|text| {
        if text == stale_text {
            Ok(())
        } else {
            put_back(&aside, file)
        }
    });
    let removed = remove_if_there(&aside);
    checked.and(removed)
}

/// Links `aside` back to `file`, unless `file` is there again.
fn put_back(aside: &Path, file: &Path) -> io::Result<()> {
    match fs::hard_link(aside, file) {
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(()),
        linked => linked,
    }
}

/// Removes the lock, but only while it holds `own_text`: when this writer
/// took so long that another removed its lock as stale, the lock now belongs
/// to that other writer. Tried again while Windows refuses it as busy, so the
/// lock isn't left behind for other writers to wait on.
fn release_lock(file: &Path, own_text: &str) -> io::Result<()> {
    busy::HERE.run(|| release_own_lock(file, own_text))
}

fn release_own_lock(file: &Path, own_text: &str) -> io::Result<()> {
    match read_lock(file)? {
        Some(found) if found.text == own_text => remove_if_there(file),
        _ => Ok(()),
    }
}

fn remove_if_there(file: &Path) -> io::Result<()> {
    match fs::remove_file(file) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        removed => removed,
    }
}

/// `<file>.<unique>.stale`, a name no other writer picks: this process's id,
/// the time and a count of the names this process has made.
fn aside_path(file: &Path) -> PathBuf {
    static MADE: AtomicU64 = AtomicU64::new(0);
    let unique = format!(
        "{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        MADE.fetch_add(1, Ordering::Relaxed),
    );
    let mut name = file.as_os_str().to_owned();
    name.push(format!(".{unique}.stale"));
    PathBuf::from(name)
}

fn now_ms() -> i64 {
    ms_since_1970(SystemTime::now())
}

fn ms_since_1970(time: SystemTime) -> i64 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(after) => i64::try_from(after.as_millis()).unwrap_or(i64::MAX),
        Err(before) => i64::try_from(before.duration().as_millis()).map_or(i64::MIN, |ms| -ms),
    }
}

#[cfg(test)]
#[path = "lock_tests.rs"]
mod tests;
