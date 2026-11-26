//! The phone tunnel service: what the shell's commands call.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use halonic_device_keys::{ComputerId, DeviceKeyStore, PairedComputers};
use halonic_tunnel::{Dialer, Endpoint, PairingOptions, PhoneOptions};

use crate::answer_confirm::AnswerWindow;
use crate::answers::{ComputerView, ComputersAnswer, ForgetOutcome, Problem};
use crate::connections::Connections;
use crate::host::{LocalNetwork, TunnelHost, needs_local_network};
use crate::pairing::RunningPairing;
use crate::status::PageStatus;
use crate::store::Store;

/// The timings and the clock; [`Options::DEFAULT`] in the app.
#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub pairing: PairingOptions,
    pub phone: PhoneOptions,
    /// Milliseconds since the Unix epoch.
    pub clock: fn() -> u64,
}

impl Options {
    pub const DEFAULT: Self = Self {
        pairing: PairingOptions::DEFAULT,
        phone: PhoneOptions::DEFAULT,
        clock: now_ms,
    };
}

/// The phone's side of the tunnel: one pairing at a time, the paired
/// computers, and a connection to each one the page connects to. Keys stay
/// inside: the page gets only the answers in [`crate::answers`] and the
/// statuses the [`TunnelHost`] passes on.
pub struct PhoneTunnel<S: DeviceKeyStore + 'static> {
    pub(crate) store: Store<S>,
    pub(crate) dialer: Dialer,
    pub(crate) host: Arc<dyn TunnelHost>,
    pub(crate) options: Options,
    pub(crate) pairing: Mutex<Option<RunningPairing>>,
    pub(crate) connections: Arc<Connections>,
    /// Sessions opened so far, on every computer: the last one's
    /// generation. Shared with the connections, which number each new
    /// session from it.
    pub(crate) generations: Arc<AtomicU64>,
    /// The last owner check passed for an inbox answer, in memory only.
    pub(crate) answer_window: AnswerWindow,
    serials: AtomicU64,
}

impl<S: DeviceKeyStore + 'static> PhoneTunnel<S> {
    /// A service over the paired-computer list, which dials through
    /// `dialer`.
    pub fn new(
        computers: PairedComputers<S>,
        dialer: Dialer,
        host: Arc<dyn TunnelHost>,
        options: Options,
    ) -> Self {
        Self {
            store: Store::new(computers),
            dialer,
            host,
            options,
            pairing: Mutex::new(None),
            connections: Arc::new(Connections::default()),
            generations: Arc::new(AtomicU64::new(0)),
            answer_window: AnswerWindow::default(),
            serials: AtomicU64::new(0),
        }
    }

    /// The listed computers, Removed and unreadable ones included.
    pub async fn computers(&self) -> ComputersAnswer {
        let listed = self.store.run(|computers| computers.list()).await;
        match listed {
            Ok(listed) => {
                ComputersAnswer::Computers(listed.iter().map(ComputerView::from).collect())
            }
            Err(error) => {
                self.host
                    .log(&format!("listing the paired computers: {error}"));
                ComputersAnswer::Stopped(error.into())
            }
        }
    }

    /// Forgets a computer ("Forget this computer"): ends its connection,
    /// then wipes its key and its details. Forgetting a computer that isn't
    /// listed succeeds.
    pub async fn forget(&self, computer: &str) -> ForgetOutcome {
        let Ok(id) = ComputerId::parse(computer) else {
            return ForgetOutcome::Forgotten;
        };
        self.connections.end(&id);
        let forgotten = {
            let id = id.clone();
            self.store.run(move |computers| computers.forget(&id)).await
        };
        // A connect that started meanwhile may have read the key before it
        // was wiped: it ends too, and one still opening finds it ended.
        self.connections.end(&id);
        self.connections.forget_status(&id);
        match forgotten {
            Ok(()) => ForgetOutcome::Forgotten,
            Err(error) => {
                self.host.log(&format!("forgetting a computer: {error}"));
                ForgetOutcome::Stopped(error.into())
            }
        }
    }

    /// Each computer's latest status, for a page that has just started
    /// listening.
    pub fn statuses(&self) -> Vec<(ComputerId, PageStatus)> {
        self.connections.statuses()
    }

    /// Each computer's open session, by generation, for a page that has
    /// just started listening: it sends `hello` on each.
    pub fn sessions(&self) -> Vec<(ComputerId, u64)> {
        self.connections.sessions()
    }

    /// Asks Android's local network question when any of `endpoints` is on
    /// the Wi-Fi.
    pub(crate) async fn allow_local_network(&self, endpoints: &[Endpoint]) -> Result<(), Problem> {
        if !endpoints.iter().any(needs_local_network) {
            return Ok(());
        }
        match self.host.allow_local_network().await {
            LocalNetwork::Allowed => Ok(()),
            LocalNetwork::TurnedDown { ask_again } => Err(Problem::NoLocalNetwork { ask_again }),
        }
    }

    /// A number no earlier pairing or connection had.
    pub(crate) fn next_serial(&self) -> u64 {
        self.serials.fetch_add(1, Ordering::Relaxed)
    }
}

/// The time now, in milliseconds since the Unix epoch; 0 for a clock set
/// before 1970.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| u64::try_from(since.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}
