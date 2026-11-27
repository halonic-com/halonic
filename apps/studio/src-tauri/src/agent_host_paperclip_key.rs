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
//!
//! When a workspace opens, the page asks `agent_host_paperclip_restore`
//! once, and the shell hands the kept keys back to the host itself
//! (`halonic_agent_host::restore_paperclip_keys`), on a route no page can
//! name.
//!
//! Before a sign-in starts, the page may ask `agent_host_paperclip_key_kept`
//! whether the shell keeps a key for a connection: one bit, never the key
//! (`halonic_agent_host::paperclip_key_kept`), so a sign-in doesn't write
//! over an entry the host doesn't hold yet.

use std::sync::{Arc, LazyLock};

use halonic_agent_host::{
    HandOver, HostCallFailed, KEY_HAND_OVER, KeepTurns, KeptRefusal, RestoreChecks, RestoreHost,
    Route, SIGN_IN_CANCEL, SIGN_IN_CONFIRM, SignInHost, find_route, forget_paperclip_key,
    keep_poll_answer, page_answer, page_cancel_answer, paperclip_key_kept, restore_paperclip_keys,
    same_workspace,
};
use halonic_secrets::SecretBackend;
use halonic_trust_grant::PickedFolders;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

use super::{HostAnswer, HostRefusal, read_answer, send};
use crate::secrets::SecretsState;
use crate::trust::picked_folders;

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

/// Hands the kept Paperclip keys of the workspace `workspace` names back to
/// the agent host, when it opens, and answers how many went back. The page
/// only says when: the shell asks the host itself whether the workspace may
/// start a run and which connections need a key, checks the folder and each
/// entry, and sends each key on a route no page can name. It is refused as
/// `host_unavailable` only when the host couldn't list the workspace's
/// connections, so the page asks again later; anything else it can't do goes
/// to the shell's log, and that connection stays on Sign in again.
#[tauri::command]
pub async fn agent_host_paperclip_restore<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
) -> Result<usize, HostRefusal> {
    let keychain = keychain(&app)?;
    let picked = picked_folders(&app).map_err(|refusal| {
        HostRefusal::new(
            "io",
            format!("the picked folders can't be read: {refusal:?}"),
        )
    })?;
    restore_for(&app, keychain, picked, workspace).await
}

/// The restore of `agent_host_paperclip_restore`, against `keychain` and
/// the folders `picked` remembers.
pub(super) async fn restore_for<R: Runtime>(
    app: &AppHandle<R>,
    keychain: Arc<dyn SecretBackend>,
    picked: PickedFolders,
    workspace: String,
) -> Result<usize, HostRefusal> {
    let host = ShellRestore { app: app.clone() };
    on_worker(move || {
        let checks = ShellChecks { picked };
        restore_paperclip_keys(keychain.as_ref(), &host, &checks, &workspace)
    })
    .await?
    .map_err(|HostCallFailed| {
        HostRefusal::new(
            "host_unavailable",
            "the agent host couldn't list the workspace's connections",
        )
    })
}

/// Answers whether the shell keeps a Paperclip key for `connection`, a
/// connection the workspace `workspace` names, as the page names it: yes or
/// no, never the key. The shell asks the host for the workspace's
/// connections itself, and answers only for a workspace that is still a
/// folder the person picked and a connection its connection file names.
/// Otherwise it refuses: `invalid_connection`, `not_picked`,
/// `unknown_connection`, `host_unavailable` while the host can't list the
/// workspace, or `keychain` when the keychain can't be asked, never `false`.
#[tauri::command]
pub async fn agent_host_paperclip_key_kept<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    connection: String,
) -> Result<bool, HostRefusal> {
    let keychain = keychain(&app)?;
    let picked = picked_folders(&app).map_err(|refusal| {
        HostRefusal::new(
            "io",
            format!("the picked folders can't be read: {refusal:?}"),
        )
    })?;
    key_kept_for(&app, keychain, picked, workspace, connection).await
}

/// The answer of `agent_host_paperclip_key_kept`, against `keychain` and
/// the folders `picked` remembers.
pub(super) async fn key_kept_for<R: Runtime>(
    app: &AppHandle<R>,
    keychain: Arc<dyn SecretBackend>,
    picked: PickedFolders,
    workspace: String,
    connection: String,
) -> Result<bool, HostRefusal> {
    let host = ShellRestore { app: app.clone() };
    on_worker(move || {
        let checks = ShellChecks { picked };
        paperclip_key_kept(keychain.as_ref(), &host, &checks, &workspace, &connection)
    })
    .await?
    .map_err(kept_refusal)
}

/// The page's refusal for `refusal`. None of them holds a key.
fn kept_refusal(refusal: KeptRefusal) -> HostRefusal {
    match refusal {
        KeptRefusal::InvalidConnection => {
            HostRefusal::new("invalid_connection", "that isn't a connection's name")
        }
        KeptRefusal::HostUnavailable => HostRefusal::new(
            "host_unavailable",
            "the agent host couldn't list the workspace's connections",
        ),
        KeptRefusal::NotPicked => HostRefusal::new(
            "not_picked",
            "the workspace isn't a folder the person picked",
        ),
        KeptRefusal::UnknownConnection => HostRefusal::new(
            "unknown_connection",
            "the workspace's connection files name no such connection",
        ),
        KeptRefusal::Keychain(message) => HostRefusal::new("keychain", message),
    }
}

/// The restore's calls, on the host that serves them.
struct ShellRestore<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> ShellRestore<R> {
    /// Sends `route` with `body`, and answers the host's body when it took
    /// the call. It runs on a worker thread, so it waits for the host.
    fn call(&self, route: Route, body: Value) -> Result<Value, HostCallFailed> {
        let answer = tauri::async_runtime::block_on(async {
            let response = send(&self.app, route, Some(body)).await?;
            read_answer(response).await
        });
        match answer {
            Ok(answer) if answer.status == 200 => Ok(answer.body),
            _ => Err(HostCallFailed),
        }
    }
}

impl<R: Runtime> RestoreHost for ShellRestore<R> {
    fn connections(&self, workspace: &str) -> Result<Value, HostCallFailed> {
        let route = find_route(
            "POST /v1/paperclip/connections",
            halonic_agent_host::Answer::Json,
        )
        .ok_or(HostCallFailed)?;
        self.call(route, json!({ "workspace": workspace, "mayStart": true }))
    }

    fn hand_over(&self, hand_over: &HandOver) -> Result<(), HostCallFailed> {
        self.call(KEY_HAND_OVER, hand_over.body()).map(|_| ())
    }
}

/// The restore's checks, with what the shell knows: the folders the person
/// picked, and how an address's origin reads.
struct ShellChecks {
    picked: PickedFolders,
}

impl RestoreChecks for ShellChecks {
    fn is_still_picked(&self, real_path: &str) -> bool {
        self.picked.is_still_picked(real_path, same_workspace)
    }

    fn same_origin(&self, first: &str, second: &str) -> bool {
        same_origin(first, second)
    }
}

/// Whether two addresses have the same scheme, host and port, as the host's
/// key guard compares them: `https://PAPERCLIP.acme.test:443/` is the origin
/// of `https://paperclip.acme.test`. An address without one (not a URL, or
/// one with no host) matches nothing.
pub(super) fn same_origin(first: &str, second: &str) -> bool {
    let origin = |address: &str| {
        Url::parse(address)
            .ok()
            .map(|url| url.origin())
            .filter(url::Origin::is_tuple)
    };
    match (origin(first), origin(second)) {
        (Some(first), Some(second)) => first == second,
        _ => false,
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
