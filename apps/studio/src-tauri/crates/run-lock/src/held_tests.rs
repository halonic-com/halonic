use super::{HoldError, Renewal, hold_lock};
use crate::ThisComputer;
use crate::record::{parse_record, record_text};
use crate::tests::{FakeComputer, THIS_HOST, TemporaryFolder, record};
use std::cell::Cell;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

#[test]
fn held_lock_hold_takes_a_free_lock_with_its_own_record() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let held = hold_lock(&file, &FakeComputer::here()).expect("taken");
    let text = fs::read_to_string(&file).expect("the lock is there");
    let record = parse_record(&text).expect("a record");
    assert_eq!(
        (record.pid, record.host.as_str()),
        (i64::from(std::process::id()), THIS_HOST)
    );
    held.release().expect("released");
    assert!(folder.names().is_empty());
}

#[test]
fn held_lock_hold_refuses_a_lock_a_live_process_holds_and_names_the_holder() {
    let folder = TemporaryFolder::new();
    // What `holdLock` of fs-node writes: version, pid, host, takenAt.
    let node_text = record(std::process::id(), THIS_HOST, 0);
    let file = folder.lock(Some(&node_text));
    let Err(HoldError::Held(holder)) = hold_lock(&file, &FakeComputer::here()) else {
        panic!("the lock is held by a live process");
    };
    assert_eq!(
        holder.map(|holder| holder.pid),
        Some(i64::from(std::process::id()))
    );
    assert_eq!(fs::read_to_string(&file).expect("untouched"), node_text);
}

#[test]
fn held_lock_hold_takes_over_the_lock_of_a_process_that_has_ended() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(4_000_000, THIS_HOST, 0)));
    let held = hold_lock(&file, &FakeComputer::here()).expect("taken over");
    let record = parse_record(&fs::read_to_string(&file).expect("read")).expect("a record");
    assert_eq!(record.pid, i64::from(std::process::id()));
    held.release().expect("released");
}

#[test]
fn held_lock_hold_takes_over_a_lock_older_than_the_stale_limit() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(
        std::process::id(),
        "another-computer",
        60_000,
    )));
    assert!(hold_lock(&file, &FakeComputer::here()).is_ok());
}

#[test]
fn held_lock_hold_refuses_a_fresh_lock_from_another_computer() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(Some(&record(1, "another-computer", 0)));
    assert!(matches!(
        hold_lock(&file, &FakeComputer::here()),
        Err(HoldError::Held(Some(_)))
    ));
}

#[test]
fn held_lock_renew_writes_the_record_again_and_leaves_no_file_behind() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let computer = FakeComputer::here();
    let mut held = hold_lock(&file, &computer).expect("taken");
    let before = fs::read_to_string(&file).expect("read");
    thread::sleep(Duration::from_millis(5));
    assert_eq!(held.renew(&computer).expect("renewed"), Renewal::Renewed);
    let after = fs::read_to_string(&file).expect("read");
    assert_ne!(before, after);
    assert!(parse_record(&after).is_some());
    assert_eq!(folder.names(), vec!["r1.lock".to_owned()]);
    held.release().expect("released");
    assert!(folder.names().is_empty());
}

#[test]
fn held_lock_renew_gives_up_a_lock_another_process_took_over() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let computer = FakeComputer::here();
    let mut held = hold_lock(&file, &computer).expect("taken");
    let theirs = record_text(7, THIS_HOST, crate::now_ms());
    fs::write(&file, &theirs).expect("another process takes it");
    assert_eq!(
        held.renew(&computer).expect("judged"),
        Renewal::Lost("was taken over by another process".to_owned())
    );
    held.release().expect("released");
    assert_eq!(fs::read_to_string(&file).expect("theirs stays"), theirs);
}

#[test]
fn held_lock_renew_takes_its_own_lock_again_after_missing_its_renewals() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let computer = FakeComputer::here();
    let mut held = hold_lock(&file, &computer).expect("taken");
    // Its own record, but from a minute ago: it missed its renewals while
    // the computer slept, and no other process took it over.
    let aged = record(std::process::id(), THIS_HOST, 60_000);
    fs::write(&file, &aged).expect("aged");
    held.own_text = aged.clone();
    assert_eq!(held.renew(&computer).expect("judged"), Renewal::Renewed);
    let text = fs::read_to_string(&file).expect("the lock is there");
    assert_ne!(text, aged);
    assert_eq!(text, held.own_text);
    let record = parse_record(&text).expect("a record");
    assert_eq!(record.pid, i64::from(std::process::id()));
    assert_eq!(folder.names(), vec!["r1.lock".to_owned()]);
    held.release().expect("released");
    assert!(folder.names().is_empty());
}

#[test]
fn held_lock_renew_after_missing_its_renewals_loses_a_lock_another_process_took_first() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let computer = FakeComputer::here();
    let mut held = hold_lock(&file, &computer).expect("taken");
    let aged = record(std::process::id(), THIS_HOST, 60_000);
    fs::write(&file, &aged).expect("aged");
    held.own_text = aged;
    // Another live process creates the lock the moment ours is removed.
    let theirs = record_text(7, "another-computer", crate::now_ms());
    let racing = RacingComputer {
        file: &file,
        theirs: &theirs,
        asked: Cell::new(0),
    };
    assert_eq!(
        held.renew(&racing).expect("judged"),
        Renewal::Lost("was taken over by another process".to_owned())
    );
    assert_eq!(fs::read_to_string(&file).expect("theirs stays"), theirs);
}

/// This computer, where another process creates the lock `file` when the
/// renewal asks for the host name the second time: after removing its own
/// stale lock, right before taking it again.
struct RacingComputer<'a> {
    file: &'a Path,
    theirs: &'a str,
    asked: Cell<u32>,
}

impl ThisComputer for RacingComputer<'_> {
    fn host_name(&self) -> Option<String> {
        self.asked.set(self.asked.get() + 1);
        if self.asked.get() == 2 {
            fs::write(self.file, self.theirs).expect("another process takes it");
        }
        Some(THIS_HOST.to_owned())
    }

    fn process_alive(&self, pid: u32) -> bool {
        pid == std::process::id()
    }
}

/// The mode bits of `file`: the lock is private (`fs.run-store-private-files`).
#[cfg(unix)]
fn mode_of(file: &std::path::Path) -> u32 {
    let metadata = fs::metadata(file).expect("the file is there");
    std::os::unix::fs::PermissionsExt::mode(&metadata.permissions()) & 0o777
}

#[cfg(unix)]
#[test]
fn held_lock_is_private_when_taken_and_when_renewed() {
    let folder = TemporaryFolder::new();
    let file = folder.lock(None);
    let computer = FakeComputer::here();
    let mut held = hold_lock(&file, &computer).expect("taken");
    assert_eq!(mode_of(&file), 0o600);
    thread::sleep(Duration::from_millis(5));
    held.renew(&computer).expect("renewed");
    assert_eq!(mode_of(&file), 0o600);
    held.release().expect("released");
}
