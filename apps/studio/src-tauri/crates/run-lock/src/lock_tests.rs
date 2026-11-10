use super::busy::{ACCESS_DENIED, BusyRetry};
use super::record::{STALE_AFTER_MS, parse_record, record_text};
use super::{ThisComputer, put_back, read_text, remove_stale, remove_stale_reading, with_run_lock};
use std::cell::Cell;
use std::fs::{self, File};
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
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
fn run_lock_puts_back_a_lock_another_writer_took_after_the_stale_one_was_read() {
    let folder = TemporaryFolder::new();
    let fresh = record(std::process::id(), "another-computer", 0);
    let file = folder.lock(Some(&fresh));
    remove_stale(&file, &record(5151, THIS_HOST, 0)).expect("checked");
    assert_eq!(fs::read_to_string(&file).expect("the fresh lock"), fresh);
    assert_eq!(folder.names(), ["r1.lock"]);
}

#[test]
fn run_lock_tries_the_check_of_a_moved_lock_again_and_still_puts_back_a_fresh_one() {
    let folder = TemporaryFolder::new();
    let fresh = record(std::process::id(), "another-computer", 0);
    let file = folder.lock(Some(&fresh));
    let windows = BusyRetry {
        windows: true,
        limit: Duration::from_secs(5),
    };
    let reads = Cell::new(0);
    let busy_once = |aside: &Path| {
        reads.set(reads.get() + 1);
        if reads.get() == 1 {
            Err(io::Error::from_raw_os_error(ACCESS_DENIED))
        } else {
            read_text(aside)
        }
    };
    remove_stale_reading(&file, &record(5151, THIS_HOST, 0), &windows, busy_once).expect("checked");
    assert_eq!(reads.get(), 2);
    assert_eq!(fs::read_to_string(&file).expect("the fresh lock"), fresh);
    assert_eq!(folder.names(), ["r1.lock"]);
}

#[test]
fn run_lock_leaves_alone_a_lock_a_third_writer_took_before_it_could_put_one_back() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some("third writer"));
    let aside = folder.0.join("r1.lock.aside.stale");
    fs::write(&aside, "second writer").expect("planted");
    put_back(&aside, &file).expect("left alone");
    assert_eq!(
        fs::read_to_string(&file).expect("the third lock"),
        "third writer"
    );
}

#[test]
fn run_lock_does_nothing_when_another_writer_removed_the_stale_lock_first() {
    let folder = TemporaryFolder::new();
    remove_stale(&folder.lock(None), "stale").expect("nothing to remove");
    assert!(folder.names().is_empty());
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
