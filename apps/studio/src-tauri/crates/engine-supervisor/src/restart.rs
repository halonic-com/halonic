use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// How many times a crashed engine is restarted within [`RESTART_WINDOW`].
pub const RESTARTS: usize = 3;

/// The window [`RESTARTS`] counts in.
pub const RESTART_WINDOW: Duration = Duration::from_secs(5 * 60);

/// Whether a crashed engine may start again: at most [`RESTARTS`] times in
/// any [`RESTART_WINDOW`]. After that the engine is in the problem state
/// until the person starts it again, which makes a new limit.
#[derive(Debug, Default)]
pub struct RestartLimit {
    recent: VecDeque<Instant>,
}

impl RestartLimit {
    /// Counts a restart at `now` and says yes, or says no when there were
    /// [`RESTARTS`] already in the window before `now`.
    pub fn may_restart(&mut self, now: Instant) -> bool {
        while self
            .recent
            .front()
            .is_some_and(|&at| now.saturating_duration_since(at) >= RESTART_WINDOW)
        {
            self.recent.pop_front();
        }
        if self.recent.len() >= RESTARTS {
            return false;
        }
        self.recent.push_back(now);
        true
    }
}
