//! Connecting to a paired computer, and passing its connection's states on
//! (requirement `phone-tunnel-connections`). The paired-computer list
//! follows what the connection learns: connected, can't confirm, and
//! Removed, which wipes the key before the page hears of it. Only while the
//! computer is still kept under the key that connection used: a connection
//! from before a Pair again changes nothing (Julian on HAL-15463).

use std::sync::Arc;
use std::time::Duration;

use halonic_device_keys::{ComputerId, DeviceKeyError, DeviceKeyStore, KEY_BYTES, PairedComputers};
use halonic_tunnel::{
    ConnectError, Endpoint, PairedComputer as Pinned, PhoneConnection, PhoneEvent, PhoneKeys,
    PhoneStatus,
};
use tokio::sync::mpsc::UnboundedReceiver;

use crate::answers::{ConnectOutcome, Problem};
use crate::connections::{Begin, Connections};
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
            clock: self.options.clock,
        };
        let task = tokio::spawn(passing.run(events));
        // The page disconnected or forgot the computer while it opened:
        // the connection is ended, and the page already has its status.
        if !self
            .connections
            .opened(&id, serial, connection, task.abort_handle())
        {
            return ConnectOutcome::Stopped(Problem::NotPaired);
        }
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
    clock: fn() -> u64,
}

impl<S: DeviceKeyStore + 'static> Passing<S> {
    async fn run(self, mut events: UnboundedReceiver<PhoneEvent>) {
        while let Some(event) = events.recv().await {
            match event {
                PhoneEvent::Status(status) => self.on_status(status).await,
                PhoneEvent::NextTry(wait) => self.on_next_try(wait),
                // Carried to the page by HAL-15177 (D7); until then the
                // shell reads nothing in the session and keeps nothing.
                PhoneEvent::SessionOpened | PhoneEvent::Message(_) => {}
            }
        }
        self.connections.finished(&self.computer, self.serial);
    }

    /// Notes what the status says in the list, then tells the page: on
    /// Removed the key is wiped first.
    ///
    /// When the wipe fails, the page still hears Removed: the computer has
    /// proved who it is and refused the phone, so the page mustn't show it
    /// as reachable. The key stays, the failure is logged, and the next
    /// connect hears `not-paired` again and wipes it then.
    async fn on_status(&self, status: PhoneStatus) {
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
