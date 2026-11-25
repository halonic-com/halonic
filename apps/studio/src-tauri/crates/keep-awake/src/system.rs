//! The system's power source and "don't sleep" lock (section 2.4 of the
//! HAL-17511 architecture note): a logind inhibitor on Linux, an
//! `IOPMAssertion` on macOS (through `caffeinate`), and
//! `SetThreadExecutionState` on Windows. Each stops sleep only: the screen
//! may still turn off and lock.

use crate::{Power, PowerSource, SleepLock};

/// Linux: the power source from `/sys/class/power_supply`, given each
/// supply's `type` and `online`. A mains or USB supply that is online means
/// mains; otherwise a battery means battery; a computer with no battery runs
/// on mains.
pub fn linux_power<'a>(supplies: impl IntoIterator<Item = (&'a str, Option<&'a str>)>) -> Power {
    let mut battery = false;
    for (kind, online) in supplies {
        match kind.trim() {
            "Mains" | "USB" if online.map(str::trim) == Some("1") => return Power::Mains,
            "Battery" => battery = true,
            _ => {}
        }
    }
    if battery {
        Power::Battery
    } else {
        Power::Mains
    }
}

/// macOS: the power source from the first line of `pmset -g ps`, such as
/// "Now drawing from 'AC Power'". A UPS means the mains has failed.
pub fn macos_power(output: &str) -> Power {
    let first = output.lines().next().unwrap_or_default();
    if first.contains("'AC Power'") {
        Power::Mains
    } else if first.contains("'Battery Power'") || first.contains("'UPS Power'") {
        Power::Battery
    } else {
        Power::Unknown
    }
}

/// The crate's one way to make a command. Unix only: Windows needs none, so
/// no console window can flash up (HAL-13197).
#[cfg(unix)]
#[expect(
    clippy::disallowed_methods,
    reason = "Unix only, where a command opens no console window"
)]
fn command(program: &str) -> std::process::Command {
    std::process::Command::new(program)
}

/// This computer's power source.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemPower;

impl PowerSource for SystemPower {
    #[cfg(target_os = "linux")]
    fn power(&self) -> Power {
        let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
            return Power::Unknown;
        };
        let supplies: Vec<(String, Option<String>)> = entries
            .flatten()
            .map(|entry| {
                let read = |name: &str| std::fs::read_to_string(entry.path().join(name)).ok();
                (read("type").unwrap_or_default(), read("online"))
            })
            .collect();
        linux_power(
            supplies
                .iter()
                .map(|(kind, online)| (kind.as_str(), online.as_deref())),
        )
    }

    #[cfg(target_os = "macos")]
    fn power(&self) -> Power {
        match command("/usr/bin/pmset").args(["-g", "ps"]).output() {
            Ok(output) if output.status.success() => {
                macos_power(&String::from_utf8_lossy(&output.stdout))
            }
            _ => Power::Unknown,
        }
    }

    #[cfg(windows)]
    fn power(&self) -> Power {
        windows::power()
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    fn power(&self) -> Power {
        Power::Unknown
    }
}

/// This computer's "don't sleep" lock. Dropping it releases the lock.
#[derive(Default)]
pub struct SystemSleepLock {
    #[cfg(unix)]
    holder: Option<std::process::Child>,
    #[cfg(windows)]
    holder: Option<windows::Holder>,
}

#[cfg(unix)]
impl SleepLock for SystemSleepLock {
    /// Starts a helper that holds the lock for as long as it runs. Each one
    /// also ends with Halonic, so a crash never leaves the lock held:
    /// `caffeinate -w` watches Halonic's process, and `cat` under
    /// `systemd-inhibit` ends when Halonic's end of its input closes.
    fn hold(&mut self) -> std::io::Result<()> {
        use std::process::Stdio;
        let mut command = if cfg!(target_os = "macos") {
            let mut command = command("/usr/bin/caffeinate");
            command.args(["-i", "-w", &std::process::id().to_string()]);
            command
        } else {
            let mut command = command("systemd-inhibit");
            command.args([
                "--what=sleep:idle",
                "--who=Halonic",
                "--why=So your phone can reach this computer",
                "--mode=block",
                "cat",
            ]);
            command
        };
        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        self.holder = Some(child);
        Ok(())
    }

    fn release(&mut self) {
        if let Some(mut child) = self.holder.take() {
            drop(child.stdin.take());
            // It may have ended already; either way it is gone after `wait`.
            let _ended = child.kill();
            let _reaped = child.wait();
        }
    }
}

#[cfg(windows)]
impl SleepLock for SystemSleepLock {
    fn hold(&mut self) -> std::io::Result<()> {
        self.holder = Some(windows::Holder::start()?);
        Ok(())
    }

    fn release(&mut self) {
        self.holder = None;
    }
}

impl Drop for SystemSleepLock {
    fn drop(&mut self) {
        if self.holder.is_some() {
            self.release();
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::io;
    use std::sync::mpsc;
    use std::thread;

    use windows_sys::Win32::System::Power::{
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED, GetSystemPowerStatus, SYSTEM_POWER_STATUS,
        SetThreadExecutionState,
    };

    use crate::Power;

    /// `ACLineStatus` from `GetSystemPowerStatus`: 1 online, 0 offline, 255 unknown.
    pub(super) fn power() -> Power {
        let mut status: SYSTEM_POWER_STATUS = SYSTEM_POWER_STATUS {
            ACLineStatus: 255,
            BatteryFlag: 255,
            BatteryLifePercent: 255,
            SystemStatusFlag: 0,
            BatteryLifeTime: u32::MAX,
            BatteryFullLifeTime: u32::MAX,
        };
        // SAFETY: `status` is a valid, writable SYSTEM_POWER_STATUS that
        // outlives the call.
        if unsafe { GetSystemPowerStatus(&mut status) } == 0 {
            return Power::Unknown;
        }
        match status.ACLineStatus {
            1 => Power::Mains,
            0 => Power::Battery,
            _ => Power::Unknown,
        }
    }

    /// A thread that holds the execution state: Windows ties it to the
    /// thread that set it, so one thread holds it and clears it.
    pub(super) struct Holder {
        release: Option<mpsc::Sender<()>>,
        thread: Option<thread::JoinHandle<()>>,
    }

    impl Holder {
        pub(super) fn start() -> io::Result<Self> {
            let (release, released) = mpsc::channel::<()>();
            let (held, holding) = mpsc::channel::<bool>();
            let thread = thread::Builder::new()
                .name("keep-awake".into())
                .spawn(move || {
                    // SAFETY: plain flags, no pointers.
                    let set =
                        unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) };
                    let _answered = held.send(set != 0);
                    // Waits until released, or until the Holder is dropped.
                    let _ = released.recv();
                    // SAFETY: plain flags, no pointers.
                    unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
                })?;
            if holding.recv() != Ok(true) {
                let _ = thread.join();
                return Err(io::Error::other("SetThreadExecutionState failed"));
            }
            Ok(Self {
                release: Some(release),
                thread: Some(thread),
            })
        }
    }

    impl Drop for Holder {
        fn drop(&mut self) {
            drop(self.release.take());
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }
}
