//! Requirement `engine-lock-commands`: the lock file the commands work out,
//! and the locks the shell holds for its windows.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use halonic_git_guard::OpenedFolders;
use halonic_profile::{Platform, ProfileFolder};
use halonic_run_lock::{parse_record, record_text};

use super::{EngineLockState, LockLost, engine_lock_file};

/// A folder of its own for one test, removed when the test ends.
struct TestFolder(PathBuf);

impl TestFolder {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("engine-lock-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the folder can be created");
        Self(folder)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    /// A profile in a folder of this one; nothing is created in it.
    fn profile(&self) -> ProfileFolder {
        ProfileFolder {
            platform: Platform::current(),
            root: self
                .0
                .join("profile")
                .to_str()
                .expect("a Unicode temporary folder")
                .to_owned(),
        }
    }

    /// The engine lock of a workspace folder of this one, opened.
    fn lock_file(&self) -> PathBuf {
        let workspace = self.0.join("acme");
        fs::create_dir_all(&workspace).expect("the workspace is made");
        let opened = OpenedFolders::new();
        opened.open(&workspace).expect("the workspace opens");
        engine_lock_file(&opened, &self.profile(), &workspace).expect("a lock file")
    }
}

impl Drop for TestFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A page that never hears of a lost lock.
fn quiet() -> Box<dyn Fn(LockLost) + Send> {
    Box::new(|_| {})
}

/// A page that sends what it hears of a lost lock to the receiver.
fn listening() -> (Box<dyn Fn(LockLost) + Send>, mpsc::Receiver<LockLost>) {
    let (send, heard) = mpsc::channel();
    (
        Box::new(move |lost| {
            let _ = send.send(lost);
        }),
        heard,
    )
}

fn holder_pid(file: &Path) -> Option<i64> {
    parse_record(&fs::read_to_string(file).ok()?).map(|record| record.pid)
}

fn wait_until(what: &str, check: impl Fn() -> bool) {
    let started = Instant::now();
    while !check() {
        assert!(started.elapsed() < Duration::from_secs(5), "{what}");
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn engine_lock_commands_is_engine_lock_in_the_workspace_s_folder_in_the_profile() {
    let folder = TestFolder::new("file");
    let file = folder.lock_file();

    let real_path = fs::canonicalize(folder.path().join("acme")).unwrap();
    let workspace_folder = folder
        .profile()
        .workspace_folders(real_path.to_str().unwrap())
        .unwrap()
        .folder;
    assert_eq!(file, Path::new(&workspace_folder).join("engine.lock"));
    assert!(Path::new(&workspace_folder).is_dir());
}

#[test]
fn engine_lock_commands_refuses_a_workspace_that_isn_t_opened() {
    let folder = TestFolder::new("not-opened");
    let refused = engine_lock_file(&OpenedFolders::new(), &folder.profile(), folder.path());
    let refusal = refused.expect_err("nothing is opened");
    assert_eq!(refusal.kind, "folder_not_open");
}

#[test]
fn engine_lock_commands_is_held_for_a_window_until_it_releases_it() {
    let folder = TestFolder::new("hold");
    let file = folder.lock_file();
    let state = EngineLockState::default();

    state
        .hold("main", &file, quiet())
        .expect("the lock is taken");
    assert_eq!(holder_pid(&file), Some(i64::from(std::process::id())));
    state.release("main", &file);
    assert!(!file.exists());
}

#[test]
fn engine_lock_commands_is_taken_back_by_the_window_that_holds_it_when_its_page_reloads() {
    let folder = TestFolder::new("reload");
    let file = folder.lock_file();
    let state = EngineLockState::default();

    state
        .hold("main", &file, quiet())
        .expect("the lock is taken");
    let before = fs::read_to_string(&file).unwrap();
    state
        .hold("main", &file, quiet())
        .expect("the reloaded page asks again");
    assert_eq!(fs::read_to_string(&file).unwrap(), before);
}

#[test]
fn engine_lock_commands_is_refused_to_another_window_and_to_an_engine_in_another_process() {
    let folder = TestFolder::new("refused");
    let file = folder.lock_file();
    let state = EngineLockState::default();
    state
        .hold("main", &file, quiet())
        .expect("the lock is taken");

    let other_window = state
        .hold("second", &file, quiet())
        .expect_err("it is held");
    assert_eq!(other_window.kind, "conflict");
    assert_eq!(other_window.pid, Some(i64::from(std::process::id())));
    assert!(other_window.message.contains("Another engine is open"));
    state.release_all();

    // What the CLI's `holdLock` writes, from a process that runs: this one.
    let cli = record_text(std::process::id(), &host(), now_ms());
    fs::write(&file, &cli).unwrap();
    let refusal = state
        .hold("main", &file, quiet())
        .expect_err("the CLI holds it");
    assert_eq!(refusal.kind, "conflict");
    assert_eq!(fs::read_to_string(&file).unwrap(), cli);
}

#[test]
fn engine_lock_commands_takes_over_the_lock_of_a_process_that_has_ended() {
    let folder = TestFolder::new("stale");
    let file = folder.lock_file();
    fs::write(&file, record_text(4_000_000, &host(), now_ms())).unwrap();
    let state = EngineLockState::default();

    state
        .hold("main", &file, quiet())
        .expect("a dead holder's lock is taken over");
    assert_eq!(holder_pid(&file), Some(i64::from(std::process::id())));
}

#[test]
fn engine_lock_commands_is_released_when_its_window_closes_or_the_app_quits() {
    let folder = TestFolder::new("close");
    let file = folder.lock_file();
    let state = EngineLockState::default();

    state.hold("main", &file, quiet()).unwrap();
    state.release_window("second");
    assert!(file.exists());
    state.release_window("main");
    assert!(!file.exists());

    state.hold("main", &file, quiet()).unwrap();
    state.release_all();
    assert!(!file.exists());
}

#[test]
fn engine_lock_commands_is_renewed_while_it_is_held() {
    let folder = TestFolder::new("renew");
    let file = folder.lock_file();
    let state = EngineLockState::renewing_every(Duration::from_millis(20));

    state.hold("main", &file, quiet()).unwrap();
    let first = fs::read_to_string(&file).unwrap();
    wait_until("the record is written again", || {
        fs::read_to_string(&file).is_ok_and(|text| text != first)
    });
    state.release_all();
    assert!(!file.exists());
}

#[test]
fn engine_lock_commands_taken_again_after_another_process_took_it_over() {
    let folder = TestFolder::new("lost");
    let file = folder.lock_file();
    let state = EngineLockState::renewing_every(Duration::from_millis(20));
    state.hold("main", &file, quiet()).unwrap();

    // Another computer's engine takes the lock over; this one gives it up.
    let theirs = record_text(1, "another-computer", now_ms());
    fs::write(&file, &theirs).unwrap();
    wait_until("the renewal finds the lock taken over", || {
        state.hold("main", &file, quiet()).is_err()
    });
    assert_eq!(fs::read_to_string(&file).unwrap(), theirs);
}

#[test]
fn engine_lock_commands_tells_the_page_when_another_process_takes_the_lock_over() {
    let folder = TestFolder::new("tell");
    let file = folder.lock_file();
    let state = EngineLockState::renewing_every(Duration::from_millis(20));
    let (tell, heard) = listening();
    state.hold("main", &file, tell).unwrap();

    fs::write(&file, record_text(1, "another-computer", now_ms())).unwrap();
    let lost = heard
        .recv_timeout(Duration::from_secs(5))
        .expect("the page hears that the lock is lost");
    assert!(lost.message.contains("taken over"), "{}", lost.message);
    assert!(
        heard.recv_timeout(Duration::from_millis(100)).is_err(),
        "it is told once"
    );
}

#[test]
fn engine_lock_commands_tells_the_page_that_reloaded_and_not_the_one_that_left() {
    let folder = TestFolder::new("tell-reload");
    let file = folder.lock_file();
    let state = EngineLockState::renewing_every(Duration::from_millis(20));
    let (before, heard_before) = listening();
    state.hold("main", &file, before).unwrap();
    let (after, heard_after) = listening();
    state
        .hold("main", &file, after)
        .expect("the reloaded page asks again");

    fs::write(&file, record_text(1, "another-computer", now_ms())).unwrap();
    heard_after
        .recv_timeout(Duration::from_secs(5))
        .expect("the page that holds the lock hears");
    assert!(heard_before.try_recv().is_err());
}

fn host() -> String {
    halonic_process_probe::host_name().expect("this computer has a name")
}

fn now_ms() -> i64 {
    let since = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    i64::try_from(since.as_millis()).unwrap()
}
