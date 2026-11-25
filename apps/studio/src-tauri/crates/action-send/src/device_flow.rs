//! Signing in to GitHub with a GitHub App's device flow (architecture note
//! on HAL-17491, 3.1, decision 2). The app's client id is public and there
//! is no client secret. The shell asks GitHub for a code, the user types it
//! on `https://github.com/login/device`, and the shell polls until GitHub
//! hands over a user token. That token must expire: an answer without
//! `expires_in` is refused. No refresh token is kept, so an expired token
//! means signing in again. The login comes from `GET /user`, and the token
//! goes straight to the keychain with [`account::store`].
//!
//! The flow runs only while its stepper is open (note, 6.7): it checks its
//! [`SignInCancel`] after every wait and every call, and stores the token
//! only if it wasn't cancelled.

use std::sync::Arc;

use serde::Deserialize;
use serde::de::DeserializeOwned;
use url::Url;
use url::form_urlencoded::Serializer;

use crate::account::{self, Account, is_account_name};
use crate::send::{Answer, Outgoing, Transport};
use crate::services::GITHUB;
use crate::sign_in::{Clock, CodeScreen, Keychain, SignInCancel, SignInResult, UserCode};
use crate::wipe::Wiped;

/// The page where the user types the code. Fixed here: the address in
/// GitHub's answer isn't used.
pub const DEVICE_PAGE: &str = "https://github.com/login/device";

/// The refusal for an app whose tokens never expire (note, 3.1).
pub const NEVER_EXPIRES: &str =
    "This GitHub App gives tokens that never expire. Ask its owner to turn on token expiry.";

const CODE_ADDRESS: &str = "https://github.com/login/device/code";
const TOKEN_ADDRESS: &str = "https://github.com/login/oauth/access_token";
const USER_ADDRESS: &str = "https://api.github.com/user";
const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";

/// GitHub's shortest wait between polls, and what `slow_down` adds to it.
const POLL_SECONDS: u64 = 5;

/// The longest wait between polls, whatever GitHub's answer says.
const MAX_POLL_SECONDS: u64 = 60;

/// The longest a code is waited for, whatever GitHub's answer says.
const MAX_CODE_SECONDS: u64 = 15 * 60;

/// The longest client id the shell takes, from Settings or the build.
const MAX_CLIENT_ID_CHARS: usize = 64;

const NOT_STARTED: &str = "GitHub didn't start the sign-in. Try again in a moment.";
const UNREACHABLE: &str = "Halonic couldn't reach GitHub. Check your connection and try again.";
const CODE_EXPIRED: &str = "The code expired before it was entered. Start the sign-in again.";
const NO_LOGIN: &str = "GitHub didn't say which account signed in. Start the sign-in again.";
const NOT_STORED: &str = "Halonic couldn't save the sign-in in your keychain.";

/// Whether `text` can be a GitHub App's client id: letters, digits, `.`,
/// `_` and `-`, at most 64 characters.
pub fn is_client_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_CLIENT_ID_CHARS
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

#[derive(Deserialize)]
struct CodeAnswer {
    device_code: String,
    user_code: String,
    expires_in: u64,
    interval: u64,
}

/// A poll's answer: a token, or an `error` such as `authorization_pending`.
/// A refresh token in it is never read.
#[derive(Deserialize)]
struct TokenAnswer {
    access_token: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct UserAnswer {
    login: String,
}

/// The code GitHub gave, and how long to wait between polls.
struct Started {
    device_code: Wiped,
    user_code: UserCode,
    interval: u64,
}

/// What one poll found.
enum Poll {
    Token { token: Wiped, expires_in: u64 },
    Wait { slower: Option<u64> },
    Done(SignInResult),
}

/// Everything a sign-in needs from the shell.
pub struct DeviceFlow<'a, T, K, C, S> {
    pub client_id: &'a str,
    pub transport: &'a T,
    pub keychain: &'a K,
    pub clock: &'a C,
    pub screen: &'a S,
    pub cancel: &'a Arc<SignInCancel>,
    /// Takes one line for the shell's log. Never given a token or a code.
    pub log: &'a (dyn Fn(String) + Sync),
}

impl<T: Transport, K: Keychain, C: Clock, S: CodeScreen> DeviceFlow<'_, T, K, C, S> {
    /// Signs the user in to GitHub, or says why not.
    pub async fn sign_in(&self) -> SignInResult {
        let result = self.run().await;
        let outcome = match &result {
            SignInResult::SignedIn { account } => format!("signed in as {}", account.name),
            SignInResult::Cancelled => "cancelled".to_owned(),
            SignInResult::NotAvailable => "not available, no client id".to_owned(),
            SignInResult::Failed { reason } => format!("failed: {reason}"),
        };
        (self.log)(format!("action_sign_in github: {outcome}"));
        result
    }

    async fn run(&self) -> SignInResult {
        if !is_client_id(self.client_id) {
            return SignInResult::NotAvailable;
        }
        let Some(started) = self.ask_for_code().await else {
            return self.unless_cancelled(SignInResult::failed(NOT_STARTED));
        };
        if self.cancel.is_cancelled() {
            return SignInResult::Cancelled;
        }
        self.screen.show(&started.user_code);
        let (token, expires_in) = match self.wait_for_token(&started).await {
            Ok(found) => found,
            Err(result) => return result,
        };
        if self.cancel.is_cancelled() {
            return SignInResult::Cancelled;
        }
        let Some(login) = self.login(&token).await else {
            return self.unless_cancelled(SignInResult::failed(NO_LOGIN));
        };
        self.store(login, token, self.clock.now().saturating_add(expires_in))
            .await
    }

    async fn ask_for_code(&self) -> Option<Started> {
        let body = Serializer::new(String::new())
            .append_pair("client_id", self.client_id)
            .finish();
        let answer = self.post(CODE_ADDRESS, body).await.ok()?;
        if answer.status != 200 {
            (self.log)(format!(
                "action_sign_in github: the code request answered {}",
                answer.status
            ));
            return None;
        }
        let code: CodeAnswer = json(&answer)?;
        let device_code = Wiped::text(code.device_code);
        let plain_code = !code.user_code.is_empty()
            && code.user_code.len() <= 16
            && code
                .user_code
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
        if !plain_code || device_code.as_str().is_empty() || code.expires_in == 0 {
            return None;
        }
        Some(Started {
            device_code,
            user_code: UserCode {
                code: code.user_code,
                page: DEVICE_PAGE,
                expires_in: code.expires_in.min(MAX_CODE_SECONDS),
            },
            interval: code.interval.clamp(POLL_SECONDS, MAX_POLL_SECONDS),
        })
    }

    /// Polls at GitHub's pace until it hands over a token, the code
    /// expires, the user turns it down or the stepper closes.
    async fn wait_for_token(&self, started: &Started) -> Result<(Wiped, u64), SignInResult> {
        let deadline = self
            .clock
            .now()
            .saturating_add(started.user_code.expires_in);
        let mut interval = started.interval;
        loop {
            self.clock.pause(interval).await;
            if self.cancel.is_cancelled() {
                return Err(SignInResult::Cancelled);
            }
            if self.clock.now() >= deadline {
                return Err(SignInResult::failed(CODE_EXPIRED));
            }
            match self.poll(&started.device_code).await {
                Poll::Token { token, expires_in } => return Ok((token, expires_in)),
                Poll::Wait { slower: None } => {}
                Poll::Wait {
                    slower: Some(seconds),
                } => interval = seconds.max(interval + POLL_SECONDS).min(MAX_POLL_SECONDS),
                Poll::Done(result) => return Err(self.unless_cancelled(result)),
            }
        }
    }

    async fn poll(&self, device_code: &Wiped) -> Poll {
        let form = Serializer::new(String::new())
            .append_pair("client_id", self.client_id)
            .append_pair("device_code", device_code.as_str())
            .append_pair("grant_type", GRANT_TYPE)
            .finish();
        let Ok(answer) = self.post(TOKEN_ADDRESS, form).await else {
            return Poll::Done(SignInResult::failed(UNREACHABLE));
        };
        let body = Wiped(answer.body);
        let Some(found) = serde_json::from_slice::<TokenAnswer>(&body.0).ok() else {
            return Poll::Done(SignInResult::failed(NOT_STARTED));
        };
        if let Some(token) = found.access_token {
            let token = Wiped::text(token);
            return match found.expires_in {
                Some(seconds) if seconds > 0 => Poll::Token {
                    token,
                    expires_in: seconds,
                },
                _ => Poll::Done(SignInResult::failed(NEVER_EXPIRES)),
            };
        }
        match found.error.as_deref() {
            Some("authorization_pending") => Poll::Wait { slower: None },
            Some("slow_down") => Poll::Wait {
                slower: Some(found.interval.unwrap_or(0)),
            },
            Some("expired_token") => Poll::Done(SignInResult::failed(CODE_EXPIRED)),
            Some("access_denied") => Poll::Done(SignInResult::Cancelled),
            _ => Poll::Done(SignInResult::failed(NOT_STARTED)),
        }
    }

    /// The signed-in login, from `GET /user` with the new token.
    async fn login(&self, token: &Wiped) -> Option<String> {
        let mut headers = github_headers();
        headers.push((
            "authorization".to_owned(),
            format!("Bearer {}", token.as_str()),
        ));
        let call = Outgoing {
            method: "GET",
            address: Url::parse(USER_ADDRESS).ok()?,
            headers,
            body: None,
        };
        let answer = self.transport.send(call).await.ok()?;
        let user: UserAnswer = (answer.status == 200).then(|| json(&answer)).flatten()?;
        is_account_name(&user.login).then_some(user.login)
    }

    /// Stores the token and its account, unless the stepper closed first.
    /// A cancel doesn't wait for the keychain, so it can come while the
    /// write is held up by an unlock prompt: then the write is taken back
    /// once it is through, and the sign-in is cancelled (Liam's review of
    /// HAL-18145).
    async fn store(&self, login: String, token: Wiped, expires: u64) -> SignInResult {
        let cancel = Arc::clone(self.cancel);
        let name = login.clone();
        let stored = self
            .keychain
            .with_backend(move |backend| {
                if cancel.is_cancelled() {
                    return Ok(None);
                }
                account::store(backend, GITHUB.name, &name, token.as_str(), expires)?;
                if cancel.is_cancelled() {
                    account::take_back(backend, GITHUB.name, &name)?;
                    return Ok(None);
                }
                Ok(Some(()))
            })
            .await;
        match stored {
            Ok(Some(())) => SignInResult::SignedIn {
                account: Account {
                    service: GITHUB.name.to_owned(),
                    name: login,
                },
            },
            Ok(None) => SignInResult::Cancelled,
            Err(error) => {
                (self.log)(error.log_message("action_sign_in github"));
                SignInResult::failed(NOT_STORED)
            }
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

    async fn post(&self, address: &str, form: String) -> Result<Answer, String> {
        let call = Outgoing {
            method: "POST",
            address: Url::parse(address).map_err(|error| error.to_string())?,
            headers: vec![
                ("accept".to_owned(), "application/json".to_owned()),
                (
                    "content-type".to_owned(),
                    "application/x-www-form-urlencoded".to_owned(),
                ),
            ],
            body: Some(form.into_bytes()),
        };
        self.transport.send(call).await
    }
}

fn github_headers() -> Vec<(String, String)> {
    GITHUB
        .headers
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect()
}

fn json<T: DeserializeOwned>(answer: &Answer) -> Option<T> {
    serde_json::from_slice(&answer.body).ok()
}
