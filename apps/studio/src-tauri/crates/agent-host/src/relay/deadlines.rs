//! What the relay waits for at most (HAL-7659): a host that reads none of
//! its input stops the relay, and a connection without the token in its
//! first request closes, as does one that starts like the Google callback
//! and is too slow or lives too long. One thread keeps every clock.

use std::collections::VecDeque;
use std::sync::PoisonError;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Instant;

use super::connections::Mode;
use super::{RESET, Shared};

/// What a connection must have done by its deadline.
#[derive(Clone, Copy)]
pub(super) enum Due {
    /// Sent the token in its first request.
    Token,
    /// Sent a whole head, if it starts like the callback.
    CallbackHead,
    /// Ended, if it was held as a callback-only connection.
    CallbackLifetime,
}

/// A connection's id, when it is due and what for; `None` ends the thread.
pub(super) type Deadline = Option<(u32, Instant, Due)>;

/// Removes the entries of connections `is_open` no longer knows.
fn drop_closed(waiting: &mut VecDeque<(u32, Instant, Due)>, is_open: impl Fn(u32) -> bool) {
    waiting.retain(|&(id, _, _)| is_open(id));
}

impl Shared {
    /// Closes each connection still without the token at its deadline, and
    /// stops the relay once the host has taken too long to read a frame.
    pub(super) fn keep_deadlines(&self, deadlines: &Receiver<Deadline>) {
        let tick = self.limits.host_read / 4;
        // Kept in the order they come due: each kind of deadline has its own
        // time, so a new one may be due before the ones already waiting.
        let mut waiting: VecDeque<(u32, Instant, Due)> = VecDeque::new();
        loop {
            let wait = waiting.front().map_or(tick, |&(_, due, _)| {
                due.saturating_duration_since(Instant::now()).min(tick)
            });
            match deadlines.recv_timeout(wait) {
                Ok(Some(deadline)) => {
                    let at = waiting.partition_point(|&(_, due, _)| due <= deadline.1);
                    waiting.insert(at, deadline);
                }
                Ok(None) | Err(RecvTimeoutError::Disconnected) => return,
                Err(RecvTimeoutError::Timeout) => {}
            }
            if self.host_stopped_reading() {
                self.stop();
                return;
            }
            // Ids are never reused, so an entry for a closed connection can
            // only be dead weight; this keeps the queue to the open ones.
            {
                let connections = self.connections();
                drop_closed(&mut waiting, |id| connections.open.contains_key(&id));
            }
            let now = Instant::now();
            while let Some(&(id, due, kind)) = waiting.front() {
                if due > now {
                    break;
                }
                waiting.pop_front();
                self.close_overdue(id, kind);
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

    /// Closes a connection that is still open and has not done what `kind`
    /// asks by now, and tells the host.
    fn close_overdue(&self, id: u32, kind: Due) {
        let closed = {
            let mut connections = self.connections();
            let overdue = connections.open.get(&id).is_some_and(|connection| {
                match kind {
                    // A held callback has the head deadline instead.
                    Due::Token => connection.mode == Mode::Streaming && !connection.has_token,
                    Due::CallbackHead => connection.mode == Mode::CallbackHead,
                    Due::CallbackLifetime => connection.holds_callback_place(),
                }
            });
            if overdue {
                connections.open.remove(&id)
            } else {
                None
            }
        };
        if let Some(connection) = closed {
            connection.shut();
            let _ = self.send(id, RESET, &[]);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::time::{Duration, Instant};

    use super::{Due, drop_closed};

    #[test]
    fn relay_limits_drops_the_waiting_entries_of_a_closed_connection() {
        let now = Instant::now();
        let mut waiting = VecDeque::from([
            (1, now + Duration::from_secs(5), Due::CallbackHead),
            (2, now + Duration::from_secs(6), Due::Token),
            (1, now + Duration::from_secs(30), Due::CallbackLifetime),
        ]);
        drop_closed(&mut waiting, |id| id == 2);
        let ids: Vec<u32> = waiting.iter().map(|&(id, _, _)| id).collect();
        assert_eq!(ids, [2]);
    }
}
