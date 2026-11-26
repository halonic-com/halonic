//! How long each step of Studio's start and a workspace's open took, in
//! `shell.log` (HAL-19531). Opening a recent workspace right after Studio
//! starts waited about 20 s on Windows; these lines show which step the
//! time went to, in the built app, where there is no console.
//!
//! A line holds step names and whole milliseconds only, never a path, a
//! workspace's name or a message, so a person can attach the log to a
//! report as it is.

use std::fmt::Write as _;
use std::time::{Duration, Instant};

/// Where the timing lines come from in `shell.log`.
const SOURCE: &str = "timings";

/// The steps of one start or open, each with how long it took.
#[derive(Debug)]
pub struct StepTimes {
    began: Instant,
    last: Instant,
    steps: Vec<(&'static str, Duration)>,
}

impl StepTimes {
    /// Starts timing at `now`.
    pub fn starting_at(now: Instant) -> Self {
        Self {
            began: now,
            last: now,
            steps: Vec::new(),
        }
    }

    /// Runs `step` and notes how long it took under `name`.
    pub fn timed<T>(&mut self, name: &'static str, step: impl FnOnce() -> T) -> T {
        let result = step();
        self.ended(name, Instant::now());
        result
    }

    /// Notes that the step `name` ended at `now`: it took the time since
    /// the step before it ended.
    pub fn ended(&mut self, name: &'static str, now: Instant) {
        self.steps
            .push((name, now.saturating_duration_since(self.last)));
        self.last = now;
    }

    /// One line for the log: `what`, then each step and the whole, as
    /// `wsl 812 ms, start 4000 ms (4812 ms in all)`.
    pub fn line(&self, what: &str) -> String {
        let mut line = format!("{what}:");
        for (index, (name, took)) in self.steps.iter().enumerate() {
            let comma = if index == 0 { "" } else { "," };
            let _ = write!(line, "{comma} {name} {} ms", millis(*took));
        }
        let all = self.last.saturating_duration_since(self.began);
        let _ = write!(line, " ({} ms in all)", millis(all));
        line
    }
}

/// The line for a start that is ready `since_page_loaded` after the page
/// loaded, or `None` when the page's load wasn't noted.
pub fn ready_line(since_page_loaded: Option<Duration>) -> Option<String> {
    since_page_loaded.map(|took| {
        format!(
            "Studio's start was ready {} ms after the page loaded",
            millis(took)
        )
    })
}

/// The line for a window's `engine_open`: when it was asked, counted from
/// the page's load, and how long the engine took to answer.
#[cfg(desktop)]
pub fn engine_open_line(asked_after_page_load: Option<Duration>, took: Duration) -> String {
    let asked = asked_after_page_load.map_or_else(String::new, |asked| {
        format!(", asked {} ms after the page loaded", millis(asked))
    });
    format!("a window's engine answered in {} ms{asked}", millis(took))
}

/// Writes `line` to `shell.log`.
pub fn record(line: String) {
    halonic_shell_log::record(SOURCE, line);
}

fn millis(took: Duration) -> u128 {
    took.as_millis()
}

#[cfg(test)]
#[path = "open_timings_tests.rs"]
mod tests;
