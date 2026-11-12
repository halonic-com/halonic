//! What the relay waits for at most (HAL-7659): a host that reads none of
//! its input stops the relay, and a connection without the token in its
//! first request closes. One thread keeps both clocks.

use std::collections::VecDeque;
use std::sync::PoisonError;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Instant;

use super::{RESET, Shared};

/// A connection's id and when it must have sent the token; `None` ends the thread.
pub(super) type Deadline = Option<(u32, Instant)>;

impl Shared {
    /// Closes each connection still without the token at its deadline, and
    /// stops the relay once the host has taken too long to read a frame.
    pub(super) fn keep_deadlines(&self, deadlines: &Receiver<Deadline>) {
        let tick = self.limits.host_read / 4;
        // Every connection gets the same time, so they come due in order.
        let mut waiting = VecDeque::new();
        loop {
            let wait = waiting.front().map_or(tick, |&(_, due): &(u32, Instant)| {
                due.saturating_duration_since(Instant::now()).min(tick)
            });
            match deadlines.recv_timeout(wait) {
                Ok(Some(deadline)) => waiting.push_back(deadline),
                Ok(None) | Err(RecvTimeoutError::Disconnected) => return,
                Err(RecvTimeoutError::Timeout) => {}
            }
            if self.host_stopped_reading() {
                self.stop();
                return;
            }
            let now = Instant::now();
            while let Some(&(id, due)) = waiting.front() {
                if due > now {
                    break;
                }
                waiting.pop_front();
                self.close_without_token(id);
            }
        }
    }

    fn host_stopped_reading(&self) -> bool {
        let writing_since = *self
            .writing_since
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        writing_since.is_some_and(|since| since.elapsed() >= self.limits.host_read)
    }

    /// Closes a connection that is still open without the token, and tells the host.
    fn close_without_token(&self, id: u32) {
        let closed = {
            let mut connections = self.connections();
            match connections.open.get(&id) {
                Some(connection) if !connection.has_token => connections.open.remove(&id),
                _ => None,
            }
        };
        if let Some(connection) = closed {
            connection.shut();
            let _ = self.send(id, RESET, &[]);
        }
    }
}
