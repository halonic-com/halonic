//! Sends one reviewed call step with the user's token (architecture note on
//! HAL-17491, 2.4): check it against the route list, read the token, confirm
//! an `admin` step in the native dialog, send it to the service's fixed
//! origin without following a redirect, and hand back only the status, the
//! route's kept fields and capped error text. The token goes into one
//! header and nowhere else: not into the result, an error or a log line.

use std::future::Future;

use halonic_secrets::SecretError;
use serde::Serialize;
use serde_json::{Map, Value};
use url::Url;

use crate::account::Account;
use crate::answer::{MORE_THAN_ONE, error_text, kept_fields, redirect_text};
use crate::call::{Refusal, SendRequest, prepare};
use crate::routes::{Risk, RouteList};
use crate::wipe::{Wiped, wipe_bytes, wipe_text};

/// One HTTP call, ready for the network. Its header values (one carries the
/// token) and its body (a sign-in poll's carries the device code) are wiped
/// when it is dropped, so the transport drops it once the call is sent.
#[derive(Debug)]
pub struct Outgoing {
    pub method: &'static str,
    pub address: Url,
    /// Header names in lower case. One of them carries the token.
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

impl Outgoing {
    /// Overwrites every header value and the body with zeros, keeping their
    /// lengths. Dropping the call does this.
    pub fn wipe(&mut self) {
        for (_, value) in &mut self.headers {
            wipe_text(value);
        }
        if let Some(body) = &mut self.body {
            wipe_bytes(body);
        }
    }
}

impl Drop for Outgoing {
    fn drop(&mut self) {
        self.wipe();
    }
}

/// What the service answered. The transport never follows a redirect: a
/// `3xx` comes back here as it is.
#[derive(Debug, Default)]
pub struct Answer {
    pub status: u16,
    pub content_type: Option<String>,
    /// GitHub's `X-Accepted-GitHub-Permissions` on a `403`: which
    /// permission the call needs.
    pub accepted_permissions: Option<String>,
    pub body: Vec<u8>,
}

/// The network. The shell's transport is reqwest with redirects off.
pub trait Transport {
    /// Sends the call, or says why it couldn't, without the call's headers.
    fn send(&self, call: Outgoing) -> impl Future<Output = Result<Answer, String>> + Send;
}

/// Where the token comes from: the OS keychain in the shell.
pub trait Tokens {
    /// The account signed in to the service and its token, or `None`.
    fn token(
        &self,
        service: &str,
    ) -> impl Future<Output = Result<Option<(Account, String)>, SecretError>> + Send;
}

/// What the native confirmation shows: built by the shell, never by the page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfirmSheet {
    pub account: String,
    pub method: &'static str,
    pub address: String,
    /// Each body field and its value, as JSON text.
    pub fields: Vec<(String, String)>,
}

/// The shell's native dialogs, which page script can't draw or click.
pub trait Dialogs {
    /// Asks the user to confirm the call; `false` when they don't.
    fn confirm(&self, sheet: &ConfirmSheet) -> impl Future<Output = bool> + Send;
}

/// What sending a step did: `ActionSendResult` in `@halonicjs/ports`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub enum SendResult {
    Answered {
        status: u16,
        kept: Map<String, Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Refused {
        reason: Refusal,
    },
    Cancelled,
    Unreachable,
}

/// Everything a send needs from the shell.
pub struct Sender<'a, T, K, D> {
    pub routes: &'a RouteList,
    pub transport: &'a T,
    pub tokens: &'a K,
    pub dialogs: &'a D,
    /// Takes one line for the shell's log. Never given the token.
    pub log: &'a (dyn Fn(String) + Sync),
}

impl<T: Transport, K: Tokens, D: Dialogs> Sender<'_, T, K, D> {
    /// Sends the step, or refuses it before anything leaves the computer.
    pub async fn send(&self, request: &SendRequest) -> SendResult {
        let step = format!(
            "{}@{} step {}",
            request.definition, request.version, request.step
        );
        let refused = |reason: Refusal| {
            (self.log)(format!(
                "action_send {step}: refused ({})",
                refusal_name(reason)
            ));
            SendResult::Refused { reason }
        };
        let call = match prepare(self.routes, request) {
            Ok(call) => call,
            Err(reason) => return refused(reason),
        };
        let (account, token) = match self.tokens.token(call.route.service.name).await {
            Ok(Some((account, token))) => (account, Wiped::text(token)),
            Ok(None) => return refused(Refusal::SignedOut),
            Err(error) => {
                (self.log)(error.log_message(&format!("action_send {step}")));
                return refused(Refusal::SignedOut);
            }
        };
        if call.route.risk != Risk::Routine {
            let sheet = ConfirmSheet {
                account: account.name.clone(),
                method: call.route.method.as_str(),
                address: call.address.to_string(),
                fields: call
                    .body
                    .iter()
                    .flatten()
                    .map(|(name, value)| (name.clone(), value.to_string()))
                    .collect(),
            };
            if !self.dialogs.confirm(&sheet).await {
                return SendResult::Cancelled;
            }
        }
        let mut headers: Vec<(String, String)> = call
            .route
            .service
            .headers
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        headers.push((
            "authorization".to_owned(),
            format!("Bearer {}", token.as_str()),
        ));
        let body = call
            .body
            .as_ref()
            .map(|body| Value::Object(body.clone()).to_string().into_bytes());
        if body.is_some() {
            headers.push(("content-type".to_owned(), "application/json".to_owned()));
        }
        let outgoing = Outgoing {
            method: call.route.method.as_str(),
            address: call.address.clone(),
            headers,
            body,
        };
        let answer = match self.transport.send(outgoing).await {
            Ok(answer) => answer,
            Err(error) => {
                (self.log)(format!(
                    "action_send {step}: unreachable ({})",
                    error_text(&error, token.as_str())
                ));
                return SendResult::Unreachable;
            }
        };
        let status = answer.status;
        if (300..400).contains(&status) {
            (self.log)(format!(
                "action_send {step}: the service answered {status}, a redirect"
            ));
            return SendResult::Answered {
                status,
                kept: Map::new(),
                error: Some(redirect_text()),
            };
        }
        let shape = call.route.service.answers;
        if (200..300).contains(&status) {
            return match kept_fields(&answer, shape, &call.route.keep, token.as_str()) {
                Ok(kept) => SendResult::Answered {
                    status,
                    kept,
                    error: None,
                },
                Err(_) => {
                    (self.log)(format!("action_send {step}: more than one match"));
                    SendResult::Answered {
                        status,
                        kept: Map::new(),
                        error: Some(MORE_THAN_ONE.to_owned()),
                    }
                }
            };
        }
        let error = crate::answer::failure_text(&answer, shape, token.as_str());
        SendResult::Answered {
            status,
            kept: Map::new(),
            error,
        }
    }
}

fn refusal_name(reason: Refusal) -> &'static str {
    match reason {
        Refusal::NotInCatalog => "not-in-catalog",
        Refusal::BadValue => "bad-value",
        Refusal::SignedOut => "signed-out",
        Refusal::TooOften => "too-often",
    }
}
