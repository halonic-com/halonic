//! A paired computer's connection on the phone (requirement
//! `phone-states`): the transport, a reconnect handshake on every
//! connection that opens, the session, and the phone's state worked out
//! only from what the phone can see (build plan decisions 3 and 4).
//!
//! - Its own network down, a timeout, a refused connection or an
//!   unreachable computer come from the transport: "Can't reach" or
//!   "Reconnecting".
//! - `handshake-failed`, or a reconnect message 2 that doesn't decrypt, is
//!   "Can't confirm". It clears nothing, and the phone keeps trying.
//! - Only `not-paired` inside the session, after message 2 has proved the
//!   host, is Removed.

use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::{mpsc, oneshot};

use crate::backoff::Backoff;
use crate::connect::{ConnectError, Dialer};
use crate::endpoint::Endpoint;
use crate::error::SessionError;
use crate::handshake::Reconnect;
use crate::keys::{KEY_BYTES, PhoneKeys};
use crate::session::{Opened, Session};
use crate::transport::{
    ConnectionId, SendError, Timeouts, Transport, TransportEvent, TransportState,
};

/// A handshake not finished this long after the connection opened is
/// dropped; the phone keeps the limit as well as the host.
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// How often the phone checks whether its sending key is due a rekey.
const REKEY_CHECK: Duration = Duration::from_secs(60);

/// A computer the phone has paired with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairedComputer {
    pub endpoint: Endpoint,
    /// The host's static key, pinned when pairing ended in `paired`.
    pub host_key: [u8; KEY_BYTES],
}

/// The timings of a phone connection; [`PhoneOptions::DEFAULT`] in the app.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PhoneOptions {
    pub backoff: Backoff,
    pub timeouts: Timeouts,
    pub handshake_timeout: Duration,
}

impl PhoneOptions {
    pub const DEFAULT: Self = Self {
        backoff: Backoff::TUNNEL,
        timeouts: Timeouts::TUNNEL,
        handshake_timeout: HANDSHAKE_TIMEOUT,
    };
}

/// The phone's state for one paired computer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhoneStatus {
    /// Connected and authenticated; waiting for the host's `welcome`.
    Connecting,
    /// The host answered `welcome`.
    Connected,
    /// The connection dropped and the phone is trying again; `last_try`
    /// says why the last try failed, once one has.
    Reconnecting { last_try: Option<ConnectError> },
    /// The phone couldn't confirm the computer. It keeps trying, and this
    /// stays until a handshake succeeds.
    CantConfirm,
    /// The host, after proving who it is, said it doesn't know this phone.
    /// Final: the transport is closed.
    Removed,
    /// The app is in the background.
    Paused,
    /// Closed by the app.
    Closed,
}

/// What a phone connection reports, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PhoneEvent {
    Status(PhoneStatus),
    /// A new session is open: the page sends `hello` on it.
    SessionOpened,
    /// A gateway message from the host, decrypted.
    Message(Vec<u8>),
}

enum Command {
    Send(Vec<u8>, oneshot::Sender<Result<(), SendError>>),
    Pause,
    Resume,
    Close,
}

/// The handle of a running phone connection.
pub struct PhoneConnection {
    commands: mpsc::UnboundedSender<Command>,
}

impl PhoneConnection {
    /// Connects to a paired computer and runs the connection on the current
    /// tokio runtime. When the first try fails it gives the reason, for
    /// "Can't reach your computer", and nothing runs.
    pub async fn connect(
        computer: PairedComputer,
        keys: PhoneKeys,
        dialer: Dialer,
        options: PhoneOptions,
    ) -> Result<(Self, mpsc::UnboundedReceiver<PhoneEvent>), ConnectError> {
        let (transport, transport_events) =
            Transport::connect(computer.endpoint, dialer, options.backoff, options.timeouts)
                .await?;
        let (commands, command_receiver) = mpsc::unbounded_channel();
        let (events, event_receiver) = mpsc::unbounded_channel();
        let _ = events.send(PhoneEvent::Status(PhoneStatus::Connecting));
        let worker = Worker {
            transport,
            keys,
            host_key: computer.host_key,
            handshake_timeout: options.handshake_timeout,
            events,
            status: PhoneStatus::Connecting,
            connection: None,
            stage: Stage::Waiting,
        };
        tokio::spawn(worker.run(transport_events, command_receiver));
        Ok((Self { commands }, event_receiver))
    }

    /// Seals and sends one gateway message. Fails unless a session is open.
    pub async fn send(&self, message: Vec<u8>) -> Result<(), SendError> {
        let (reply, answer) = oneshot::channel();
        self.commands
            .send(Command::Send(message, reply))
            .map_err(|_| SendError::NotOpen)?;
        answer.await.unwrap_or(Err(SendError::NotOpen))
    }

    pub fn pause(&self) {
        let _ = self.commands.send(Command::Pause);
    }

    pub fn resume(&self) {
        let _ = self.commands.send(Command::Resume);
    }

    pub fn close(&self) {
        let _ = self.commands.send(Command::Close);
    }
}

/// Where the current connection is.
enum Stage {
    /// No connection, or one whose handshake has failed.
    Waiting,
    /// Reconnect message 1 is sent; message 2 is due by `deadline`.
    Handshake {
        reconnect: Box<Reconnect>,
        deadline: tokio::time::Instant,
    },
    Session(Box<Session>),
}

/// Only the `type` of a gateway message, to see `welcome` and `not-paired`.
#[derive(Deserialize)]
struct MessageType<'a> {
    #[serde(rename = "type", borrow)]
    kind: &'a str,
}

struct Worker {
    transport: Transport,
    keys: PhoneKeys,
    host_key: [u8; KEY_BYTES],
    handshake_timeout: Duration,
    events: mpsc::UnboundedSender<PhoneEvent>,
    status: PhoneStatus,
    /// The open connection, which frames go out on; none between connections.
    connection: Option<ConnectionId>,
    stage: Stage,
}

impl Worker {
    async fn run(
        mut self,
        mut transport_events: mpsc::UnboundedReceiver<TransportEvent>,
        mut commands: mpsc::UnboundedReceiver<Command>,
    ) {
        let mut rekey_check = tokio::time::interval(REKEY_CHECK);
        loop {
            let deadline = match &self.stage {
                Stage::Handshake { deadline, .. } => Some(*deadline),
                _ => None,
            };
            tokio::select! {
                event = transport_events.recv() => match event {
                    Some(event) => self.on_transport(event).await,
                    None => break,
                },
                command = commands.recv() => match command {
                    Some(command) => self.on_command(command).await,
                    None => self.transport.close(),
                },
                () = sleep_until(deadline) => self.drop_connection(),
                _ = rekey_check.tick() => self.rekey_if_due().await,
            }
            if self.status == PhoneStatus::Removed {
                self.transport.close();
                break;
            }
        }
    }

    async fn on_transport(&mut self, event: TransportEvent) {
        match event {
            TransportEvent::Opened(connection) => self.start_handshake(connection).await,
            TransportEvent::State(TransportState::Reconnecting) => {
                self.lost_connection();
                if self.status != PhoneStatus::CantConfirm {
                    self.set_status(PhoneStatus::Reconnecting { last_try: None });
                }
            }
            TransportEvent::State(TransportState::Paused) => {
                self.lost_connection();
                self.set_status(PhoneStatus::Paused);
            }
            TransportEvent::State(TransportState::Closed) => {
                self.lost_connection();
                self.set_status(PhoneStatus::Closed);
            }
            TransportEvent::State(TransportState::Connecting | TransportState::Open) => {}
            TransportEvent::TryFailed(reason) => {
                if matches!(self.status, PhoneStatus::Reconnecting { .. }) {
                    self.set_status(PhoneStatus::Reconnecting {
                        last_try: Some(reason),
                    });
                }
            }
            TransportEvent::Frame(frame) => self.on_frame(&frame),
        }
    }

    /// Each connection that opens is new: reconnect to the pinned key.
    async fn start_handshake(&mut self, connection: ConnectionId) {
        self.connection = Some(connection);
        let Ok((reconnect, frame1)) = Reconnect::start(&self.keys, &self.host_key) else {
            self.drop_connection();
            return;
        };
        if self.transport.send(connection, frame1).await.is_err() {
            self.drop_connection();
            return;
        }
        self.stage = Stage::Handshake {
            reconnect: Box::new(reconnect),
            deadline: tokio::time::Instant::now() + self.handshake_timeout,
        };
    }

    fn on_frame(&mut self, frame: &[u8]) {
        match std::mem::replace(&mut self.stage, Stage::Waiting) {
            Stage::Handshake { reconnect, .. } => match reconnect.read_reply(frame, Instant::now())
            {
                Ok(session) => {
                    self.stage = Stage::Session(Box::new(session));
                    if self.status != PhoneStatus::Connected {
                        self.set_status(PhoneStatus::Connecting);
                    }
                    let _ = self.events.send(PhoneEvent::SessionOpened);
                }
                Err(error) => self.handshake_failed(error),
            },
            Stage::Session(mut session) => match session.open(frame) {
                Ok(Opened::Message(message)) => {
                    self.stage = Stage::Session(session);
                    self.on_message(message);
                }
                Ok(Opened::Rekeyed) => self.stage = Stage::Session(session),
                Err(_) => self.drop_connection(),
            },
            // A frame after a failed handshake, before the drop: ignored.
            Stage::Waiting => {}
        }
    }

    fn handshake_failed(&mut self, error: SessionError) {
        if error == SessionError::CantConfirm {
            self.set_status(PhoneStatus::CantConfirm);
        }
        self.drop_connection();
    }

    /// A message inside an authenticated session. `welcome` means
    /// connected; `not-paired` means Removed and is the last thing read.
    fn on_message(&mut self, message: Vec<u8>) {
        let kind = serde_json::from_slice::<MessageType>(&message)
            .ok()
            .map(|m| m.kind.to_owned());
        match kind.as_deref() {
            Some("not-paired") => {
                self.stage = Stage::Waiting;
                self.set_status(PhoneStatus::Removed);
                return;
            }
            Some("welcome") => self.set_status(PhoneStatus::Connected),
            _ => {}
        }
        let _ = self.events.send(PhoneEvent::Message(message));
    }

    async fn on_command(&mut self, command: Command) {
        match command {
            Command::Send(message, reply) => {
                let _ = reply.send(self.seal_and_send(&message).await);
            }
            Command::Pause => self.transport.pause(),
            Command::Resume => self.transport.resume(),
            Command::Close => self.transport.close(),
        }
    }

    async fn seal_and_send(&mut self, message: &[u8]) -> Result<(), SendError> {
        let (Stage::Session(session), Some(connection)) = (&mut self.stage, self.connection) else {
            return Err(SendError::NotOpen);
        };
        let frames = session
            .seal(message, Instant::now())
            .map_err(|_| SendError::NotOpen)?;
        for frame in frames {
            self.transport.send(connection, frame).await?;
        }
        Ok(())
    }

    async fn rekey_if_due(&mut self) {
        let (Stage::Session(session), Some(connection)) = (&mut self.stage, self.connection) else {
            return;
        };
        match session.rekey_if_due(Instant::now()) {
            Ok(Some(frame)) => {
                if self.transport.send(connection, frame).await.is_err() {
                    self.drop_connection();
                }
            }
            Ok(None) => {}
            Err(_) => self.drop_connection(),
        }
    }

    /// Drops the open connection; the transport reconnects after its
    /// backoff delay.
    fn drop_connection(&mut self) {
        if let Some(connection) = self.lost_connection() {
            self.transport.drop_connection(connection);
        }
    }

    /// Forgets the open connection and its handshake or session, and gives
    /// the connection it was.
    fn lost_connection(&mut self) -> Option<ConnectionId> {
        self.stage = Stage::Waiting;
        self.connection.take()
    }

    fn set_status(&mut self, status: PhoneStatus) {
        if self.status != status {
            self.status = status;
            let _ = self.events.send(PhoneEvent::Status(status));
        }
    }
}

/// Sleeps until `deadline`, or forever when there is none.
async fn sleep_until(deadline: Option<tokio::time::Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}
