//! The relay for a host that serves over its standard input and output
//! (`--stdio`; `apps/agent-host/README.md`, "Serving over standard input and
//! output"). In Halonic's WSL distro the host listens on no port, because
//! every WSL 2 distro of a person shares one network (HAL-5396, review W9).
//! The relay listens on Windows' own loopback instead and passes each
//! connection it accepts to the host as frames:
//!
//! ```text
//! [connection id: u32 big-endian][kind: u8][length: u32 big-endian][bytes]
//! ```
//!
//! The relay opens connections and numbers them 1, 2, 3, …, never reusing an
//! id. Either side can end one (a half-close) or reset it. One thread writes
//! every frame to the host; one reads the host's frames all the time and
//! queues each connection's bytes, so a client that reads slowly never holds
//! up the others. Only std, so it builds and tests anywhere.

use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

/// The most bytes one frame carries.
pub(crate) const FRAME_LIMIT: usize = 64 * 1024;

/// Connection id (4), kind (1) and length (4).
const HEADER_LENGTH: usize = 9;

const OPEN: u8 = 1;
const DATA: u8 = 2;
const END: u8 = 3;
const RESET: u8 = 4;

/// The most bytes from the host a connection may have waiting for its client.
/// A client that reads no further is reset, so it can't fill the shell's memory.
const BACKLOG_LIMIT: usize = 16 * 1024 * 1024;

/// Frames waiting for the host's input. Bounded, so a client that sends
/// faster than the host reads waits for it.
const QUEUED_FRAMES: usize = 64;

/// How long stopping waits to wake the thread that accepts connections.
const WAKE_TIMEOUT: Duration = Duration::from_secs(1);

/// What goes to the host's input.
enum ToHost {
    Frame(Vec<u8>),
    /// Close the host's input, so it stops.
    Close,
}

/// What the host sent a connection's client.
enum ToClient {
    Data(Vec<u8>),
    End,
}

/// A relay on `127.0.0.1` for one host. Dropping it stops it.
pub(crate) struct Relay {
    shared: Arc<Shared>,
    /// The listener and the host's frames until [`Relay::serve`] starts.
    waiting: Option<(TcpListener, Receiver<ToHost>)>,
}

impl Relay {
    /// Listens on a free port of `127.0.0.1`. Nothing is accepted until
    /// [`Relay::serve`]: the host needs the port before it starts.
    pub(crate) fn bind() -> io::Result<Self> {
        Self::bind_with_backlog_limit(BACKLOG_LIMIT)
    }

    fn bind_with_backlog_limit(backlog_limit: usize) -> io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let port = listener.local_addr()?.port();
        let (to_host, frames) = mpsc::sync_channel(QUEUED_FRAMES);
        let shared = Arc::new(Shared {
            port,
            backlog_limit,
            stopped: AtomicBool::new(false),
            to_host,
            connections: Mutex::default(),
        });
        Ok(Self {
            shared,
            waiting: Some((listener, frames)),
        })
    }

    /// The port the relay listens on.
    pub(crate) fn port(&self) -> u16 {
        self.shared.port
    }

    /// Starts passing connections to the host: frames go to `input`, the
    /// host's standard input, and come from `output`, its standard output
    /// after the handshake line. Calling it again does nothing.
    pub(crate) fn serve(
        &mut self,
        input: impl Write + Send + 'static,
        output: impl Read + Send + 'static,
    ) {
        let Some((listener, frames)) = self.waiting.take() else {
            return;
        };
        let shared = Arc::clone(&self.shared);
        spawn("relay-to-host", move || {
            shared.pass_frames_to_host(input, frames)
        });
        let shared = Arc::clone(&self.shared);
        spawn("relay-from-host", move || shared.pass_host_frames(output));
        let shared = Arc::clone(&self.shared);
        spawn("relay-accept", move || shared.accept(&listener));
    }

    /// Closes the host's input, so it stops, and every connection. Stopping
    /// twice does nothing.
    pub(crate) fn stop(&self) {
        self.shared.stop();
    }
}

impl Drop for Relay {
    fn drop(&mut self) {
        self.stop();
    }
}

impl std::fmt::Debug for Relay {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Relay")
            .field("port", &self.shared.port)
            .finish_non_exhaustive()
    }
}

struct Shared {
    port: u16,
    backlog_limit: usize,
    stopped: AtomicBool,
    to_host: SyncSender<ToHost>,
    connections: Mutex<Connections>,
}

#[derive(Default)]
struct Connections {
    /// The last id given out; ids above it were never opened.
    last_id: u32,
    open: HashMap<u32, Connection>,
}

struct Connection {
    /// A handle on the client's socket, to shut it down.
    socket: TcpStream,
    to_client: Sender<ToClient>,
    /// Bytes from the host queued for the client and not yet written.
    backlog: Arc<AtomicUsize>,
    client_ended: bool,
    host_ended: bool,
}

/// A frame from the host the stream can't go on after.
struct Broken;

impl Shared {
    fn connections(&self) -> MutexGuard<'_, Connections> {
        // A thread that panicked holding the lock left whole entries behind.
        self.connections
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    fn send(&self, id: u32, kind: u8, bytes: &[u8]) -> Result<(), Broken> {
        self.to_host
            .send(ToHost::Frame(frame(id, kind, bytes)))
            .map_err(|_| Broken)
    }

    /// Sends a reset without waiting, for the thread that reads the host's
    /// frames: it must never wait on the host's input.
    fn send_reset_later(self: &Arc<Self>, id: u32) {
        let shared = Arc::clone(self);
        spawn("relay-reset", move || {
            let _ = shared.send(id, RESET, &[]);
        });
    }

    fn accept(self: &Arc<Self>, listener: &TcpListener) {
        for socket in listener.incoming() {
            if self.stopped.load(Ordering::SeqCst) {
                return;
            }
            // A client that went before it was accepted fails here; others go on.
            let Ok(socket) = socket else { continue };
            if self.open(socket).is_err() {
                self.stop();
                return;
            }
        }
    }

    /// Opens a connection for `socket`, tells the host, and starts passing
    /// its bytes both ways.
    fn open(self: &Arc<Self>, socket: TcpStream) -> Result<(), Broken> {
        let _ = socket.set_nodelay(true);
        let (Ok(reader), Ok(writer)) = (socket.try_clone(), socket.try_clone()) else {
            // Without handles the connection can't be served; others can.
            let _ = socket.shutdown(Shutdown::Both);
            return Ok(());
        };
        let (to_client, from_host) = mpsc::channel();
        let backlog = Arc::new(AtomicUsize::new(0));
        let id = {
            let mut connections = self.connections();
            // Ids are never reused; after 4 billion connections the relay stops.
            let id = connections.last_id.checked_add(1).ok_or(Broken)?;
            connections.last_id = id;
            let connection = Connection {
                socket,
                to_client,
                backlog: Arc::clone(&backlog),
                client_ended: false,
                host_ended: false,
            };
            connections.open.insert(id, connection);
            id
        };
        // Sent before the client's bytes can be, so `open` comes first.
        self.send(id, OPEN, &[])?;
        let shared = Arc::clone(self);
        spawn("relay-client-in", move || {
            shared.pass_client_bytes(id, reader)
        });
        let shared = Arc::clone(self);
        spawn("relay-client-out", move || {
            shared.pass_host_bytes(id, writer, &from_host, &backlog);
        });
        Ok(())
    }

    /// Passes what the client sends to the host, until the client ends,
    /// fails, or the connection closes.
    fn pass_client_bytes(&self, id: u32, mut socket: TcpStream) {
        let mut buffer = vec![0_u8; FRAME_LIMIT];
        loop {
            match socket.read(&mut buffer) {
                Ok(0) => {
                    self.client_ended(id);
                    return;
                }
                Ok(read) => {
                    let open = self.connections().open.contains_key(&id);
                    if !open || self.send(id, DATA, &buffer[..read]).is_err() {
                        return;
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                Err(_) => {
                    if self.close(id) {
                        let _ = self.send(id, RESET, &[]);
                    }
                    return;
                }
            }
        }
    }

    /// Writes what the host sent to the client, in order. When the client
    /// can't take it, the connection is reset.
    fn pass_host_bytes(
        &self,
        id: u32,
        mut socket: TcpStream,
        from_host: &Receiver<ToClient>,
        backlog: &AtomicUsize,
    ) {
        for message in from_host {
            match message {
                ToClient::Data(bytes) => {
                    let written = socket.write_all(&bytes);
                    backlog.fetch_sub(bytes.len(), Ordering::SeqCst);
                    if written.is_err() {
                        if self.close(id) {
                            let _ = self.send(id, RESET, &[]);
                        }
                        return;
                    }
                }
                ToClient::End => {
                    let _ = socket.shutdown(Shutdown::Write);
                    self.host_ended(id);
                }
            }
        }
    }

    /// The client sends no more: tells the host. A connection both sides
    /// ended is closed.
    fn client_ended(&self, id: u32) {
        {
            let mut connections = self.connections();
            let Some(connection) = connections.open.get_mut(&id) else {
                return;
            };
            connection.client_ended = true;
            if connection.host_ended {
                connections.open.remove(&id);
            }
        }
        let _ = self.send(id, END, &[]);
    }

    /// The client has all the host sent. A connection both sides ended is closed.
    fn host_ended(&self, id: u32) {
        let mut connections = self.connections();
        if let Some(connection) = connections.open.get_mut(&id) {
            connection.host_ended = true;
            if connection.client_ended {
                connections.open.remove(&id);
            }
        }
    }

    /// Closes a connection and its socket. True when it was open, so the
    /// caller tells the host.
    fn close(&self, id: u32) -> bool {
        let Some(connection) = self.connections().open.remove(&id) else {
            return false;
        };
        let _ = connection.socket.shutdown(Shutdown::Both);
        true
    }

    /// Reads the host's frames until its output ends or breaks the format,
    /// then stops the relay.
    fn pass_host_frames(self: &Arc<Self>, mut output: impl Read) {
        let mut header = [0_u8; HEADER_LENGTH];
        while output.read_exact(&mut header).is_ok() {
            let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
            let kind = header[4];
            let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
            let Ok(length) = usize::try_from(length) else {
                break;
            };
            if length > FRAME_LIMIT {
                break;
            }
            let mut bytes = vec![0_u8; length];
            if output.read_exact(&mut bytes).is_err() {
                break;
            }
            let passed = match kind {
                DATA => self.to_client(id, ToClient::Data(bytes)),
                END => self.to_client(id, ToClient::End),
                RESET => self.host_reset(id),
                // Only the relay opens connections; any other kind is unknown.
                _ => Err(Broken),
            };
            if passed.is_err() {
                break;
            }
        }
        self.stop();
    }

    /// Queues the host's bytes or end for a connection's client. A frame
    /// for a connection that has closed is dropped; one for an id never
    /// opened breaks the stream.
    fn to_client(self: &Arc<Self>, id: u32, message: ToClient) -> Result<(), Broken> {
        let mut connections = self.connections();
        if id == 0 || id > connections.last_id {
            return Err(Broken);
        }
        let Some(connection) = connections.open.get(&id) else {
            return Ok(());
        };
        if let ToClient::Data(bytes) = &message {
            let waiting = connection.backlog.fetch_add(bytes.len(), Ordering::SeqCst);
            if waiting + bytes.len() > self.backlog_limit {
                if let Some(connection) = connections.open.remove(&id) {
                    let _ = connection.socket.shutdown(Shutdown::Both);
                }
                drop(connections);
                self.send_reset_later(id);
                return Ok(());
            }
        }
        // The client's writer only ends after the connection closes.
        let _ = connection.to_client.send(message);
        Ok(())
    }

    fn host_reset(&self, id: u32) -> Result<(), Broken> {
        if id == 0 || id > self.connections().last_id {
            return Err(Broken);
        }
        self.close(id);
        Ok(())
    }

    /// Writes the queued frames to the host's input until the relay stops
    /// or the host can't take them, then closes it.
    fn pass_frames_to_host(&self, mut input: impl Write, frames: Receiver<ToHost>) {
        for message in frames {
            let ToHost::Frame(frame) = message else {
                break;
            };
            if input
                .write_all(&frame)
                .and_then(|()| input.flush())
                .is_err()
            {
                break;
            }
        }
        drop(input);
        self.stop();
    }

    fn stop(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        let closed: Vec<Connection> = self.connections().open.drain().map(|(_, c)| c).collect();
        for connection in closed {
            let _ = connection.socket.shutdown(Shutdown::Both);
        }
        match self.to_host.try_send(ToHost::Close) {
            Ok(()) | Err(TrySendError::Disconnected(_)) => {}
            // The writer waits on the host; it closes the input after that.
            Err(TrySendError::Full(close)) => {
                let to_host = self.to_host.clone();
                spawn("relay-close", move || {
                    let _ = to_host.send(close);
                });
            }
        }
        // Wakes the thread waiting to accept, which then sees the relay stopped.
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, self.port));
        let _ = TcpStream::connect_timeout(&address, WAKE_TIMEOUT);
    }
}

fn frame(id: u32, kind: u8, bytes: &[u8]) -> Vec<u8> {
    let length = u32::try_from(bytes.len()).expect("a frame carries at most 64 KiB");
    let mut frame = Vec::with_capacity(HEADER_LENGTH + bytes.len());
    frame.extend_from_slice(&id.to_be_bytes());
    frame.push(kind);
    frame.extend_from_slice(&length.to_be_bytes());
    frame.extend_from_slice(bytes);
    frame
}

fn spawn(name: &str, work: impl FnOnce() + Send + 'static) {
    // Without a thread the relay can't work; the host then answers nothing
    // and the shell's call times out, as with any host that stopped.
    let _ = thread::Builder::new().name(name.to_owned()).spawn(work);
}

#[cfg(test)]
mod tests;
