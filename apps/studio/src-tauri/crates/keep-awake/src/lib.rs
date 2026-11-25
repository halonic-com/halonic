//! "Keep this computer awake while it's plugged in" (phase 2 G5, HAL-17641;
//! section 2.4 of the HAL-17511 architecture note, the board's ★P4). A
//! "don't sleep" lock is held only while the setting is on, remote is on and
//! the computer runs on mains power; it is released on battery and as soon
//! as either switch turns off. Both switches start off, so a fresh install
//! holds nothing.
//!
//! [`KeepAwake`] decides, over a [`PowerSource`] and a [`SleepLock`], so the
//! tests drive it with fakes. [`SystemPower`] and [`SystemSleepLock`] are the
//! real ones (`system`). Plain Rust with no Tauri types.

mod system;

use std::io;

pub use system::{SystemPower, SystemSleepLock, linux_power, macos_power};

/// Where the computer takes its power from now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Power {
    /// Plugged in, or a computer with no battery.
    Mains,
    /// Running on its battery.
    Battery,
    /// The system didn't say. The lock isn't held: it is for mains only.
    Unknown,
}

/// Reads where the computer takes its power from.
pub trait PowerSource {
    /// The power source now.
    fn power(&self) -> Power;
}

/// The system's "don't sleep" lock.
pub trait SleepLock {
    /// Holds the lock. Called only while it isn't held.
    fn hold(&mut self) -> io::Result<()>;
    /// Releases the lock. Called only while it is held.
    fn release(&mut self);
}

/// Holds the lock exactly while the setting and remote are on and the
/// computer is on mains power.
pub struct KeepAwake<P, L> {
    power: P,
    lock: L,
    setting: bool,
    remote: bool,
    holding: bool,
}

impl<P: PowerSource, L: SleepLock> KeepAwake<P, L> {
    /// Both switches off and the lock not held, as on a fresh install.
    pub fn new(power: P, lock: L) -> Self {
        Self {
            power,
            lock,
            setting: false,
            remote: false,
            holding: false,
        }
    }

    /// Takes both switches and holds or releases the lock to match; answers
    /// whether it is held now.
    pub fn set(&mut self, setting: bool, remote: bool) -> io::Result<bool> {
        self.setting = setting;
        self.remote = remote;
        self.check()
    }

    /// Reads the power source again and holds or releases the lock to match;
    /// answers whether it is held now. The power is read only while both
    /// switches are on, so an unused setting runs nothing.
    pub fn check(&mut self) -> io::Result<bool> {
        let wanted = self.setting && self.remote && self.power.power() == Power::Mains;
        if wanted && !self.holding {
            self.lock.hold()?;
            self.holding = true;
        } else if !wanted && self.holding {
            self.lock.release();
            self.holding = false;
        }
        Ok(self.holding)
    }

    /// Whether the lock is held now.
    pub fn holding(&self) -> bool {
        self.holding
    }

    /// Whether the power source needs reading again: only while both
    /// switches are on.
    pub fn watching(&self) -> bool {
        self.setting && self.remote
    }
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
