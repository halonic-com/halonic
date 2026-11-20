use std::fmt;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use halonic_secrets::{SecretBackend, SecretError, SecretName, allowed_origins, get_token};
use serde::Serialize;

use crate::rule::engine_secret_name;
use crate::trust::WorkspaceTrust;

/// How long the broker waits for one keychain call before it answers
/// `unavailable`. A locked keychain may show an unlock prompt with no window
/// open; the run step then fails with "secrets unavailable" instead of
/// hanging.
pub const KEYCHAIN_TIMEOUT: Duration = Duration::from_secs(30);

/// The most requests one engine may have open at once, counting calls that
/// timed out but are still stuck in the keychain. Above it the broker
/// refuses with `busy`, so a stuck keychain can't pile up threads.
pub const MAX_OUTSTANDING: usize = 16;

/// What the engine asks for. The control-pipe reader makes one from the
/// engine's `secret_get`, `token_get` or `origins_get` frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrokerRequest {
    /// A workspace secret, such as a provider key.
    Secret { name: String },
    /// A connector's token, named without the token prefix.
    Token { name: String },
    /// The origins a workspace key may be sent to.
    Origins { name: String },
}

impl BrokerRequest {
    /// The frame kind, which is what the shell's log names.
    pub fn kind(&self) -> &'static str {
        match self {
            BrokerRequest::Secret { .. } => "secret_get",
            BrokerRequest::Token { .. } => "token_get",
            BrokerRequest::Origins { .. } => "origins_get",
        }
    }

    /// Checks the name by the request's rule before any keychain call.
    fn check_name(&self) -> Result<(), SecretError> {
        match self {
            BrokerRequest::Secret { name } | BrokerRequest::Origins { name } => {
                engine_secret_name(name).map(drop)
            }
            BrokerRequest::Token { name } => SecretName::token(name).map(drop),
        }
    }

    /// The keychain call, after the name passed [`Self::check_name`].
    fn read(&self, backend: &dyn SecretBackend) -> Result<BrokerAnswer, SecretError> {
        match self {
            BrokerRequest::Secret { name } => {
                let value = backend.get(&engine_secret_name(name)?)?;
                Ok(BrokerAnswer::Value { value })
            }
            BrokerRequest::Token { name } => Ok(BrokerAnswer::Value {
                value: get_token(backend, name)?,
            }),
            BrokerRequest::Origins { name } => Ok(BrokerAnswer::Origins {
                origins: allowed_origins(backend, name)?,
            }),
        }
    }
}

/// The shell's answer, the body of the frame it writes back to the engine.
/// Its `Debug` leaves the value out, so a test failure or a stray `{:?}`
/// can't print a secret.
#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum BrokerAnswer {
    /// The secret or token, or `null` when none is stored.
    Value { value: Option<String> },
    /// The key's allowed origins, or `null` when none is recorded.
    Origins { origins: Option<Vec<String>> },
    /// No answer, and why.
    Refused { reason: BrokerRefusal },
}

impl fmt::Debug for BrokerAnswer {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BrokerAnswer::Value { value: Some(_) } => write!(formatter, "Value(stored)"),
            BrokerAnswer::Value { value: None } => write!(formatter, "Value(none)"),
            BrokerAnswer::Origins { origins } => write!(formatter, "Origins({origins:?})"),
            BrokerAnswer::Refused { reason } => write!(formatter, "Refused({reason:?})"),
        }
    }
}

/// Why the broker didn't answer. The engine fails the step with "secrets
/// unavailable" on `unavailable`, `denied` and `busy`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BrokerRefusal {
    /// The name breaks the secret name rule.
    InvalidName,
    /// The name is Halonic's own or a plugin's; the engine never gets it.
    ReservedName,
    /// The engine's workspace has no trust record on this computer.
    Untrusted,
    /// The engine has [`MAX_OUTSTANDING`] requests open already.
    Busy,
    /// No keychain, or it didn't answer within [`KEYCHAIN_TIMEOUT`].
    Unavailable,
    /// The user or the system refused access to the keychain.
    Denied,
    /// The stored value can no longer be read.
    Unreadable,
    /// Any other keychain failure.
    Failed,
}

impl BrokerRefusal {
    /// What the shell's log says: the reason only, never the name or a
    /// value.
    fn log_reason(self) -> &'static str {
        match self {
            BrokerRefusal::InvalidName => "not a secret name",
            BrokerRefusal::ReservedName => "a Halonic or plugin name",
            BrokerRefusal::Untrusted => "the workspace isn't trusted",
            BrokerRefusal::Busy => "too many open requests",
            BrokerRefusal::Unavailable => "the keychain is unavailable or didn't answer in time",
            BrokerRefusal::Denied => "keychain access was refused",
            BrokerRefusal::Unreadable => "the stored value can't be read",
            BrokerRefusal::Failed => "the keychain failed",
        }
    }
}

impl From<SecretError> for BrokerRefusal {
    fn from(error: SecretError) -> Self {
        match error {
            SecretError::InvalidName => BrokerRefusal::InvalidName,
            SecretError::ReservedName => BrokerRefusal::ReservedName,
            SecretError::Unavailable => BrokerRefusal::Unavailable,
            SecretError::Denied => BrokerRefusal::Denied,
            SecretError::Unreadable => BrokerRefusal::Unreadable,
            SecretError::InvalidValue | SecretError::Backend { .. } => BrokerRefusal::Failed,
        }
    }
}

/// Answers one engine's secret requests. The shell makes one per engine
/// process, for the workspace it started that engine for.
pub struct SecretBroker {
    backend: Arc<dyn SecretBackend>,
    trust: Arc<dyn WorkspaceTrust>,
    timeout: Duration,
    /// Held for each keychain call, so calls run one at a time.
    keychain: Arc<Mutex<()>>,
    outstanding: Arc<AtomicUsize>,
}

impl SecretBroker {
    /// A broker over the shell's keychain for one engine's workspace.
    pub fn new(backend: Arc<dyn SecretBackend>, trust: Arc<dyn WorkspaceTrust>) -> Self {
        Self::with_timeout(backend, trust, KEYCHAIN_TIMEOUT)
    }

    /// The same, waiting `timeout` for each keychain call; tests use a short
    /// one.
    pub fn with_timeout(
        backend: Arc<dyn SecretBackend>,
        trust: Arc<dyn WorkspaceTrust>,
        timeout: Duration,
    ) -> Self {
        Self {
            backend,
            trust,
            timeout,
            keychain: Arc::default(),
            outstanding: Arc::default(),
        }
    }

    /// Answers one request. It blocks for up to the timeout, so the caller
    /// runs it off the UI thread. A refusal goes to the shell's log by kind
    /// and reason.
    pub fn answer(&self, request: &BrokerRequest) -> BrokerAnswer {
        self.try_answer(request).unwrap_or_else(|reason| {
            halonic_shell_log::record(
                "secret-broker",
                format_args!("{} refused: {}", request.kind(), reason.log_reason()),
            );
            BrokerAnswer::Refused { reason }
        })
    }

    fn try_answer(&self, request: &BrokerRequest) -> Result<BrokerAnswer, BrokerRefusal> {
        let slot = Slot::take(&self.outstanding)?;
        request.check_name()?;
        self.check_trust()?;
        let (sender, receiver) = mpsc::sync_channel(1);
        let backend = Arc::clone(&self.backend);
        let keychain = Arc::clone(&self.keychain);
        let request = request.clone();
        thread::Builder::new()
            .name("secret-broker".to_owned())
            .spawn(move || {
                // The slot stays taken until the keychain call returns, even
                // after the wait below has given up.
                let _slot = slot;
                let _alone = keychain.lock().unwrap_or_else(PoisonError::into_inner);
                let answer = request.read(backend.as_ref());
                // A closed channel means the wait timed out and the engine
                // was already answered `unavailable`; the value is dropped.
                if sender.send(answer).is_err() {
                    halonic_shell_log::record(
                        "secret-broker",
                        format_args!("{} answered after the time limit", request.kind()),
                    );
                }
            })
            .map_err(|_| BrokerRefusal::Unavailable)?;
        match receiver.recv_timeout(self.timeout) {
            Ok(answer) => answer.map_err(BrokerRefusal::from),
            Err(_) => Err(BrokerRefusal::Unavailable),
        }
    }

    fn check_trust(&self) -> Result<(), BrokerRefusal> {
        match self.trust.is_trusted() {
            Ok(true) => Ok(()),
            Ok(false) => Err(BrokerRefusal::Untrusted),
            Err(error) => {
                halonic_shell_log::record(
                    "secret-broker",
                    format_args!("couldn't read the workspace's trust record: {error}"),
                );
                Err(BrokerRefusal::Untrusted)
            }
        }
    }
}

/// One open request, counted until it is dropped.
struct Slot(Arc<AtomicUsize>);

impl Slot {
    fn take(outstanding: &Arc<AtomicUsize>) -> Result<Self, BrokerRefusal> {
        let before = outstanding.fetch_add(1, Ordering::SeqCst);
        let slot = Slot(Arc::clone(outstanding));
        if before >= MAX_OUTSTANDING {
            return Err(BrokerRefusal::Busy);
        }
        Ok(slot)
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}
