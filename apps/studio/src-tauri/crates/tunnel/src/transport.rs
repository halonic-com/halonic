//! The phone's byte pipe to one host's gateway, reconnecting by itself
//! (requirement `tunnel-transport`; the `TunnelTransport` port in
//! `@halonicjs/ports`). It carries the session's frames and never reads
//! them: each connection that opens is a new connection, on which the
//! session layer starts a new handshake.
//!
//! One task owns the socket. The [`Transport`] handle talks to it over a
//! channel, and it reports states and frames as [`TransportEvent`]s. Every
//! wait on an open connection has a time limit, so a peer that stops
//! reading can't keep the task from a pause or a close.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, oneshot, watch};
use tokio::time::{Instant, timeout};
use tokio_tungstenite::tungstenite::Message;

use crate::backoff::{Backoff, jitter_random};
use crate::connect::{ConnectError, Dialer, Socket};
use crate::endpoint::Endpoint;

/// A transport's state. `Paused` means the app went to the background: the
/// connection is closed and nothing tries again until `resume`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportState {
    Connecting,
    /// Reported as [`TransportEvent::Opened`], with the new connection's id.
    Open,
    Reconnecting,
    Paused,
    Closed,
}

/// Names one open connection. Frames and drops carry it, so one meant for a
/// connection that has since dropped never reaches the next one, which
/// starts a new handshake.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ConnectionId(u64);

/// How long the transport waits on an open connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timeouts {
    /// For one frame to go out. Past it the connection counts as dropped: the
    /// peer stopped reading, or the phone changed networks and left a
    /// half-open TCP connection that the OS would only give up on minutes
    /// later.
    pub send: Duration,
    /// For the closing handshake. Past it the socket is dropped without one.
    pub close: Duration,
}

impl Timeouts {
    /// The limits every transport uses: 10 s for a frame, as for a try to
    /// connect, and 1 s for the close.
    pub const TUNNEL: Self = Self {
        send: Duration::from_secs(10),
        close: Duration::from_secs(1),
    };
}

/// What the transport reports, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportEvent {
    /// A new connection opened, and the state is `Open`. Frames for it are
    /// sent with this id.
    Opened(ConnectionId),
    /// The state changed to anything but `Open`.
    State(TransportState),
    /// A binary frame arrived.
    Frame(Vec<u8>),
    /// A try to reconnect failed, and why, for the phone's status.
    TryFailed(ConnectError),
}

/// Why a frame wasn't sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendError {
    /// The state isn't `Open`, the frame was for an earlier connection, or
    /// the connection dropped while sending it. Frames are never queued for
    /// a later connection.
    NotOpen,
}

/// Where the worker answers whether a frame went out.
type SendReply = oneshot::Sender<Result<(), SendError>>;

enum Command {
    Send(ConnectionId, Vec<u8>, SendReply),
    Drop(ConnectionId),
    Pause,
    Resume,
    Close,
}

/// The handle of a running transport. Dropping it closes the transport.
pub struct Transport {
    commands: mpsc::UnboundedSender<Command>,
    state: watch::Receiver<TransportState>,
}

impl Transport {
    /// Opens the first connection and, once it is open, runs the transport
    /// on the current tokio runtime. When the first try fails it gives the
    /// reason and nothing runs: only a connection that was open once
    /// reconnects by itself.
    pub async fn connect(
        endpoint: Endpoint,
        dialer: Dialer,
        backoff: Backoff,
        timeouts: Timeouts,
    ) -> Result<(Self, mpsc::UnboundedReceiver<TransportEvent>), ConnectError> {
        let socket = dialer.open(&endpoint).await?;
        let (commands, command_receiver) = mpsc::unbounded_channel();
        let (events, event_receiver) = mpsc::unbounded_channel();
        let (state_sender, state) = watch::channel(TransportState::Open);
        let worker = Worker {
            endpoint,
            dialer,
            backoff,
            timeouts,
            commands: command_receiver,
            events,
            state: state_sender,
            failed_tries: 0,
            connections: 0,
        };
        tokio::spawn(worker.run(socket));
        Ok((Self { commands, state }, event_receiver))
    }

    pub fn state(&self) -> TransportState {
        *self.state.borrow()
    }

    /// Sends one frame on `connection`. Fails unless that connection is the
    /// open one, and drops it when the frame doesn't go out within
    /// [`Timeouts::send`].
    pub async fn send(&self, connection: ConnectionId, frame: Vec<u8>) -> Result<(), SendError> {
        let (reply, answer) = oneshot::channel();
        self.commands
            .send(Command::Send(connection, frame, reply))
            .map_err(|_| SendError::NotOpen)?;
        answer.await.unwrap_or(Err(SendError::NotOpen))
    }

    /// Closes `connection` and reconnects after the backoff delay, as after
    /// a drop; does nothing once that connection is gone. For the session
    /// layer, when a handshake fails or takes too long: unlike a pause, it
    /// doesn't start the backoff again, so a peer that always fails the
    /// handshake can't make the phone retry in a tight loop.
    pub fn drop_connection(&self, connection: ConnectionId) {
        let _ = self.commands.send(Command::Drop(connection));
    }

    /// Closes the connection and stops every timer until [`Self::resume`].
    pub fn pause(&self) {
        let _ = self.commands.send(Command::Pause);
    }

    /// Connects again at once after [`Self::pause`], starting the backoff
    /// from the first try; does nothing in any other state.
    pub fn resume(&self) {
        let _ = self.commands.send(Command::Resume);
    }

    /// Closes the transport for good. The event stream ends after `Closed`.
    pub fn close(&self) {
        let _ = self.commands.send(Command::Close);
    }
}

/// What the worker does next.
enum Next {
    Serve(Box<Socket>),
    Connect {
        delay: Duration,
        state: TransportState,
    },
    Pause,
    Close,
}

struct Worker {
    endpoint: Endpoint,
    dialer: Dialer,
    backoff: Backoff,
    timeouts: Timeouts,
    commands: mpsc::UnboundedReceiver<Command>,
    events: mpsc::UnboundedSender<TransportEvent>,
    state: watch::Sender<TransportState>,
    /// Tries since the last connection that stayed open long enough.
    failed_tries: u32,
    /// Connections opened so far; the next one's id.
    connections: u64,
}

impl Worker {
    async fn run(mut self, socket: Socket) {
        let mut next = Next::Serve(Box::new(socket));
        loop {
            next = match next {
                Next::Serve(socket) => self.serve(socket).await,
                Next::Connect { delay, state } => self.reconnect(delay, state).await,
                Next::Pause => self.paused().await,
                Next::Close => break,
            };
        }
        self.set_state(TransportState::Closed);
    }

    /// Runs one open connection until it drops, or the app pauses or
    /// closes the transport.
    async fn serve(&mut self, mut socket: Box<Socket>) -> Next {
        let connection = self.opened();
        let opened_at = Instant::now();
        loop {
            tokio::select! {
                message = socket.next() => match message {
                    Some(Ok(Message::Binary(frame))) => {
                        let _ = self.events.send(TransportEvent::Frame(frame.to_vec()));
                    }
                    // tungstenite answers pings itself.
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    // A text frame is a protocol error; a close, an error
                    // or the end of the stream is a drop.
                    _ => break,
                },
                command = self.commands.recv() => match command {
                    Some(Command::Send(to, frame, reply)) => {
                        if to != connection {
                            let _ = reply.send(Err(SendError::NotOpen));
                            continue;
                        }
                        let sent = self.send_frame(&mut socket, frame).await;
                        let failed = sent.is_err();
                        let _ = reply.send(sent);
                        if failed {
                            break;
                        }
                    }
                    Some(Command::Drop(to)) if to == connection => {
                        self.close_socket(&mut socket).await;
                        break;
                    }
                    Some(Command::Resume | Command::Drop(_)) => {}
                    Some(Command::Pause) => {
                        self.close_socket(&mut socket).await;
                        return Next::Pause;
                    }
                    Some(Command::Close) | None => {
                        self.close_socket(&mut socket).await;
                        return Next::Close;
                    }
                },
            }
        }
        if opened_at.elapsed() >= self.backoff.reset_after {
            self.failed_tries = 0;
        }
        self.next_try()
    }

    /// Sends one frame within [`Timeouts::send`]. An error or the time
    /// running out both mean the connection is gone. `SinkExt::send` flushes
    /// as well, so the frame has left when it returns.
    async fn send_frame(&self, socket: &mut Socket, frame: Vec<u8>) -> Result<(), SendError> {
        let sending = SinkExt::send(socket, Message::Binary(frame.into()));
        match timeout(self.timeouts.send, sending).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(_)) | Err(_) => Err(SendError::NotOpen),
        }
    }

    /// Closes the connection with the closing handshake, waiting at most
    /// [`Timeouts::close`]; the caller then drops the socket either way,
    /// which closes the TCP connection. Called as `SinkExt::close`, since
    /// the socket's own `close` takes a close frame.
    async fn close_socket(&self, socket: &mut Socket) {
        let _ = timeout(self.timeouts.close, SinkExt::close(socket)).await;
    }

    /// The next reconnect after a drop or a failed try, with its delay.
    fn next_try(&mut self) -> Next {
        self.failed_tries = self.failed_tries.saturating_add(1);
        let delay = self
            .backoff
            .delay(self.failed_tries, jitter_random())
            .unwrap_or(self.backoff.max_delay);
        Next::Connect {
            delay,
            state: TransportState::Reconnecting,
        }
    }

    /// Waits `delay` and tries once, while still taking commands: a frame
    /// to send is refused, and a pause or close stops the try.
    async fn reconnect(&mut self, delay: Duration, state: TransportState) -> Next {
        self.set_state(state);
        let sleep = tokio::time::sleep(delay);
        tokio::pin!(sleep);
        loop {
            tokio::select! {
                () = &mut sleep => break,
                command = self.commands.recv() => {
                    if let Some(next) = self.while_closed(command) {
                        return next;
                    }
                }
            }
        }
        let dialer = self.dialer.clone();
        let endpoint = self.endpoint.clone();
        let attempt = dialer.open(&endpoint);
        tokio::pin!(attempt);
        loop {
            tokio::select! {
                opened = &mut attempt => return match opened {
                    Ok(socket) => Next::Serve(Box::new(socket)),
                    Err(error) => {
                        let _ = self.events.send(TransportEvent::TryFailed(error));
                        self.next_try()
                    }
                },
                command = self.commands.recv() => {
                    if let Some(next) = self.while_closed(command) {
                        return next;
                    }
                }
            }
        }
    }

    /// Waits in the background for `resume` or `close`.
    async fn paused(&mut self) -> Next {
        self.set_state(TransportState::Paused);
        loop {
            match self.commands.recv().await {
                Some(Command::Resume) => {
                    self.failed_tries = 0;
                    return Next::Connect {
                        delay: Duration::ZERO,
                        state: TransportState::Connecting,
                    };
                }
                command => {
                    if let Some(next) = self.while_closed(command) {
                        return next;
                    }
                }
            }
        }
    }

    /// Handles a command while no connection is open: a frame is refused,
    /// and a pause or close ends what the worker was doing.
    fn while_closed(&mut self, command: Option<Command>) -> Option<Next> {
        match command {
            Some(Command::Send(_, _, reply)) => {
                let _ = reply.send(Err(SendError::NotOpen));
                None
            }
            Some(Command::Resume | Command::Drop(_)) => None,
            Some(Command::Pause) => Some(Next::Pause),
            Some(Command::Close) | None => Some(Next::Close),
        }
    }

    /// Records the state `Open` for a new connection and reports it with
    /// the connection's id. Every open is reported, even right after the
    /// first one, which starts as `Open`.
    fn opened(&mut self) -> ConnectionId {
        let connection = ConnectionId(self.connections);
        self.connections += 1;
        self.state.send_replace(TransportState::Open);
        let _ = self.events.send(TransportEvent::Opened(connection));
        connection
    }

    /// Records and reports a new state; the same state again is no event.
    fn set_state(&mut self, state: TransportState) {
        if *self.state.borrow() != state {
            self.state.send_replace(state);
            let _ = self.events.send(TransportEvent::State(state));
        }
    }
}
