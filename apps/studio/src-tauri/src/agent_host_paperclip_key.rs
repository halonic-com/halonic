//! The everyday Paperclip key goes from the agent host to the keychain in
//! the shell, never to the page (6.8, condition 1, HAL-20278; requirement
//! `paperclip-key-keep`). `agent_host_request` sends each call through here,
//! so no answer the page gets holds a Paperclip key:
//!
//! - The sign-in poll's approved answer is the one that holds a key.
//!   `halonic_agent_host::keep_poll_answer` writes the key to the keychain,
//!   confirms the sign-in on a route no page can name, and passes the page
//!   the answer without the key.
//! - The sign-in's cancel passes on no key either.
//! - Disconnect deletes the connection's keychain entry once the host has
//!   answered, also when the host refused or couldn't be asked.
//! - Every other Paperclip answer passes on without a `key` field.

use std::sync::{Arc, LazyLock};

use halonic_agent_host::{
    HostCallFailed, KeepTurns, Route, SIGN_IN_CANCEL, SIGN_IN_CONFIRM, SignInHost,
    forget_paperclip_key, keep_poll_answer, page_answer, page_cancel_answer,
};
use halonic_secrets::SecretBackend;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, Runtime};

use super::{HostAnswer, HostRefusal, read_answer, send};
use crate::secrets::SecretsState;

/// The paths of the Paperclip routes, whose answers never pass on a key.
const PAPERCLIP_PATHS: &str = "/v1/paperclip/";

/// The connections' turns to keep a key, for as long as the shell runs.
static KEEP_TURNS: LazyLock<KeepTurns> = LazyLock::new(KeepTurns::default);

/// Sends the page's call to `route` with `body`, and answers what the page
/// gets: the host's answer, or its refusal, after the step `KeyStep::of`
/// reads for the call.
pub(super) async fn send_for_the_page<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<Value>,
) -> Result<HostAnswer, HostRefusal> {
    let step = KeyStep::of(route, body.as_ref());
    let answer = match send(app, route, body).await {
        Ok(response) => read_answer(response).await,
        Err(refusal) => Err(refusal),
    };
    for_the_page(app, step, answer).await
}

/// What the shell does with a call's answer before the page gets it.
#[derive(Debug, PartialEq, Eq)]
enum KeyStep {
    /// A route outside Paperclip's: the answer passes on as it came.
    Pass,
    /// Any other Paperclip route: the answer passes on without a `key` field.
    WithoutKey,
    /// The sign-in's poll: an approved answer's key is kept.
    Poll { sign_in_id: String },
    /// The sign-in's cancel, or a poll that names no sign-in: no key passes
    /// on, and none is kept.
    NoKey,
    /// Disconnect: the connection's keychain entry is deleted afterwards,
    /// and the answer passes on without a `key` field.
    Disconnect { connection: String },
}

impl KeyStep {
    /// The step for `route` called with `body`, read before the body is sent.
    fn of(route: Route, body: Option<&Value>) -> Self {
        let field = |name: &str| {
            body.and_then(|body| body.get(name))
                .and_then(Value::as_str)
                .map(str::to_owned)
        };
        match route.path {
            "/v1/paperclip/sign-in/poll" => {
                field("signInId").map_or(Self::NoKey, |sign_in_id| Self::Poll { sign_in_id })
            }
            "/v1/paperclip/sign-in/cancel" => Self::NoKey,
            "/v1/paperclip/disconnect" => field("connection")
                .map_or(Self::WithoutKey, |connection| Self::Disconnect {
                    connection,
                }),
            path if path.starts_with(PAPERCLIP_PATHS) => Self::WithoutKey,
            _ => Self::Pass,
        }
    }
}

/// The answer the page gets, for a call whose step is `step` and whose
/// answer from the host is `answer`.
async fn for_the_page<R: Runtime>(
    app: &AppHandle<R>,
    step: KeyStep,
    answer: Result<HostAnswer, HostRefusal>,
) -> Result<HostAnswer, HostRefusal> {
    match step {
        KeyStep::Pass => answer,
        KeyStep::WithoutKey => answer.map(|answer| with_body(answer, page_answer)),
        KeyStep::NoKey => answer.map(|answer| with_body(answer, page_cancel_answer)),
        KeyStep::Poll { sign_in_id } => {
            let answer = answer?;
            if answer.status != 200 {
                return Ok(with_body(answer, page_cancel_answer));
            }
            let keychain = keychain(app)?;
            let host = ShellSignIn { app: app.clone() };
            let HostAnswer { status, body } = answer;
            let body = on_worker(move || {
                keep_poll_answer(keychain.as_ref(), &host, &KEEP_TURNS, &sign_in_id, body)
            })
            .await?;
            Ok(HostAnswer { status, body })
        }
        KeyStep::Disconnect { connection } => {
            let keychain = keychain(app)?;
            on_worker(move || forget_paperclip_key(keychain.as_ref(), &connection))
                .await?
                .map_err(|error| HostRefusal::new("keychain", error))?;
            answer.map(|answer| with_body(answer, page_answer))
        }
    }
}

/// The sign-in calls the shell makes itself, on the host that serves them.
struct ShellSignIn<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> ShellSignIn<R> {
    /// Sends `route` for the sign-in, and answers the host's body when it
    /// took the call. It runs on a worker thread, so it waits for the host.
    fn call(&self, route: Route, sign_in_id: &str) -> Result<Value, HostCallFailed> {
        let body = Some(json!({ "signInId": sign_in_id }));
        let answer = tauri::async_runtime::block_on(async {
            let response = send(&self.app, route, body).await?;
            read_answer(response).await
        });
        match answer {
            Ok(answer) if answer.status == 200 => Ok(answer.body),
            _ => Err(HostCallFailed),
        }
    }
}

impl<R: Runtime> SignInHost for ShellSignIn<R> {
    fn confirm(&self, sign_in_id: &str) -> Result<bool, HostCallFailed> {
        let body = self.call(SIGN_IN_CONFIRM, sign_in_id)?;
        body.get("confirmed")
            .and_then(Value::as_bool)
            .ok_or(HostCallFailed)
    }

    fn cancel(&self, sign_in_id: &str) -> Result<(), HostCallFailed> {
        self.call(SIGN_IN_CANCEL, sign_in_id).map(|_| ())
    }
}

/// The keychain the connections' keys are kept in. Without one, a poll's
/// approved answer is refused rather than passed on, and the host revokes
/// the key nobody confirmed.
fn keychain<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<dyn SecretBackend>, HostRefusal> {
    app.try_state::<SecretsState>()
        .map(|state| state.paperclip_keychain())
        .ok_or_else(|| HostRefusal::new("io", "the shell has no keychain"))
}

/// Runs `work`, which waits on the keychain or the host, on a worker thread.
async fn on_worker<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, HostRefusal> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| HostRefusal::new("io", error))
}

fn with_body(answer: HostAnswer, change: impl FnOnce(Value) -> Value) -> HostAnswer {
    HostAnswer {
        status: answer.status,
        body: change(answer.body),
    }
}
