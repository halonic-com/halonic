//! What the relay holds at most, so whoever reaches its port can't fill the
//! shell's memory or threads, or keep Studio's own requests waiting.

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

/// The most bytes from the host a connection may have waiting for its client.
/// A client that reads no further is reset, so it can't fill the shell's memory.
pub(super) const BACKLOG_LIMIT: usize = 16 * 1024 * 1024;

/// Frames waiting for the host's input. Bounded, so a client that sends
/// faster than the host reads waits for it.
pub(super) const QUEUED_FRAMES: usize = 64;

/// The most of those frames one connection may have waiting, so a client
/// sending a big body leaves room for the others (HAL-7379).
pub(super) const QUEUED_FRAMES_PER_CONNECTION: usize = 8;

/// The most connections open at once, as the host allows
/// (`maxConnections` in `apps/agent-host`). Each takes two threads; the
/// relay shuts any further one at once (HAL-7379).
pub(super) const CONNECTION_LIMIT: usize = 256;

/// How long the host may take to read one frame. A host that reads none
/// for that long stops the relay, so no client waits on it for good (HAL-7659).
pub(super) const HOST_READ_TIMEOUT: Duration = Duration::from_secs(30);

/// How long a connection may stay open without sending the token in its
/// first request, so a process without it can't hold every connection
/// (HAL-7659).
pub(super) const TOKEN_TIMEOUT: Duration = Duration::from_secs(10);

/// What one relay holds at most and waits for at most.
#[derive(Clone, Copy)]
pub(super) struct Limits {
    pub(super) backlog: usize,
    pub(super) connections: usize,
    pub(super) host_read: Duration,
    pub(super) token: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            backlog: BACKLOG_LIMIT,
            connections: CONNECTION_LIMIT,
            host_read: HOST_READ_TIMEOUT,
            token: TOKEN_TIMEOUT,
        }
    }
}

/// A share of the frames waiting for the host's input: one connection's, or
/// the whole queue's.
pub(super) struct Quota {
    limit: usize,
    state: Mutex<QuotaState>,
    drained: Condvar,
}

#[derive(Default)]
struct QuotaState {
    queued: usize,
    closed: bool,
}

impl Quota {
    pub(super) fn new(limit: usize) -> Self {
        Self {
            limit,
            state: Mutex::default(),
            drained: Condvar::new(),
        }
    }

    /// Waits until one more frame may be queued. False once it has closed:
    /// its frames may never drain then.
    pub(super) fn take(&self) -> bool {
        let mut state = self.state();
        while state.queued >= self.limit && !state.closed {
            state = self
                .drained
                .wait(state)
                .unwrap_or_else(PoisonError::into_inner);
        }
        if state.closed {
            return false;
        }
        state.queued += 1;
        true
    }

    /// One of its frames reached the host's input.
    pub(super) fn give_back(&self) {
        let mut state = self.state();
        state.queued = state.queued.saturating_sub(1);
        drop(state);
        self.drained.notify_one();
    }

    /// The connection, or the relay, closed: wakes whoever waits for good.
    pub(super) fn close(&self) {
        self.state().closed = true;
        self.drained.notify_all();
    }

    /// How many of its frames wait now.
    #[cfg(test)]
    pub(super) fn queued(&self) -> usize {
        self.state().queued
    }

    fn state(&self) -> MutexGuard<'_, QuotaState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{QUEUED_FRAMES_PER_CONNECTION, Quota};

    #[test]
    fn relay_limits_quota_waits_for_room_and_closing_wakes_it_for_good() {
        let quota = Arc::new(Quota::new(QUEUED_FRAMES_PER_CONNECTION));
        for _ in 0..QUEUED_FRAMES_PER_CONNECTION {
            assert!(quota.take());
        }
        quota.give_back();
        assert!(quota.take(), "a frame that reached the host makes room");

        let waiting = Arc::clone(&quota);
        let reader = std::thread::spawn(move || waiting.take());
        quota.close();
        assert!(!reader.join().expect("the reader returns"));
        assert!(!quota.take());
    }
}
