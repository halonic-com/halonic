//! One pairing over the network (requirement `phone-pairing`): a single
//! connection to the endpoint from the QR code or the typed address, the
//! pairing handshake on it, the check code, and the computer's answer once
//! the person has pressed Allow or not (ADR "Pairing and the end-to-end
//! session", pairing rules).
//!
//! A pairing never reconnects: the host counts a pairing handshake that
//! drops after its message 2 as a wrong try, so a drop ends the pairing and
//! the person starts again.

use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::backoff::Backoff;
use crate::codes::{CheckCode, PairingCode};
use crate::connect::{ConnectError, Dialer};
use crate::endpoint::Endpoint;
use crate::error::SessionError;
use crate::handshake::{Pairing, PairingRoute, PhoneDetails};
use crate::keys::{KEY_BYTES, PhoneKeys};
use crate::session::{Opened, Session};
use crate::transport::{ConnectionId, Timeouts, Transport, TransportEvent};

/// How long the phone waits for the computer's answer after message 3. The
/// host waits 2 minutes for Allow and then answers `timed-out`; the phone
/// waits a little longer, so that answer can still arrive.
pub const ALLOW_TIMEOUT: Duration = Duration::from_secs(130);

/// What the phone needs to start a pairing.
pub struct PairingRequest {
    pub endpoint: Endpoint,
    pub code: PairingCode,
    pub route: PairingRoute,
    pub phone: PhoneDetails,
}

/// Why a pairing stopped, as far as the phone can tell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairingProblem {
    /// The connection didn't open, or dropped before the computer answered.
    CantReach(ConnectError),
    /// The handshake stopped: the computer refused the code in cleartext
    /// ([`SessionError::PairRefused`]), the QR's key isn't the computer's
    /// ([`SessionError::CantConfirm`]), or the bytes didn't read.
    Session(SessionError),
    /// The computer's answer: Allow wasn't pressed.
    Denied,
    /// No answer in time, the computer's 2 minutes or the phone's own limit.
    TimedOut,
}

impl From<SessionError> for PairingProblem {
    fn from(error: SessionError) -> Self {
        Self::Session(error)
    }
}

/// The timings of a pairing; [`PairingOptions::DEFAULT`] in the app.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PairingOptions {
    pub timeouts: Timeouts,
    /// For the computer's message 2 after message 1.
    pub handshake_timeout: Duration,
    /// For the computer's answer after message 3.
    pub allow_timeout: Duration,
}

impl PairingOptions {
    pub const DEFAULT: Self = Self {
        timeouts: Timeouts::TUNNEL,
        handshake_timeout: crate::phone::HANDSHAKE_TIMEOUT,
        allow_timeout: ALLOW_TIMEOUT,
    };
}

/// A pairing at the check code: message 3 is sent, and the computer shows
/// the same check code and waits for Allow. Dropping it closes the
/// connection, which ends the pairing on the computer too.
pub struct PairingAtCheck {
    pub host_name: String,
    pub check_code: CheckCode,
    host_key: [u8; KEY_BYTES],
    keys: PhoneKeys,
    session: Session,
    link: Link,
    allow_timeout: Duration,
}

/// A pairing the computer allowed: the key to pin and the phone's key pair
/// for this computer, to keep.
pub struct Paired {
    pub host_name: String,
    pub host_key: [u8; KEY_BYTES],
    pub keys: PhoneKeys,
}

/// Connects to the computer, runs pairing messages 1 to 3 with a new key
/// pair, and stops at the check code.
pub async fn start_pairing(
    request: PairingRequest,
    dialer: Dialer,
    options: PairingOptions,
) -> Result<PairingAtCheck, PairingProblem> {
    let keys = PhoneKeys::generate()?;
    let (pairing, frame1) = Pairing::start(&keys, &request.code, request.route, &request.phone)?;
    let mut link = Link::open(request.endpoint, dialer, options.timeouts).await?;
    link.send(frame1).await?;
    let deadline = tokio::time::Instant::now() + options.handshake_timeout;
    // A computer that doesn't answer message 1 is as good as unreachable.
    let late = PairingProblem::CantReach(ConnectError::Timeout);
    let frame2 = link.next_frame(deadline, late).await?;
    let check = pairing.read_reply(&frame2, Instant::now())?;
    link.send(check.frame3).await?;
    Ok(PairingAtCheck {
        host_name: check.host_name,
        check_code: check.check_code,
        host_key: check.host_key,
        keys,
        session: check.session,
        link,
        allow_timeout: options.allow_timeout,
    })
}

impl PairingAtCheck {
    /// Waits for the computer's answer: `paired` once Allow is pressed, or
    /// why not. A wrong code is known only now, since the code is mixed in
    /// at message 3.
    pub async fn wait_for_allow(mut self) -> Result<Paired, PairingProblem> {
        let deadline = tokio::time::Instant::now() + self.allow_timeout;
        loop {
            let frame = self
                .link
                .next_frame(deadline, PairingProblem::TimedOut)
                .await?;
            let message = match self.session.open(&frame)? {
                Opened::Message(message) => message,
                Opened::Rekeyed => continue,
            };
            return match read_answer(&message) {
                Answer::Paired => Ok(Paired {
                    host_name: self.host_name,
                    host_key: self.host_key,
                    keys: self.keys,
                }),
                Answer::Denied => Err(PairingProblem::Denied),
                Answer::TimedOut => Err(PairingProblem::TimedOut),
                Answer::Other => Err(SessionError::Unreadable.into()),
            };
        }
    }
}

/// The computer's encrypted answer after message 3.
enum Answer {
    Paired,
    Denied,
    TimedOut,
    Other,
}

#[derive(Deserialize)]
struct AnswerMessage<'a> {
    #[serde(rename = "type", borrow)]
    kind: &'a str,
    #[serde(borrow)]
    reason: Option<&'a str>,
}

fn read_answer(message: &[u8]) -> Answer {
    let Ok(answer) = serde_json::from_slice::<AnswerMessage>(message) else {
        return Answer::Other;
    };
    match (answer.kind, answer.reason) {
        ("paired", None) => Answer::Paired,
        ("pair-refused", Some("denied")) => Answer::Denied,
        ("pair-refused", Some("timed-out")) => Answer::TimedOut,
        _ => Answer::Other,
    }
}

/// The pairing's one connection. Anything but a frame on it ends the
/// pairing; dropping it closes the transport.
struct Link {
    transport: Transport,
    events: UnboundedReceiver<TransportEvent>,
    connection: ConnectionId,
}

impl Link {
    async fn open(
        endpoint: Endpoint,
        dialer: Dialer,
        timeouts: Timeouts,
    ) -> Result<Self, PairingProblem> {
        let (transport, mut events) =
            Transport::connect(endpoint, dialer, Backoff::TUNNEL, timeouts)
                .await
                .map_err(PairingProblem::CantReach)?;
        let Some(TransportEvent::Opened(connection)) = events.recv().await else {
            return Err(PairingProblem::CantReach(ConnectError::Unreachable));
        };
        Ok(Self {
            transport,
            events,
            connection,
        })
    }

    async fn send(&self, frame: Vec<u8>) -> Result<(), PairingProblem> {
        self.transport
            .send(self.connection, frame)
            .await
            .map_err(|_| PairingProblem::CantReach(ConnectError::Unreachable))
    }

    /// The next frame, unless the connection drops first, or `deadline`
    /// passes, which gives `late`.
    async fn next_frame(
        &mut self,
        deadline: tokio::time::Instant,
        late: PairingProblem,
    ) -> Result<Vec<u8>, PairingProblem> {
        match tokio::time::timeout_at(deadline, self.events.recv()).await {
            Err(_) => Err(late),
            Ok(Some(TransportEvent::Frame(frame))) => Ok(frame),
            Ok(Some(TransportEvent::TryFailed(reason))) => Err(PairingProblem::CantReach(reason)),
            Ok(_) => Err(PairingProblem::CantReach(ConnectError::Unreachable)),
        }
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        self.transport.close();
    }
}
