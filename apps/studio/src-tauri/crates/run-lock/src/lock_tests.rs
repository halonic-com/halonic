use super::record::{STALE_AFTER_MS, TAKEOVER_STALE_AFTER_MS, parse_record, record_text};
use super::{StaleRemoval, ThisComputer, create_exclusive, remove_stale, with_run_lock};
use std::fs::{self, File};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Barrier;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

/// A computer with a fixed name, on which only `running` processes run.
struct FakeComputer {
    host: Option<&'static str>,
    running: Vec<u32>,
}

const THIS_HOST: &str = "this-computer";

impl FakeComputer {
    fn here() -> Self {
        Self {
            host: Some(THIS_HOST),
            running: vec![std::process::id()],
        }
    }
}

impl ThisComputer for FakeComputer {
    fn host_name(&self) -> Option<String> {
        self.host.map(str::to_owned)
    }

    fn process_alive(&self, pid: u32) -> bool {
        self.running.contains(&pid)
    }
}

/// A folder under the system's temporary folder, removed when dropped.
struct TemporaryFolder(PathBuf);

impl TemporaryFolder {
    fn new() -> Self {
        static MADE: AtomicUsize = AtomicUsize::new(0);
        let name = format!(
            "halonic-run-lock-{}-{}",
            std::process::id(),
            MADE.fetch_add(1, Ordering::SeqCst)
        );
        let path = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("the temporary folder is created");
        Self(path)
    }

    /// `r1.lock` in this folder, holding `text` when given.
    fn lock(&self, text: Option<&str>) -> PathBuf {
        let file = self.0.join("r1.lock");
        if let Some(text) = text {
            fs::write(&file, text).expect("the lock is planted");
        }
        file
    }

    fn names(&self) -> Vec<String> {
        let entries = fs::read_dir(&self.0).expect("the folder is listed");
        entries
            .map(|entry| {
                entry
                    .expect("an entry")
                    .file_name()
                    .to_string_lossy()
                    .into()
            })
            .collect()
    }
}

impl Drop for TemporaryFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A lock record taken `age_ms` ago by `pid` on `host`.
fn record(pid: u32, host: &str, age_ms: i64) -> String {
    record_text(pid, host, super::now_ms() - age_ms)
}

/// Removes `file` after `delay`, from another thread, and says when it has.
fn remove_after(file: &Path, delay: Duration) -> &'static AtomicBool {
    let removed: &'static AtomicBool = Box::leak(Box::new(AtomicBool::new(false)));
    let file = file.to_owned();
    thread::spawn(move || {
        thread::sleep(delay);
        removed.store(true, Ordering::SeqCst);
        fs::remove_file(file).expect("the planted lock is removed");
    });
    removed
}

/// Runs `with_run_lock` and gives how long it took to take the lock.
fn time_to_take(file: &Path, computer: &FakeComputer) -> Duration {
    let started = Instant::now();
    with_run_lock(file, computer, || started.elapsed()).expect("the lock is taken")
}

#[test]
fn run_lock_holds_its_own_record_while_the_work_runs() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let held = with_run_lock(&file, &FakeComputer::here(), || fs::read_to_string(&file));
    let record = parse_record(&held.expect("taken").expect("read")).expect("a record");
    assert_eq!(
        (record.pid, record.host.as_str()),
        (i64::from(std::process::id()), THIS_HOST)
    );
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_writes_no_host_when_this_computer_has_no_name() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let nameless = FakeComputer {
        host: None,
        running: vec![],
    };
    let held = with_run_lock(&file, &nameless, || fs::read_to_string(&file));
    let record = parse_record(&held.expect("taken").expect("read")).expect("a record");
    assert_eq!(record.host, "");
}

#[test]
fn run_lock_waits_while_a_live_writer_on_this_computer_holds_the_lock() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(std::process::id(), THIS_HOST, 0)));
    let removed = remove_after(&file, Duration::from_millis(100));
    with_run_lock(&file, &FakeComputer::here(), || {
        assert!(removed.load(Ordering::SeqCst))
    })
    .expect("the lock is taken");
}

#[test]
fn run_lock_waits_on_a_fresh_lock_from_another_computer() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(5151, "another-computer", 0)));
    let removed = remove_after(&file, Duration::from_millis(100));
    with_run_lock(&file, &FakeComputer::here(), || {
        assert!(removed.load(Ordering::SeqCst))
    })
    .expect("the lock is taken");
}

#[test]
fn run_lock_waits_on_a_fresh_file_that_holds_no_record() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(""));
    let removed = remove_after(&file, Duration::from_millis(100));
    with_run_lock(&file, &FakeComputer::here(), || {
        assert!(removed.load(Ordering::SeqCst))
    })
    .expect("the lock is taken");
}

#[test]
fn run_lock_removes_at_once_a_lock_whose_process_no_longer_runs_here() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(5151, THIS_HOST, 0)));
    assert!(time_to_take(&file, &FakeComputer::here()) < Duration::from_secs(2));
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_removes_at_once_a_lock_from_another_computer_that_is_too_old() {
    let folder = TemporaryFolder::new();
    let old = record(
        std::process::id(),
        "another-computer",
        STALE_AFTER_MS + 60_000,
    );
    let file = folder.lock(Some(&old));
    assert!(time_to_take(&file, &FakeComputer::here()) < Duration::from_secs(2));
}

#[test]
fn run_lock_removes_at_once_a_file_with_no_record_that_is_too_old() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some("not a lock"));
    let old = SystemTime::now() - Duration::from_millis(STALE_AFTER_MS as u64 + 60_000);
    File::options()
        .write(true)
        .open(&file)
        .and_then(|f| f.set_modified(old))
        .expect("aged");
    assert!(time_to_take(&file, &FakeComputer::here()) < Duration::from_secs(2));
}

#[test]
fn run_lock_releases_only_its_own_lock_not_one_another_writer_took_over() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let other = record(5151, "another-computer", 0);
    with_run_lock(&file, &FakeComputer::here(), || fs::write(&file, &other))
        .expect("the lock is taken")
        .expect("the lock is taken over");
    assert_eq!(fs::read_to_string(&file).expect("the other lock"), other);
}

#[test]
fn run_lock_releases_the_lock_when_the_work_panics() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let panicked = std::panic::catch_unwind(|| {
        with_run_lock(&file, &FakeComputer::here(), || panic!("the work fails"))
    });
    assert!(panicked.is_err());
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_fails_without_running_the_work_when_the_folder_is_missing() {
    let folder = TemporaryFolder::new();
    let file = folder.0.join("missing").join("r1.lock");
    let ran = AtomicBool::new(false);
    let result = with_run_lock(&file, &FakeComputer::here(), || {
        ran.store(true, Ordering::SeqCst)
    });
    assert_eq!(result.expect_err("no lock").kind(), ErrorKind::NotFound);
    assert!(!ran.load(Ordering::SeqCst));
}

#[test]
fn run_lock_removes_a_stale_lock_and_its_takeover_file_and_leaves_only_its_own_lock() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(5151, THIS_HOST, 0)));
    let inside = with_run_lock(&file, &FakeComputer::here(), || folder.names());
    assert_eq!(inside.expect("the lock is taken"), ["r1.lock"]);
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_leaves_alone_a_lock_another_writer_took_after_the_stale_one_was_read() {
    // The first writer removed the stale lock and took its own after the
    // second writer read the stale one; a third writer is about to try.
    let folder = TemporaryFolder::new();
    let first = record(std::process::id(), "first-writer", 0);
    let file = folder.lock(Some(&first));
    let second = record(std::process::id(), "second-writer", 0);
    let removal = remove_stale(&file, &record(5151, THIS_HOST, 0), &second);
    assert_eq!(removal.expect("checked"), StaleRemoval::Done);
    let third = record(std::process::id(), "third-writer", 0);
    assert!(!create_exclusive(&file, &third).expect("tried"));
    assert_eq!(fs::read_to_string(&file).expect("the first lock"), first);
    assert_eq!(folder.names(), ["r1.lock"]);
}

#[test]
fn run_lock_does_nothing_when_another_writer_removed_the_stale_lock_first() {
    let folder = TemporaryFolder::new();
    let removal = remove_stale(&folder.lock(None), "stale", "own");
    assert_eq!(removal.expect("nothing to remove"), StaleRemoval::Done);
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_waits_while_another_writer_is_removing_the_stale_lock() {
    let folder = TemporaryFolder::new();
    let stale = record(5151, THIS_HOST, 0);
    let file = folder.lock(Some(&stale));
    let takeover = folder.0.join("r1.lock.takeover");
    fs::write(&takeover, record(std::process::id(), THIS_HOST, 0)).expect("planted");
    let removal = remove_stale(&file, &stale, "own");
    assert_eq!(
        removal.expect("tried"),
        StaleRemoval::AnotherWriterIsRemoving
    );
    assert_eq!(fs::read_to_string(&file).expect("the stale lock"), stale);
    let removed = remove_after(&takeover, Duration::from_millis(100));
    with_run_lock(&file, &FakeComputer::here(), || {
        assert!(removed.load(Ordering::SeqCst))
    })
    .expect("the lock is taken");
    assert!(folder.names().is_empty());
}

#[test]
fn run_lock_removes_a_takeover_file_left_by_a_writer_that_crashed_while_removing() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(5151, THIS_HOST, 0)));
    let takeover = folder.0.join("r1.lock.takeover");
    fs::write(&takeover, record(std::process::id(), THIS_HOST, 0)).expect("planted");
    let old = SystemTime::now() - Duration::from_millis(TAKEOVER_STALE_AFTER_MS as u64 + 1_000);
    File::options()
        .write(true)
        .open(&takeover)
        .and_then(|f| f.set_modified(old))
        .expect("aged");
    assert!(time_to_take(&file, &FakeComputer::here()) < Duration::from_secs(2));
    assert!(folder.names().is_empty());
}

#[cfg(unix)]
#[test]
fn run_lock_fails_instead_of_trying_for_ever_when_the_lock_is_a_link_to_a_missing_file() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    std::os::unix::fs::symlink(folder.0.join("missing"), &file).expect("linked");
    let ran = AtomicBool::new(false);
    let result = with_run_lock(&file, &FakeComputer::here(), || {
        ran.store(true, Ordering::SeqCst)
    });
    let message = result.expect_err("no lock").to_string();
    assert!(
        message.contains("r1.lock is a link to a file that isn't there"),
        "{message}"
    );
    assert!(!ran.load(Ordering::SeqCst));
}

#[cfg(unix)]
#[test]
fn run_lock_fails_instead_of_trying_for_ever_when_the_takeover_file_is_a_link_to_a_missing_file() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(5151, THIS_HOST, 0)));
    let takeover = folder.0.join("r1.lock.takeover");
    std::os::unix::fs::symlink(folder.0.join("missing"), takeover).expect("linked");
    let result = with_run_lock(&file, &FakeComputer::here(), || {});
    let message = result.expect_err("no lock").to_string();
    assert!(message.contains("r1.lock.takeover is a link"), "{message}");
}

#[test]
fn run_lock_lets_only_one_of_many_writers_in_after_a_stale_lock_is_removed() {
    let folder = TemporaryFolder::new();
    for _ in 0..20 {
        let file = folder.lock(Some(&record(5151, THIS_HOST, 0)));
        let start = Barrier::new(6);
        let inside = AtomicBool::new(false);
        thread::scope(|scope| {
            for _ in 0..6 {
                scope.spawn(|| {
                    start.wait();
                    with_run_lock(&file, &FakeComputer::here(), || {
                        assert!(!inside.swap(true, Ordering::SeqCst), "two writers inside");
                        thread::sleep(Duration::from_millis(2));
                        inside.store(false, Ordering::SeqCst);
                    })
                    .expect("the lock is taken");
                });
            }
        });
        assert!(folder.names().is_empty());
    }
}

#[test]
fn run_lock_lets_one_writer_at_a_time_in() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let inside = AtomicBool::new(false);
    let rounds = AtomicUsize::new(0);
    thread::scope(|scope| {
        for _ in 0..4 {
            scope.spawn(|| {
                for _ in 0..10 {
                    with_run_lock(&file, &FakeComputer::here(), || {
                        assert!(!inside.swap(true, Ordering::SeqCst), "two writers inside");
                        thread::sleep(Duration::from_millis(1));
                        inside.store(false, Ordering::SeqCst);
                        rounds.fetch_add(1, Ordering::SeqCst);
                    })
                    .expect("the lock is taken");
                }
            });
        }
    });
    assert_eq!(rounds.load(Ordering::SeqCst), 40);
    assert!(folder.names().is_empty());
}
