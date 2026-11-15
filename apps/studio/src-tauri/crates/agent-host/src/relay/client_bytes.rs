//! What a client sends. A connection's first request is held back while it
//! starts like the Google callback, so the relay forwards nothing of it
//! before the whole head is judged (HAL-10028); every other connection is
//! passed on as the client sends it.

use std::io::{self, Read};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::Instant;

use super::callback::{Judgement, judge};
use super::connections::{Connection, Mode};
use super::deadlines::Due;
use super::limits::Quota;
use super::token::TokenCheck;
use super::{DATA, FRAME_LIMIT, RESET, Shared, Taken, ToHost, frame};

/// Where a connection's first request is.
enum Inbound {
    /// Held until it is judged: what the client sent so far.
    Judging(Vec<u8>),
    /// Passed on as it comes.
    Streaming,
}

/// What to do after a client's bytes.
enum Next {
    Read,
    /// The connection is closed, ended or handed over: no more reading.
    Stop,
}

impl Shared {
    /// Passes what the client sends to the host, until the client ends,
    /// fails, or the connection closes. It waits while the client has its
    /// share of the queue to the host, so the others still get through.
    pub(super) fn pass_client_bytes(
        &self,
        id: u32,
        mut socket: TcpStream,
        quota: &Arc<Quota>,
        mut check: TokenCheck,
        accepted: Instant,
    ) {
        let mut buffer = vec![0_u8; FRAME_LIMIT];
        let mut inbound = Inbound::Judging(Vec::new());
        loop {
            match socket.read(&mut buffer) {
                Ok(0) => {
                    if let Inbound::Judging(held) = &inbound {
                        self.end_while_judging(id, quota, &mut check, held);
                    }
                    self.client_ended(id);
                    return;
                }
                Ok(read) => {
                    let sent = &buffer[..read];
                    let held = match &mut inbound {
                        Inbound::Judging(held) => {
                            held.extend_from_slice(sent);
                            Some(std::mem::take(held))
                        }
                        Inbound::Streaming => None,
                    };
                    let next = match held {
                        None => self.stream(id, quota, &mut check, sent),
                        Some(held) => {
                            match self.judge_first_request(id, quota, &mut check, accepted, held) {
                                Ok(next) => {
                                    inbound = Inbound::Streaming;
                                    next
                                }
                                Err(held) => {
                                    inbound = Inbound::Judging(held);
                                    Next::Read
                                }
                            }
                        }
                    };
                    if matches!(next, Next::Stop) {
                        return;
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                Err(_) => {
                    self.reset(id);
                    return;
                }
            }
        }
    }

    /// The client ended before its first request was judged. What it sent
    /// goes on as any other bytes, unless it was held as a callback: that
    /// one never became a request, so it frees its place at once.
    fn end_while_judging(&self, id: u32, quota: &Arc<Quota>, check: &mut TokenCheck, held: &[u8]) {
        let holds_place = self
            .connections()
            .open
            .get(&id)
            .is_some_and(Connection::holds_callback_place);
        if holds_place {
            self.reset(id);
        } else if !held.is_empty() {
            self.stream(id, quota, check, held);
        }
    }

    /// Passes bytes of a connection that is not held back.
    fn stream(&self, id: u32, quota: &Arc<Quota>, check: &mut TokenCheck, sent: &[u8]) -> Next {
        if let Some(connection) = self.connections().open.get_mut(&id) {
            connection.has_token |= check.found(sent);
        } else {
            return Next::Stop;
        }
        self.forward(id, quota, sent)
    }

    /// Judges the first request's bytes so far. `Err` gives them back to wait
    /// for more; `Ok` says what to do now, and the connection streams after.
    fn judge_first_request(
        &self,
        id: u32,
        quota: &Arc<Quota>,
        check: &mut TokenCheck,
        accepted: Instant,
        held: Vec<u8>,
    ) -> Result<Next, Vec<u8>> {
        let judgement = judge(&held);
        match judgement {
            Judgement::Undecided => return Err(held),
            Judgement::Waiting => {
                return if self.hold_callback_place(id, accepted) {
                    Err(held)
                } else {
                    Ok(Next::Stop)
                };
            }
            Judgement::Another => return Ok(self.stream(id, quota, check, &held)),
            Judgement::Callback(_) | Judgement::Refused => {}
        }
        // A request with the token is the host's, whatever its request line.
        if check.found(&held) {
            self.mark_token(id);
            return Ok(self.forward(id, quota, &held));
        }
        let Judgement::Callback(length) = judgement else {
            self.reset(id);
            return Ok(Next::Stop);
        };
        if !self.hold_callback_place(id, accepted) {
            return Ok(Next::Stop);
        }
        // Only the head: later bytes, even of this read, are not forwarded.
        self.set_mode(id, Mode::CallbackOnly);
        self.forward(id, quota, &held[..length]);
        Ok(Next::Stop)
    }

    /// Takes one of the callback places for the connection, once, and starts
    /// its head deadline and lifetime. False, with the connection closed,
    /// when the places are taken.
    fn hold_callback_place(&self, id: u32, accepted: Instant) -> bool {
        {
            let mut connections = self.connections();
            let places_taken = connections
                .open
                .values()
                .filter(|connection| connection.holds_callback_place())
                .count();
            let Some(connection) = connections.open.get_mut(&id) else {
                return false;
            };
            if connection.holds_callback_place() {
                return true;
            }
            if places_taken < self.limits.callback_connections {
                connection.mode = Mode::CallbackHead;
                drop(connections);
                let head = (id, accepted + self.limits.callback_head, Due::CallbackHead);
                let lifetime = (
                    id,
                    accepted + self.limits.callback_lifetime,
                    Due::CallbackLifetime,
                );
                let _ = self.deadlines.send(Some(head));
                let _ = self.deadlines.send(Some(lifetime));
                return true;
            }
        }
        self.reset(id);
        false
    }

    fn mark_token(&self, id: u32) {
        if let Some(connection) = self.connections().open.get_mut(&id) {
            connection.has_token = true;
            connection.mode = Mode::Streaming;
        }
    }

    fn set_mode(&self, id: u32, mode: Mode) {
        if let Some(connection) = self.connections().open.get_mut(&id) {
            connection.mode = mode;
        }
    }

    /// Closes the connection and resets it at the host, if it is still open.
    fn reset(&self, id: u32) {
        if self.close(id) {
            let _ = self.send(id, RESET, &[]);
        }
    }

    /// Queues bytes for the host in frames of at most [`FRAME_LIMIT`].
    fn forward(&self, id: u32, quota: &Arc<Quota>, bytes: &[u8]) -> Next {
        for part in bytes.chunks(FRAME_LIMIT) {
            if !quota.take() || !self.queue.take() {
                return Next::Stop;
            }
            let queued = ToHost::Frame(
                frame(id, DATA, part),
                Taken::PlaceAndShare(Arc::clone(quota)),
            );
            if self.to_host.send(queued).is_err() {
                return Next::Stop;
            }
        }
        Next::Read
    }
}
