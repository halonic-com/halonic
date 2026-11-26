//! What the service needs from the app around it: Android's local network
//! question, the owner check before an answer to an approval, a way to tell
//! the page a status and a session's messages, and the shell's log.

use std::future::Future;
use std::net::IpAddr;
use std::pin::Pin;

use halonic_connect::{Reach, reach};
use halonic_device_keys::ComputerId;
use halonic_owner_check::{Availability, Confirmation, Decision, OwnerCheck};
use halonic_tunnel::{Endpoint, MAX_NAME_BYTES, PhoneDetails};

use crate::status::PageStatus;

/// Android's answer to its local network question.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalNetwork {
    Allowed,
    /// Turned down; `ask_again` says whether Android will ask next time.
    TurnedDown {
        ask_again: bool,
    },
}

/// The local network answer, still to come.
pub type LocalNetworkAnswer<'a> = Pin<Box<dyn Future<Output = LocalNetwork> + Send + 'a>>;

/// The phone's name and platform, still to come.
pub type PhoneAnswer<'a> = Pin<Box<dyn Future<Output = PhoneDetails> + Send + 'a>>;

/// The owner check's answer, still to come.
pub type OwnerAnswer<'a> = Pin<Box<dyn Future<Output = Confirmation> + Send + 'a>>;

/// How many times the app has left the screen, still to come.
pub type AwayAnswer<'a> = Pin<Box<dyn Future<Output = Option<u64>> + Send + 'a>>;

/// The app around the service: the shell on the phone, a recording fake in
/// the tests.
pub trait TunnelHost: Send + Sync + 'static {
    /// Asks Android's local network question when the person hasn't
    /// answered it yet. The service asks before anything reaches an address
    /// on the Wi-Fi: from Android 17 a blocked connection only times out.
    fn allow_local_network(&self) -> LocalNetworkAnswer<'_>;

    /// What the phone tells the computer about itself in pairing message
    /// 3: its name, as the person named the phone, and its platform. The
    /// computer shows it next to the check code.
    fn phone(&self) -> PhoneAnswer<'_>;

    /// Asks the person to confirm `decision` with the phone's owner check,
    /// in a new prompt, before the service seals an `answer-approval`
    /// (board decision 4b). Only [`Confirmation::Confirmed`] lets it out;
    /// a phone without an owner check answers with [`confirm_with`]`(None, ..)`.
    fn confirm_owner(&self, decision: Decision) -> OwnerAnswer<'_>;

    /// How many times the app has left the screen since it started (the
    /// background, a screen lock), from the owner check; `None` when it
    /// can't tell. A pass for an inbox answer covers the next one only while
    /// this stays the same (requirement `phone-answer-confirm`). A phone
    /// without an owner check answers with [`times_away_with`]`(None)`.
    fn times_away(&self) -> AwayAnswer<'_>;

    /// A paired computer's status changed. The shell passes it on to the
    /// app's own page only (H1 on HAL-15181).
    fn status_changed(&self, computer: &ComputerId, status: &PageStatus);

    /// A session to a paired computer has opened, under a `generation` no
    /// other session in this process has had: the page sends `hello` on
    /// it. Passed on to the app's own page only, like a status.
    fn session_opened(&self, computer: &ComputerId, generation: u64);

    /// One host message of the session `generation`, in the order the host
    /// sent them, as text the page hasn't read yet. Passed on to the app's
    /// own page only, and never logged.
    fn message(&self, computer: &ComputerId, generation: u64, text: &str);

    /// Something failed that no page waits for, such as noting a
    /// connection in the paired-computer list. The line never holds a key,
    /// a code or a message's text.
    fn log(&self, line: &str);
}

/// Asks `check` to confirm `decision`, or answers unavailable when there
/// is no check (iOS, or its setup failed), so a missing check never lets an
/// answer through (Julian's condition 2 on HAL-15212).
pub async fn confirm_with<O: OwnerCheck>(check: Option<&O>, decision: Decision) -> Confirmation {
    match check {
        Some(check) => check.confirm(decision).await,
        None => Confirmation::Unavailable(Availability::Unavailable),
    }
}

/// How many times the app has left the screen, as `check` counts them, or
/// `None` when there is no check, so a pass is never kept without one.
pub async fn times_away_with<O: OwnerCheck>(check: Option<&O>) -> Option<u64> {
    match check {
        Some(check) => check.times_away().await,
        None => None,
    }
}

/// Whether reaching `endpoint` needs Android's local network permission:
/// an address on the home network that isn't this phone, or a `.local`
/// name, which Android looks up on the Wi-Fi. Tailscale's `100.x`
/// addresses and other names don't, as for the connect page's own check.
pub fn needs_local_network(endpoint: &Endpoint) -> bool {
    let host = endpoint.host();
    match host.parse::<IpAddr>() {
        Ok(ip) => reach(ip) == Reach::HomeNetwork && !ip.to_canonical().is_loopback(),
        Err(_) => host.to_ascii_lowercase().ends_with(".local"),
    }
}

/// The phone's name as pairing message 3 carries it: trimmed, cut at a
/// whole character to [`MAX_NAME_BYTES`], and `fallback` when it is empty.
pub fn phone_name(name: &str, fallback: &str) -> String {
    let name = name.trim();
    let name = if name.is_empty() { fallback } else { name };
    let mut end = name.len().min(MAX_NAME_BYTES);
    while !name.is_char_boundary(end) {
        end -= 1;
    }
    name[..end].to_owned()
}
