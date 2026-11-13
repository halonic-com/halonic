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
//! up the others. What it holds at most is in [`limits`], what it waits for
//! at most in [`deadlines`]. Only std, so it builds and tests anywhere.

use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use connections::{Connection, Connections};
use deadlines::Deadline;
use limits::{Limits, QUEUED_FRAMES, QUEUED_FRAMES_PER_CONNECTION, Quota};
use token::TokenCheck;

mod connections;
mod deadlines;
mod from_host;
mod limits;
mod token;

/// The most bytes one frame carries.
pub(crate) const FRAME_LIMIT: usize = 64 * 1024;

/// Connection id (4), kind (1) and length (4).
const HEADER_LENGTH: usize = 9;

const OPEN: u8 = 1;
const DATA: u8 = 2;
const END: u8 = 3;
const RESET: u8 = 4;

/// How long stopping waits to wake the thread that accepts connections.
const WAKE_TIMEOUT: Duration = Duration::from_secs(1);

/// What goes to the host's input.
enum ToHost {
    /// A frame, and what it took of the queue to the host.
    Frame(Vec<u8>, Taken),
    /// Close the host's input, so it stops.
    Close,
}

/// What a frame took of the queue to the host, given back once it's written.
enum Taken {
    /// Nothing: an end or a reset, at most two for each connection opened.
    Nothing,
    /// A place in the queue: an `open`.
    Place,
    /// A place, and one of its connection's share: a client's bytes.
    PlaceAndShare(Arc<Quota>),
}

/// What the host sent a connection's client.
enum ToClient {
    Data(Vec<u8>),
    End,
}

/// A relay on `127.0.0.1` for one host. Dropping it stops it.
pub(crate) struct Relay {
    shared: Arc<Shared>,
    /// The listener, the host's frames and the connections' deadlines until
    /// [`Relay::serve`] starts.
    waiting: Option<(TcpListener, Receiver<ToHost>, Receiver<Deadline>)>,
}

impl Relay {
    /// Listens on a free port of `127.0.0.1`. Nothing is accepted until
    /// [`Relay::serve`]: the host needs the port before it starts.
    pub(crate) fn bind() -> io::Result<Self> {
        Self::bind_with_limits(Limits::default())
    }

    fn bind_with_limits(limits: Limits) -> io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let port = listener.local_addr()?.port();
        let (to_host, frames) = mpsc::channel();
        let (deadlines, deadlines_to_keep) = mpsc::channel();
        let shared = Arc::new(Shared {
            port,
            limits,
            stopped: AtomicBool::new(false),
            accepting: AtomicBool::new(false),
            to_host,
            queue: Quota::new(QUEUED_FRAMES),
            writing_since: Mutex::default(),
            deadlines,
            connections: Mutex::default(),
            #[cfg(test)]
            opens_queued: AtomicUsize::new(0),
        });
        Ok(Self {
            shared,
            waiting: Some((listener, frames, deadlines_to_keep)),
        })
    }

    /// The port the relay listens on.
    pub(crate) fn port(&self) -> u16 {
        self.shared.port
    }

    /// Starts passing connections to the host: frames go to `input`, the
    /// host's standard input, and come from `output`, its standard output
    /// after the handshake line. `token` is the one from that line, which
    /// each connection's first request must carry. Calling it again does
    /// nothing.
    pub(crate) fn serve(
        &mut self,
        input: impl Write + Send + 'static,
        output: impl Read + Send + 'static,
        token: &str,
    ) {
        let Some((listener, frames, deadlines)) = self.waiting.take() else {
            return;
        };
        let shared = Arc::clone(&self.shared);
        spawn("relay-to-host", move || {
            shared.pass_frames_to_host(input, frames)
        });
        let shared = Arc::clone(&self.shared);
        spawn("relay-deadlines", move || shared.keep_deadlines(&deadlines));
        let shared = Arc::clone(&self.shared);
        spawn("relay-from-host", move || shared.pass_host_frames(output));
        self.shared.accepting.store(true, Ordering::SeqCst);
        let shared = Arc::clone(&self.shared);
        let token = token.to_owned();
        spawn("relay-accept", move || shared.accept(&listener, &token));
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
    limits: Limits,
    stopped: AtomicBool,
    /// True while a thread waits to accept connections, so stopping must
    /// wake it. Once it's gone, the port may be another process's.
    accepting: AtomicBool,
    /// Never waits: opens and what clients send wait for room in `queue`
    /// first, so only ends and resets go past it.
    to_host: Sender<ToHost>,
    /// The frames from clients waiting for the host's input.
    queue: Quota,
    /// When the frame being written to the host's input started; `None`
    /// between frames.
    writing_since: Mutex<Option<Instant>>,
    deadlines: Sender<Deadline>,
    connections: Mutex<Connections>,
    /// How many `open` frames reached the queue to the host, so a test can
    /// wait for the one it needs ahead of the frames it counts.
    #[cfg(test)]
    opens_queued: AtomicUsize,
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
        self.send_taking(id, kind, bytes, Taken::Nothing)
    }

    fn send_taking(&self, id: u32, kind: u8, bytes: &[u8], taken: Taken) -> Result<(), Broken> {
        self.to_host
            .send(ToHost::Frame(frame(id, kind, bytes), taken))
            .map_err(|_| Broken)
    }

    fn accept(self: &Arc<Self>, listener: &TcpListener, token: &str) {
        for socket in listener.incoming() {
            if self.stopped.load(Ordering::SeqCst) {
                break;
            }
            // A client that went before it was accepted fails here; others go on.
            let Ok(socket) = socket else { continue };
            if self.open(socket, token).is_err() {
                self.accepting.store(false, Ordering::SeqCst);
                self.stop();
                return;
            }
        }
        self.accepting.store(false, Ordering::SeqCst);
    }

    /// Opens a connection for `socket`, tells the host, and starts passing
    /// its bytes both ways. It closes if its first request lacks `token`.
    fn open(self: &Arc<Self>, socket: TcpStream, token: &str) -> Result<(), Broken> {
        let _ = socket.set_nodelay(true);
        let (Ok(reader), Ok(writer)) = (socket.try_clone(), socket.try_clone()) else {
            // Without handles the connection can't be served; others can.
            let _ = socket.shutdown(Shutdown::Both);
            return Ok(());
        };
        let (to_client, from_host) = mpsc::channel();
        let backlog = Arc::new(AtomicUsize::new(0));
        let quota = Arc::new(Quota::new(QUEUED_FRAMES_PER_CONNECTION));
        // Waits while the host reads nothing, so opens don't pile up.
        if !self.queue.take() {
            let _ = socket.shutdown(Shutdown::Both);
            return Ok(());
        }
        let id = {
            let mut connections = self.connections();
            // Stopping drains the connections under this lock: one opened
            // after that would stay open.
            let full = connections.open.len() >= self.limits.connections;
            if full || self.stopped.load(Ordering::SeqCst) {
                self.queue.give_back();
                let _ = socket.shutdown(Shutdown::Both);
                return Ok(());
            }
            // Ids are never reused; after 4 billion connections the relay stops.
            let id = connections.last_id.checked_add(1).ok_or(Broken)?;
            connections.last_id = id;
            let connection = Connection {
                socket,
                to_client,
                backlog: Arc::clone(&backlog),
                quota: Arc::clone(&quota),
                client_ended: false,
                host_ended: false,
                has_token: false,
            };
            connections.open.insert(id, connection);
            id
        };
        // Sent before the client's bytes can be, so `open` comes first.
        self.send_taking(id, OPEN, &[], Taken::Place)?;
        #[cfg(test)]
        self.opens_queued.fetch_add(1, Ordering::SeqCst);
        let _ = self
            .deadlines
            .send(Some((id, Instant::now() + self.limits.token)));
        let check = TokenCheck::new(token);
        let shared = Arc::clone(self);
        spawn("relay-client-in", move || {
            shared.pass_client_bytes(id, reader, &quota, check);
        });
        let shared = Arc::clone(self);
        spawn("relay-client-out", move || {
            shared.pass_host_bytes(id, writer, &from_host, &backlog);
        });
        Ok(())
    }

    /// Passes what the client sends to the host, until the client ends,
    /// fails, or the connection closes. It waits while the client has its
    /// share of the queue to the host, so the others still get through.
    fn pass_client_bytes(
        &self,
        id: u32,
        mut socket: TcpStream,
        quota: &Arc<Quota>,
        mut check: TokenCheck,
    ) {
        let mut buffer = vec![0_u8; FRAME_LIMIT];
        loop {
            match socket.read(&mut buffer) {
                Ok(0) => {
                    self.client_ended(id);
                    return;
                }
                Ok(read) => {
                    if let Some(connection) = self.connections().open.get_mut(&id) {
                        connection.has_token |= check.found(&buffer[..read]);
                    } else {
                        return;
                    }
                    if !quota.take() || !self.queue.take() {
                        return;
                    }
                    let data = frame(id, DATA, &buffer[..read]);
                    let queued = ToHost::Frame(data, Taken::PlaceAndShare(Arc::clone(quota)));
                    if self.to_host.send(queued).is_err() {
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
        connection.shut();
        true
    }

    /// Writes the queued frames to the host's input until the relay stops
    /// or the host can't take them, then closes it. A write the host never
    /// takes holds this thread until the host exits; the relay stops long
    /// before that, so nothing else waits on it.
    fn pass_frames_to_host(&self, mut input: impl Write, frames: Receiver<ToHost>) {
        for message in frames {
            let ToHost::Frame(frame, taken) = message else {
                break;
            };
            self.set_writing_since(Some(Instant::now()));
            let written = input.write_all(&frame).and_then(|()| input.flush());
            self.set_writing_since(None);
            match taken {
                Taken::Nothing => {}
                Taken::Place => self.queue.give_back(),
                Taken::PlaceAndShare(quota) => {
                    quota.give_back();
                    self.queue.give_back();
                }
            }
            if written.is_err() {
                break;
            }
        }
        drop(input);
        self.stop();
    }

    fn set_writing_since(&self, since: Option<Instant>) {
        *self
            .writing_since
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = since;
    }

    fn stop(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        let closed: Vec<Connection> = self.connections().open.drain().map(|(_, c)| c).collect();
        for connection in closed {
            connection.shut();
        }
        self.queue.close();
        let _ = self.deadlines.send(None);
        // The writer closes the input once it wrote what came before.
        let _ = self.to_host.send(ToHost::Close);
        // Wakes the thread waiting to accept, which then sees the relay stopped.
        if !self.accepting.load(Ordering::SeqCst) {
            return;
        }
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
