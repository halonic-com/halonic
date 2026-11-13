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
}

impl Connection {
    /// Shuts the client's socket and wakes its reader if it waits for room.
    pub(super) fn shut(self) {
        let _ = self.socket.shutdown(Shutdown::Both);
        self.quota.close();
    }
}
