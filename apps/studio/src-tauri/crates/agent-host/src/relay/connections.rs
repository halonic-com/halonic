//! The connections the relay has open, by id.

use std::collections::HashMap;
use std::net::{Shutdown, TcpStream};
use std::sync::Arc;
use std::sync::atomic::AtomicUsize;
use std::sync::mpsc::Sender;

use super::ToClient;
use super::limits::Quota;

#[derive(Default)]
pub(super) struct Connections {
    /// The last id given out; ids above it were never opened.
    pub(super) last_id: u32,
    pub(super) open: HashMap<u32, Connection>,
}

/// What the relay knows of a connection's first request. Independent of
/// whether the request carried the token: a request with it is `Streaming`
/// whatever its request line says.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Mode {
    /// Passed to the host as the client sends it; the token deadline applies.
    Streaming,
    /// Starts like the Google callback, and the relay holds its head back
    /// until it is whole. Takes one of the callback places.
    CallbackHead,
    /// Sent exactly its head, which was the callback request. It sends no
    /// more and closes with the host's answer.
    CallbackOnly,
}

pub(super) struct Connection {
    /// A handle on the client's socket, to shut it down.
    pub(super) socket: TcpStream,
    pub(super) to_client: Sender<ToClient>,
    /// Bytes from the host queued for the client and not yet written.
    pub(super) backlog: Arc<AtomicUsize>,
    /// The client's share of the frames waiting for the host's input.
    pub(super) quota: Arc<Quota>,
    pub(super) client_ended: bool,
    pub(super) host_ended: bool,
    /// The client's first request carried the token, so no deadline closes it.
    pub(super) has_token: bool,
    pub(super) mode: Mode,
}

impl Connection {
    /// True while it is, or may still become, a callback-only connection.
    pub(super) fn holds_callback_place(&self) -> bool {
        self.mode != Mode::Streaming
    }

    /// Shuts the client's socket and wakes its reader if it waits for room.
    pub(super) fn shut(self) {
        let _ = self.socket.shutdown(Shutdown::Both);
        self.quota.close();
    }
}
