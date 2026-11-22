//! Connecting to a paired computer, and passing its connection's states,
//! sessions and host messages on (requirements `phone-tunnel-connections`
//! and `phone-tunnel-messages`). The paired-computer list
//! follows what the connection learns: connected, can't confirm, and
//! Removed, which wipes the key before the page hears of it. Only while the
//! computer is still kept under the key that connection used: a connection
//! from before a Pair again changes nothing (Julian on HAL-15463).

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use halonic_device_keys::{ComputerId, DeviceKeyError, DeviceKeyStore, KEY_BYTES, PairedComputers};
use halonic_tunnel::{
    ConnectError, Endpoint, PairedComputer as Pinned, PhoneConnection, PhoneEvent, PhoneKeys,
    PhoneStatus, SessionNumber,
};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::sync::oneshot;

use crate::answers::{ConnectOutcome, Problem};
use crate::connections::{Begin, Connections, OpenSession};
use crate::host::TunnelHost;
use crate::service::PhoneTunnel;
use crate::status::PageStatus;
use crate::store::Store;

impl<S: DeviceKeyStore + 'static> PhoneTunnel<S> {
    /// Connects to a listed computer, trying its endpoints in order until
    /// one opens. The status follows through the [`TunnelHost`]. A computer
    /// already connected or connecting answers `connecting`, and one
    /// waiting to reconnect tries at once ("Try now").
    pub async fn connect(&self, computer: &str) -> ConnectOutcome {
        let Ok(id) = ComputerId::parse(computer) else {
            return ConnectOutcome::Stopped(Problem::NotPaired);
        };
        let serial = self.next_serial();
        if let Begin::Running = self.connections.begin(&id, serial) {
            return ConnectOutcome::Connecting;
        }
        let Opened {
            connection,
            events,
            key,
        } = match self.open(&id).await {
            Ok(opened) => opened,
            Err(problem) => {
                self.connections.finished(&id, serial);
                return ConnectOutcome::Stopped(problem);
            }
        };
        let passing = Passing {
            computer: id.clone(),
            serial,
            key,
            store: self.store.clone(),
            host: Arc::clone(&self.host),
            connections: Arc::clone(&self.connections),
            generations: Arc::clone(&self.generations),
            clock: self.options.clock,
            session: None,
        };
        let (kept, keeping) = oneshot::channel();
        let task = tokio::spawn(passing.run(events, keeping));
        // The page disconnected or forgot the computer while it opened:
        // the connection is ended, and the page already has its status.
        if !self
            .connections
            .opened(&id, serial, connection, task.abort_handle())
        {
            return ConnectOutcome::Stopped(Problem::NotPaired);
        }
        let _ = kept.send(());
        ConnectOutcome::Connecting
    }

    /// Ends the connection to a computer, which stays listed, and tells
    /// the page it is closed.
    pub fn disconnect(&self, computer: &str) {
        let Ok(id) = ComputerId::parse(computer) else {
            return;
        };
        if self.connections.end(&id) {
            self.connections.set_status(&id, PageStatus::Closed);
            self.host.status_changed(&id, &PageStatus::Closed);
        }
    }

    /// Loads the computer's pinned key and the phone's key for it, and
    /// opens a connection at the first endpoint that takes one.
    async fn open(&self, id: &ComputerId) -> Result<Opened, Problem> {
        let loaded = {
            let id = id.clone();
            self.store
                .run(move |computers| {
                    let Some(details) = computers.details(&id)? else {
                        return Ok(None);
                    };
                    // Removed: the key and the pin are gone.
                    let Some(host_key) = details.standing.host_key().copied() else {
                        return Ok(None);
                    };
                    let pair = computers
                        .keys()
                        .load(&id)?
                        .ok_or(DeviceKeyError::Unreadable)?;
                    Ok(Some((details.endpoints, host_key, pair)))
                })
                .await
        };
        let (endpoints, host_key, pair) =
            loaded.map_err(Problem::from)?.ok_or(Problem::NotPaired)?;
        let endpoints: Vec<Endpoint> = endpoints
            .iter()
            .filter_map(|endpoint| Endpoint::parse(endpoint))
            .collect();
        self.allow_local_network(&endpoints).await?;
        let mut reason = ConnectError::Unreachable;
        for endpoint in endpoints {
            let keys = PhoneKeys::from_private(pair.private.bytes())
                .map_err(|_| Problem::KeyUnreadable)?;
            let pinned = Pinned { endpoint, host_key };
            let connecting =
                PhoneConnection::connect(pinned, keys, self.dialer.clone(), self.options.phone);
            match connecting.await {
                Ok((connection, events)) => {
                    return Ok(Opened {
                        connection,
                        events,
                        key: pair.public,
                    });
                }
                Err(error) => reason = error,
            }
        }
        Err(Problem::CantReach {
            reason: reason.into(),
        })
    }
}

/// A connection that opened, with the phone's public key it used.
struct Opened {
    connection: PhoneConnection,
    events: UnboundedReceiver<PhoneEvent>,
    key: [u8; KEY_BYTES],
}

/// Passes one connection's events on, while it is the computer's current
/// one.
struct Passing<S: DeviceKeyStore + 'static> {
    computer: ComputerId,
    serial: u64,
    /// The phone's public key this connection used.
    key: [u8; KEY_BYTES],
    store: Store<S>,
    host: Arc<dyn TunnelHost>,
    connections: Arc<Connections>,
    /// The service's count of sessions on every computer.
    generations: Arc<AtomicU64>,
    clock: fn() -> u64,
    /// The session open on this connection, as last reported.
    session: Option<OpenSession>,
}

impl<S: DeviceKeyStore + 'static> Passing<S> {
    /// Passes the events on once the connection is kept: until then a
    /// session couldn't be noted on it, and the page couldn't send into it.
    async fn run(mut self, mut events: UnboundedReceiver<PhoneEvent>, kept: oneshot::Receiver<()>) {
        if kept.await.is_err() {
            return;
        }
        while let Some(event) = events.recv().await {
            match event {
                PhoneEvent::Status(status) => self.on_status(status).await,
                PhoneEvent::NextTry(wait) => self.on_next_try(wait),
                PhoneEvent::SessionOpened(number) => self.on_session_opened(number),
                PhoneEvent::Message(message) => self.on_message(message),
            }
        }
        self.connections.finished(&self.computer, self.serial);
    }

    /// A new session: numbered with the next generation in the process,
    /// so a message the page built for any earlier session, on this
    /// computer or another, is refused.
    fn on_session_opened(&mut self, number: SessionNumber) {
        let generation = self.generations.fetch_add(1, Ordering::Relaxed) + 1;
        let opened = OpenSession { number, generation };
        if !self
            .connections
            .session_opened(&self.computer, self.serial, opened)
        {
            return;
        }
        self.session = Some(opened);
        self.host.session_opened(&self.computer, generation);
    }

    /// A host message of the open session, passed on as text. One that
    /// isn't UTF-8 can't be, so its session ends as if the page had
    /// refused it.
    ///
    /// Messages still waiting here when the page ended the session are
    /// dropped: the page refused one of them and mustn't hear more under
    /// that generation (Liam on HAL-16120).
    fn on_message(&mut self, message: Vec<u8>) {
        let Some(open) = self.session else {
            return;
        };
        if !self.connections.is_open(&self.computer, open.generation) {
            return;
        }
        match String::from_utf8(message) {
            Ok(text) => self.host.message(&self.computer, open.generation, &text),
            Err(_) => {
                self.host
                    .log("a host message isn't UTF-8 text; ending its session");
                self.end_session();
            }
        }
    }

    /// Ends the open session; the connection reconnects after its backoff.
    fn end_session(&mut self) {
        let Some(open) = self.session.take() else {
            return;
        };
        if let Some((connection, number)) = self
            .connections
            .take_session(&self.computer, open.generation)
        {
            connection.end_session(number);
        }
    }

    /// Notes what the status says in the list, then tells the page: on
    /// Removed the key is wiped first.
    ///
    /// When the wipe fails, the page still hears Removed: the computer has
    /// proved who it is and refused the phone, so the page mustn't show it
    /// as reachable. The key stays, the failure is logged, and the next
    /// connect hears `not-paired` again and wipes it then.
    async fn on_status(&mut self, status: PhoneStatus) {
        if !matches!(status, PhoneStatus::Connecting | PhoneStatus::Connected) {
            // The session's connection is gone: nothing more goes into it.
            self.session = None;
            self.connections.session_ended(&self.computer, self.serial);
        }
        let computer = self.computer.clone();
        let key = self.key;
        let at_ms = (self.clock)();
        let noted = self
            .store
            .run(move |computers| note(computers, &computer, &key, status, at_ms))
            .await;
        if let Err(error) = noted {
            self.host
                .log(&format!("noting a computer's status in the list: {error}"));
        }
        self.tell(PageStatus::from_phone(status));
    }

    fn on_next_try(&self, wait: Duration) {
        let wait_ms = u64::try_from(wait.as_millis()).unwrap_or(u64::MAX);
        let at_ms = (self.clock)().saturating_add(wait_ms);
        let Some(current) = self.connections.status(&self.computer) else {
            return;
        };
        if let Some(status) = current.with_next_try(at_ms) {
            self.tell(status);
        }
    }

    fn tell(&self, status: PageStatus) {
        if !self.connections.is_current(&self.computer, self.serial) {
            return;
        }
        self.connections.set_status(&self.computer, status);
        self.host.status_changed(&self.computer, &status);
    }
}

/// Notes in the list what a connection under the phone's public key `key`
/// learned: connected, can't confirm, or Removed, which wipes the key and
/// the pin. Nothing changes when the computer is no longer kept under
/// `key`: the person paired again since that connection opened, and what
/// it learns isn't about the new pairing. The check runs under the store's
/// lock with the note, so a note queued before Pair again saved its key is
/// checked against that new key too.
pub(crate) fn note<S: DeviceKeyStore>(
    computers: &PairedComputers<S>,
    computer: &ComputerId,
    key: &[u8; KEY_BYTES],
    status: PhoneStatus,
    at_ms: u64,
) -> Result<(), DeviceKeyError> {
    if !matches!(
        status,
        PhoneStatus::Connected | PhoneStatus::CantConfirm | PhoneStatus::Removed
    ) {
        return Ok(());
    }
    let kept = computers.keys().load(computer)?;
    if !kept.is_some_and(|pair| pair.public == *key) {
        return Ok(());
    }
    match status {
        PhoneStatus::Connected => computers.mark_connected(computer, at_ms),
        PhoneStatus::CantConfirm => computers.mark_cant_confirm(computer),
        PhoneStatus::Removed => computers.mark_removed(computer),
        _ => Ok(()),
    }
}
