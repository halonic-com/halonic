// Tests for studio.src-tauri.crates.keep-awake.keep-awake: each name starts
// with `keep_awake_` until the trace check reads `cargo test` results.

use std::cell::{Cell, RefCell};
use std::io;
use std::rc::Rc;

use super::*;

/// A power source the test switches between mains and battery.
#[derive(Clone)]
struct FakePower(Rc<Cell<Power>>);

impl PowerSource for FakePower {
    fn power(&self) -> Power {
        self.0.get()
    }
}

/// A lock that records "hold" and "release", can refuse to hold, and can
/// end by itself.
#[derive(Clone, Default)]
struct FakeLock {
    calls: Rc<RefCell<Vec<&'static str>>>,
    refuse: Rc<Cell<bool>>,
    ended: Rc<Cell<bool>>,
}

impl SleepLock for FakeLock {
    fn hold(&mut self) -> io::Result<()> {
        if self.refuse.get() {
            return Err(io::Error::other("refused"));
        }
        self.calls.borrow_mut().push("hold");
        Ok(())
    }

    fn release(&mut self) {
        self.ended.set(false);
        self.calls.borrow_mut().push("release");
    }

    fn held(&mut self) -> bool {
        !self.ended.get()
    }
}

fn keep_awake(power: Power) -> (KeepAwake<FakePower, FakeLock>, Rc<Cell<Power>>, FakeLock) {
    let source = Rc::new(Cell::new(power));
    let lock = FakeLock::default();
    (
        KeepAwake::new(FakePower(source.clone()), lock.clone()),
        source,
        lock,
    )
}

#[test]
fn keep_awake_holds_nothing_on_a_fresh_install() {
    let (mut keep, _, lock) = keep_awake(Power::Mains);
    assert_eq!(keep.check().ok(), Some(false));
    assert!(!keep.watching());
    assert!(lock.calls.borrow().is_empty());
}

#[test]
fn keep_awake_holds_only_with_the_setting_and_remote_on_and_mains_power() {
    let (mut keep, _, lock) = keep_awake(Power::Mains);
    assert_eq!(keep.set(true, false).ok(), Some(false));
    assert_eq!(keep.set(false, true).ok(), Some(false));
    assert_eq!(keep.set(true, true).ok(), Some(true));
    assert_eq!(*lock.calls.borrow(), ["hold"]);
}

#[test]
fn keep_awake_releases_on_battery_and_holds_again_on_mains() {
    let (mut keep, power, lock) = keep_awake(Power::Mains);
    assert_eq!(keep.set(true, true).ok(), Some(true));
    power.set(Power::Battery);
    assert_eq!(keep.check().ok(), Some(false));
    power.set(Power::Unknown);
    assert_eq!(keep.check().ok(), Some(false));
    power.set(Power::Mains);
    assert_eq!(keep.check().ok(), Some(true));
    assert_eq!(*lock.calls.borrow(), ["hold", "release", "hold"]);
}

#[test]
fn keep_awake_releases_when_either_switch_turns_off() {
    let (mut keep, _, lock) = keep_awake(Power::Mains);
    assert_eq!(keep.set(true, true).ok(), Some(true));
    assert_eq!(keep.set(false, true).ok(), Some(false));
    assert_eq!(keep.set(true, true).ok(), Some(true));
    assert_eq!(keep.set(true, false).ok(), Some(false));
    assert_eq!(*lock.calls.borrow(), ["hold", "release", "hold", "release"]);
}

#[test]
fn keep_awake_never_holds_on_battery() {
    let (mut keep, _, lock) = keep_awake(Power::Battery);
    assert_eq!(keep.set(true, true).ok(), Some(false));
    assert!(keep.watching());
    assert!(lock.calls.borrow().is_empty());
}

#[test]
fn keep_awake_says_when_the_lock_cant_be_held_and_tries_again() {
    let (mut keep, _, lock) = keep_awake(Power::Mains);
    lock.refuse.set(true);
    assert!(keep.set(true, true).is_err());
    assert!(!keep.holding());
    lock.refuse.set(false);
    assert_eq!(keep.check().ok(), Some(true));
}

#[test]
fn keep_awake_says_when_the_lock_ended_by_itself_and_holds_it_again() {
    let (mut keep, _, lock) = keep_awake(Power::Mains);
    assert_eq!(keep.set(true, true).ok(), Some(true));
    lock.ended.set(true);
    assert!(keep.check().is_err());
    assert!(!keep.holding());
    assert_eq!(keep.check().ok(), Some(true));
    assert_eq!(*lock.calls.borrow(), ["hold", "release", "hold"]);
}

#[test]
fn keep_awake_reads_linux_power_supplies() {
    let plugged = [("Mains\n", Some("1\n")), ("Battery\n", Some("0\n"))];
    assert_eq!(linux_power(plugged), Power::Mains);
    let unplugged = [("Mains", Some("0")), ("Battery", None)];
    assert_eq!(linux_power(unplugged), Power::Battery);
    assert_eq!(
        linux_power([("USB", Some("1")), ("Battery", None)]),
        Power::Mains
    );
    // A desktop: no battery at all.
    assert_eq!(linux_power([]), Power::Mains);
}

#[test]
fn keep_awake_reads_macos_pmset() {
    let mains = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged;";
    assert_eq!(macos_power(mains), Power::Mains);
    let battery = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t80%;";
    assert_eq!(macos_power(battery), Power::Battery);
    assert_eq!(macos_power("Now drawing from 'UPS Power'"), Power::Battery);
    assert_eq!(macos_power(""), Power::Unknown);
}
