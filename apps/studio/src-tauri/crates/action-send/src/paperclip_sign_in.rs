//! Signing in for the Paperclip admin key of rows C1 and C5 (architecture
//! note on HAL-17491, 6.8, condition 3; plan OK on HAL-21110). The shell runs
//! Paperclip's own CLI sign-in itself, on the origin of the connection's
//! keychain entry: it starts a challenge, opens the approval page in the
//! user's browser, polls until a board member approves it, checks with
//! `/api/cli-auth/me` that the key works for the connection's company, and
//! stores it with [`paperclip_admin::store_admin_key`]. The key never reaches
//! the page: the sign-in answers only the account.
//!
//! It runs only while its stepper is open (note, 6.7): it checks its
//! [`SignInCancel`] after every wait and every call, and a sign-in it gives up
//! cancels the challenge and revokes the key, so no key outlives it.
//! [`PaperclipSignIn::sign_out`] revokes the key in Paperclip and forgets it,
//! as the shell does when the stepper closes.

use std::sync::Arc;

use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;
use url::Url;

use crate::account::Account;
use crate::paperclip_admin::{
    self, PaperclipConnection, connection_of, forget_admin_key, store_admin_key,
};
use crate::send::{Answer, Outgoing, Transport};
use crate::sign_in::{Clock, Keychain, SignInCancel, SignInResult};
use crate::wipe::Wiped;

/// The catalog's name for Paperclip.
pub const PAPERCLIP: &str = "paperclip";

/// The name Paperclip's approval page shows and gives the key.
const CLIENT_NAME: &str = "Halonic Studio admin key";

/// What the approval page says the key is for.
const COMMAND: &str = "Halonic Studio: one secret, signed out when its stepper closes";

/// The wait between polls, and the longest a challenge is waited for.
const POLL_SECONDS: u64 = 3;
const MAX_WAIT_SECONDS: u64 = 10 * 60;

/// The longest challenge id and user id the shell takes.
const MAX_ID_CHARS: usize = 128;

const NOT_CONNECTED: &str =
    "Connect this Paperclip in Studio first, over https or on this computer.";
const NOT_STARTED: &str = "Paperclip didn't start the sign-in. Try again in a moment.";
const UNREACHABLE: &str = "Halonic couldn't reach Paperclip. Check your connection and try again.";
const EXPIRED: &str = "Nobody approved the sign-in in time. Start it again.";
const WRONG_COMPANY: &str =
    "The approved key can't reach this company. Approve it as a board member of the company.";
const NOT_STORED: &str = "Halonic couldn't save the sign-in in your keychain.";

/// Where the shell opens the approval page: the user's browser.
pub trait ApprovalScreen {
    /// Opens `page`, on the connection's own origin.
    fn show(&self, page: &Url);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChallengeAnswer {
    id: String,
    token: String,
    board_api_token: String,
    approval_path: String,
}

#[derive(Deserialize)]
struct StatusAnswer {
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnerAnswer {
    user_id: String,
    company_ids: Vec<String>,
}

/// A challenge Paperclip started. Its secret and the key are wiped when it
/// is dropped.
struct Challenge {
    id: String,
    secret: Wiped,
    key: Wiped,
    page: Url,
}

/// Everything a sign-in or sign-out needs from the shell.
pub struct PaperclipSignIn<'a, T, K, C, S> {
    /// The connection's name, as Studio's connection file names it.
    pub connection: &'a str,
    pub transport: &'a T,
    pub keychain: &'a K,
    pub clock: &'a C,
    pub screen: &'a S,
    pub cancel: &'a Arc<SignInCancel>,
    /// Takes one line for the shell's log. Never given a key, a challenge
    /// secret or an address that holds one.
    pub log: &'a (dyn Fn(String) + Sync),
}

impl<T: Transport, K: Keychain, C: Clock, S: ApprovalScreen> PaperclipSignIn<'_, T, K, C, S> {
    /// Signs the user in for the admin key, or says why not.
    pub async fn sign_in(&self) -> SignInResult {
        let result = self.run().await;
        let outcome = match &result {
            SignInResult::SignedIn { account } => format!("signed in as {}", account.name),
            SignInResult::Cancelled => "cancelled".to_owned(),
            SignInResult::NotAvailable => "not available".to_owned(),
            SignInResult::Failed { reason } => format!("failed: {reason}"),
        };
        (self.log)(format!("action_sign_in paperclip: {outcome}"));
        result
    }

    /// Revokes the admin key in Paperclip, then forgets it, also when the
    /// revoke fails, so the key never stays on this computer.
    pub async fn sign_out(&self) -> Result<(), halonic_secrets::SecretError> {
        let name = self.connection.to_owned();
        let now = self.clock.now();
        let found = self
            .keychain
            .with_backend(move |backend| {
                let Some(connection) = connection_of(backend, &name)? else {
                    return Ok(None);
                };
                let key = paperclip_admin::admin_key(backend, &connection, now)?;
                Ok(key.map(|key| (connection, Wiped::text(key))))
            })
            .await?;
        if let Some((connection, key)) = found {
            self.revoke(&connection, &key).await;
        }
        self.keychain.with_backend(forget_admin_key).await
    }

    async fn run(&self) -> SignInResult {
        let Some(connection) = self.connection_record().await else {
            return SignInResult::failed(NOT_CONNECTED);
        };
        let Some(challenge) = self.start(&connection).await else {
            return self.unless_cancelled(SignInResult::failed(NOT_STARTED));
        };
        if self.cancel.is_cancelled() {
            self.give_up(&connection, &challenge).await;
            return SignInResult::Cancelled;
        }
        self.screen.show(&challenge.page);
        if let Err(result) = self.wait_for_approval(&connection, &challenge).await {
            self.give_up(&connection, &challenge).await;
            return result;
        }
        let Some(user) = self.owner(&connection, &challenge.key).await else {
            self.give_up(&connection, &challenge).await;
            return self.unless_cancelled(SignInResult::failed(WRONG_COMPANY));
        };
        self.store(&connection, &challenge, user).await
    }

    async fn connection_record(&self) -> Option<PaperclipConnection> {
        let name = self.connection.to_owned();
        match self
            .keychain
            .with_backend(move |backend| connection_of(backend, &name))
            .await
        {
            Ok(connection) => connection,
            Err(error) => {
                (self.log)(error.log_message("action_sign_in paperclip"));
                None
            }
        }
    }

    async fn start(&self, connection: &PaperclipConnection) -> Option<Challenge> {
        let body = json!({
            "command": COMMAND,
            "clientName": CLIENT_NAME,
            "requestedAccess": "board",
            "requestedCompanyId": connection.company,
        });
        let address = address(connection, "/api/cli-auth/challenges")?;
        let answer = self
            .call("POST", address, None, Some(body.to_string()))
            .await
            .ok()?;
        if !(200..300).contains(&answer.status) {
            (self.log)(format!(
                "action_sign_in paperclip: the challenge request answered {}",
                answer.status
            ));
            return None;
        }
        let started: ChallengeAnswer = json_of(&answer)?;
        let secret = Wiped::text(started.token);
        let key = Wiped::text(started.board_api_token);
        let page = approval_page(connection, &started.approval_path)?;
        let usable = is_id(&started.id) && !secret.as_str().is_empty() && !key.as_str().is_empty();
        usable.then_some(Challenge {
            id: started.id,
            secret,
            key,
            page,
        })
    }

    /// Polls until a board member approves the challenge. `Err` holds what
    /// the sign-in answers when it ends any other way.
    async fn wait_for_approval(
        &self,
        connection: &PaperclipConnection,
        challenge: &Challenge,
    ) -> Result<(), SignInResult> {
        let deadline = self.clock.now().saturating_add(MAX_WAIT_SECONDS);
        loop {
            self.clock.pause(POLL_SECONDS).await;
            if self.cancel.is_cancelled() {
                return Err(SignInResult::Cancelled);
            }
            if self.clock.now() >= deadline {
                return Err(SignInResult::failed(EXPIRED));
            }
            match self.poll(connection, challenge).await.as_deref() {
                Some("pending") => {}
                Some("approved") => return Ok(()),
                Some("cancelled") => return Err(SignInResult::Cancelled),
                Some("expired") => return Err(SignInResult::failed(EXPIRED)),
                _ => return Err(self.unless_cancelled(SignInResult::failed(UNREACHABLE))),
            }
        }
    }

    async fn poll(
        &self,
        connection: &PaperclipConnection,
        challenge: &Challenge,
    ) -> Option<String> {
        let mut address = address(connection, &challenge_path(&challenge.id, ""))?;
        address
            .query_pairs_mut()
            .append_pair("token", challenge.secret.as_str());
        let answer = self.call("GET", address, None, None).await.ok()?;
        let status: StatusAnswer = (answer.status == 200).then(|| json_of(&answer)).flatten()?;
        Some(status.status)
    }

    /// Paperclip's id of the board member whose key it is, when the key
    /// reaches the connection's company.
    async fn owner(&self, connection: &PaperclipConnection, key: &Wiped) -> Option<String> {
        let address = address(connection, "/api/cli-auth/me")?;
        let answer = self.call("GET", address, Some(key), None).await.ok()?;
        let owner: OwnerAnswer = (answer.status == 200).then(|| json_of(&answer)).flatten()?;
        let reaches = owner
            .company_ids
            .iter()
            .any(|company| *company == connection.company);
        (reaches && is_id(&owner.user_id)).then_some(owner.user_id)
    }

    /// Stores the key, unless the stepper closed first. A cancel that comes
    /// while the write waits on an unlock prompt takes the write back once it
    /// is through, and the key is revoked.
    async fn store(
        &self,
        connection: &PaperclipConnection,
        challenge: &Challenge,
        user: String,
    ) -> SignInResult {
        let cancel = Arc::clone(self.cancel);
        let record = connection.clone();
        let account = user.clone();
        let key = Wiped::text(challenge.key.as_str().to_owned());
        let now = self.clock.now();
        let stored = self
            .keychain
            .with_backend(move |backend| {
                if cancel.is_cancelled() {
                    return Ok(false);
                }
                store_admin_key(backend, &record, &account, key.as_str(), now)?;
                if cancel.is_cancelled() {
                    forget_admin_key(backend)?;
                    return Ok(false);
                }
                Ok(true)
            })
            .await;
        match stored {
            Ok(true) => SignInResult::SignedIn {
                account: Account {
                    service: PAPERCLIP.to_owned(),
                    name: user,
                },
            },
            Ok(false) => {
                self.revoke(connection, &challenge.key).await;
                SignInResult::Cancelled
            }
            Err(error) => {
                (self.log)(error.log_message("action_sign_in paperclip"));
                self.revoke(connection, &challenge.key).await;
                SignInResult::failed(NOT_STORED)
            }
        }
    }

    /// Cancels the challenge and revokes its key, whichever state it is in,
    /// so a sign-in that ends early leaves no key that works. Failures only
    /// go to the log: a challenge nobody approves expires by itself.
    async fn give_up(&self, connection: &PaperclipConnection, challenge: &Challenge) {
        let body = json!({ "token": challenge.secret.as_str() }).to_string();
        let cancelled = match address(connection, &challenge_path(&challenge.id, "/cancel")) {
            Some(address) => self.call("POST", address, None, Some(body)).await,
            None => Err("no address".to_owned()),
        };
        if cancelled.is_err() {
            (self.log)("action_sign_in paperclip: the challenge couldn't be cancelled".to_owned());
        }
        self.revoke(connection, &challenge.key).await;
    }

    /// Revokes `key` in Paperclip (`POST /api/cli-auth/revoke-current`).
    async fn revoke(&self, connection: &PaperclipConnection, key: &Wiped) {
        let Some(address) = address(connection, "/api/cli-auth/revoke-current") else {
            return;
        };
        let revoked = self.call("POST", address, Some(key), None).await;
        if !revoked.is_ok_and(|answer| (200..300).contains(&answer.status)) {
            (self.log)("action_sign_in paperclip: the admin key couldn't be revoked".to_owned());
        }
    }

    /// `result`, or `cancelled` when the stepper closed meanwhile.
    fn unless_cancelled(&self, result: SignInResult) -> SignInResult {
        if self.cancel.is_cancelled() {
            SignInResult::Cancelled
        } else {
            result
        }
    }

    async fn call(
        &self,
        method: &'static str,
        address: Url,
        key: Option<&Wiped>,
        body: Option<String>,
    ) -> Result<Answer, String> {
        let mut headers = vec![("accept".to_owned(), "application/json".to_owned())];
        if body.is_some() {
            headers.push(("content-type".to_owned(), "application/json".to_owned()));
        }
        if let Some(key) = key {
            headers.push((
                "authorization".to_owned(),
                format!("Bearer {}", key.as_str()),
            ));
        }
        let call = Outgoing {
            method,
            address,
            headers,
            body: body.map(String::into_bytes),
        };
        self.transport.send(call).await
    }
}

/// `path` on the connection's origin.
fn address(connection: &PaperclipConnection, path: &str) -> Option<Url> {
    Url::parse(&connection.origin).ok()?.join(path).ok()
}

/// The path of challenge `id`, which [`is_id`] has checked, plus `rest`.
fn challenge_path(id: &str, rest: &str) -> String {
    format!("/api/cli-auth/challenges/{id}{rest}")
}

/// The approval page on the connection's own origin. Only a path under
/// `/cli-auth/` is taken from Paperclip's answer, so the page always opens
/// on the address the user connected, even when Paperclip names another.
fn approval_page(connection: &PaperclipConnection, path: &str) -> Option<Url> {
    if !path.starts_with("/cli-auth/") || path.contains("..") || path.contains('\\') {
        return None;
    }
    let page = address(connection, path)?;
    (page.origin().ascii_serialization() == connection.origin).then_some(page)
}

/// Whether `text` can be an id in a path or a name: letters, digits, `-`
/// and `_`, at most [`MAX_ID_CHARS`].
fn is_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_ID_CHARS
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn json_of<T: DeserializeOwned>(answer: &Answer) -> Option<T> {
    serde_json::from_slice(&answer.body).ok()
}
