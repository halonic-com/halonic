//! The `action_*` commands: the Studio page's way to run a user-only
//! action stepper's steps with the user's own sign-in (HAL-17525,
//! HAL-18084; architecture note on HAL-17491, 2.4, 3.1 and 6.7). Each one
//! wraps `halonic-action-send`, which decides what may be sent or opened;
//! this file gives it the network, the keychain, the native dialogs and the
//! opener, and keeps the sign-in that is running. Each request's record
//! is kept by the `action_record_*` commands in [`records`].
//!
//! Only the app's own windows are granted these commands
//! (`capabilities/desktop-actions.json`): the Studio the computer serves
//! gets none of them.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Instant;

use halonic_action_send::account::{self, Account};
use halonic_action_send::{
    DeviceFlow, GITHUB, OpenLimiter, PAPERCLIP, Refusal, RouteList, SendRequest, SendResult,
    Sender, SignInCancel, SignInResult, StepRef, UserCode, is_client_id, open_guided, open_page,
    operation_step, service,
};
use halonic_secrets::SecretError;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::action_parts::{
    ShellClock, ShellCodeScreen, ShellDialogs, ShellKeychain, ShellTransport, now_seconds,
};
use crate::http_fetch::HttpFetchState;
use crate::secrets::SecretsState;

/// The route list `pnpm discover` writes from the action catalog into
/// `src/generated/action-routes.json`, staged by `build.rs`: an empty list
/// until discover has written one.
const ROUTES: &str = include_str!(concat!(env!("OUT_DIR"), "/action-routes.json"));

/// The host setting that names the GitHub App whose device flow signs the
/// user in: Halonic's public app, or the user's own (note, 3.1).
pub const GITHUB_CLIENT_ID_SETTING: &str = "action-steppers.github-client-id";

/// The sign-in that is running, and the page that started it.
struct RunningSignIn {
    page: String,
    cancel: Arc<SignInCancel>,
}

/// The compiled route list, the open limit, the sign-in that is running
/// and the requests' records.
pub struct ActionState {
    routes: RouteList,
    limiter: OpenLimiter,
    /// Counts the open limit's milliseconds; it only goes forward.
    started: Instant,
    sign_in: Mutex<Option<RunningSignIn>>,
    records: records::RecordsState,
}

impl Default for ActionState {
    fn default() -> Self {
        Self {
            routes: compiled_routes(),
            limiter: OpenLimiter::default(),
            started: Instant::now(),
            sign_in: Mutex::default(),
            records: records::RecordsState::default(),
        }
    }
}

impl ActionState {
    fn now_ms(&self) -> u64 {
        u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX)
    }

    /// Cancels the running sign-in if `page` started it, or any when `None`.
    /// It never waits for the keychain, so the UI thread may call it while
    /// an unlock prompt holds up the sign-in's write.
    fn cancel_sign_in(&self, page: Option<&str>) {
        let mut running = self.sign_in.lock().unwrap_or_else(PoisonError::into_inner);
        let started_there =
            |sign_in: &mut RunningSignIn| page.is_none_or(|page| sign_in.page == page);
        if let Some(sign_in) = running.take_if(started_there) {
            sign_in.cancel.cancel();
        }
    }
}

/// The compiled list, or an empty one if it can't be read: then the shell
/// sends and opens nothing, and the log says why.
pub(crate) fn compiled_routes() -> RouteList {
    RouteList::parse(ROUTES).unwrap_or_else(|problem| {
        halonic_shell_log::record("actions", format!("the route list is refused: {problem}"));
        RouteList::default()
    })
}

/// Why a command couldn't run: a stable `kind` and a message for the log.
/// Neither holds a token.
#[derive(Debug, Serialize)]
pub struct ActionCommandRefusal {
    kind: &'static str,
    message: String,
}

impl From<SecretError> for ActionCommandRefusal {
    fn from(error: SecretError) -> Self {
        Self {
            kind: error.kind(),
            message: error.to_string(),
        }
    }
}

fn unknown_service() -> ActionCommandRefusal {
    ActionCommandRefusal {
        kind: "unknown_service",
        message: "the shell has no sign-in for that service".to_owned(),
    }
}

/// What opening a page did: `ActionOpenResult` in `@halonicjs/ports`, plus
/// `not-opened` when the checks passed but the browser didn't open it.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub enum OpenResult {
    Opened,
    Refused { reason: Refusal },
    NotOpened,
}

fn log(line: String) {
    halonic_shell_log::record("actions", line);
}

fn keychain<R: Runtime>(app: &AppHandle<R>) -> ShellKeychain {
    ShellKeychain {
        backend: app.state::<SecretsState>().action_keychain(),
    }
}

/// Sends one reviewed call step with the user's token, or runs one
/// reviewed operation step with its own code, or refuses it.
#[tauri::command]
pub async fn action_send<R: Runtime>(app: AppHandle<R>, request: SendRequest) -> SendResult {
    let state = app.state::<ActionState>();
    match operation_step(&state.routes.operations, &request) {
        Some(Ok((route, values))) => return paperclip::run_operation(&app, route, values).await,
        Some(Err(reason)) => {
            log(format!(
                "action_send {}@{} step {}: refused ({reason:?})",
                request.definition, request.version, request.step
            ));
            return SendResult::Refused { reason };
        }
        None => {}
    }
    let transport = ShellTransport {
        proxy: app.state::<HttpFetchState>().proxy(),
    };
    let dialogs = ShellDialogs { app: app.clone() };
    let tokens = keychain(&app);
    let sender = Sender {
        routes: &state.routes,
        transport: &transport,
        tokens: &tokens,
        dialogs: &dialogs,
        log: &log,
    };
    sender.send(&request).await
}

/// Signs the user in to the service with its device flow, sending the code
/// to the stepper over `code`. Runs until it is signed in, the user turns
/// it down, or the stepper or its window closes. A new sign-in cancels the
/// one before it.
#[tauri::command]
pub async fn action_sign_in<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    service: String,
    code: Channel<UserCode>,
) -> Result<SignInResult, ActionCommandRefusal> {
    if service != GITHUB.name {
        return Ok(SignInResult::NotAvailable);
    }
    let state = app.state::<ActionState>();
    if !state
        .limiter
        .allow(halonic_action_send::DEVICE_PAGE, state.now_ms())
    {
        return Err(ActionCommandRefusal {
            kind: "too-often",
            message: "a sign-in page opened a moment ago".to_owned(),
        });
    }
    let Some(client_id) = github_client_id(&app).await else {
        return Ok(SignInResult::NotAvailable);
    };
    let cancel = Arc::new(SignInCancel::default());
    state.cancel_sign_in(None);
    *state.sign_in.lock().unwrap_or_else(PoisonError::into_inner) = Some(RunningSignIn {
        page: webview.label().to_owned(),
        cancel: Arc::clone(&cancel),
    });
    let transport = ShellTransport {
        proxy: app.state::<HttpFetchState>().proxy(),
    };
    let flow = DeviceFlow {
        client_id: &client_id,
        transport: &transport,
        keychain: &keychain(&app),
        clock: &ShellClock {
            cancel: Arc::clone(&cancel),
        },
        screen: &ShellCodeScreen {
            app: app.clone(),
            channel: code,
        },
        cancel: &cancel,
        log: &log,
    };
    let result = flow.sign_in().await;
    // Forget it, unless a newer sign-in has taken its place.
    let mut running = state.sign_in.lock().unwrap_or_else(PoisonError::into_inner);
    if running
        .as_ref()
        .is_some_and(|sign_in| Arc::ptr_eq(&sign_in.cancel, &cancel))
    {
        *running = None;
    }
    Ok(result)
}

/// The GitHub App's client id from the host settings, read off the UI
/// thread; `None` when none is set, it isn't one, or the settings can't be
/// read, which goes to the log.
async fn github_client_id<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let app = app.clone();
    let saved = tauri::async_runtime::spawn_blocking(move || {
        crate::host_settings::saved_value(&app, GITHUB_CLIENT_ID_SETTING)
    })
    .await;
    let value = match saved {
        Ok(Ok(value)) => value,
        Ok(Err(refusal)) => {
            log(format!(
                "action_sign_in: the host settings can't be read: {refusal:?}"
            ));
            None
        }
        Err(error) => {
            log(format!(
                "action_sign_in: the host settings can't be read: {error}"
            ));
            None
        }
    };
    value
        .and_then(|value| value.as_str().map(str::to_owned))
        .filter(|client_id| is_client_id(client_id))
}

/// Cancels the sign-in this page started. Nothing it hasn't stored yet is
/// kept.
#[tauri::command]
pub fn action_sign_in_cancel<R: Runtime>(app: AppHandle<R>, webview: Webview<R>) {
    app.state::<ActionState>()
        .cancel_sign_in(Some(webview.label()));
}

/// Cancels the sign-in a page started when it reloads or closes, so no
/// sign-in waits in the background (note, 6.7).
pub fn end_page<R: Runtime>(app: &AppHandle<R>, page: &str) {
    if let Some(state) = app.try_state::<ActionState>() {
        state.cancel_sign_in(Some(page));
        paperclip::end_page(app);
    }
}

/// Forgets the service's token and account. Does nothing when nobody is
/// signed in.
#[tauri::command]
pub async fn action_sign_out<R: Runtime>(
    app: AppHandle<R>,
    service: String,
) -> Result<(), ActionCommandRefusal> {
    if service == PAPERCLIP {
        return paperclip::sign_out(&app).await;
    }
    let service = known_service(&service)?;
    keychain(&app)
        .on_worker(move |backend| account::sign_out(backend, service))
        .await
        .map_err(|error| {
            log(error.log_message("action_sign_out"));
            error.into()
        })
}

/// The account signed in to the service, or `null`. Never a token.
#[tauri::command]
pub async fn action_account<R: Runtime>(
    app: AppHandle<R>,
    service: String,
) -> Result<Option<Account>, ActionCommandRefusal> {
    if service == PAPERCLIP {
        return paperclip::account(&app).await;
    }
    let service = known_service(&service)?;
    keychain(&app)
        .on_worker(move |backend| account::signed_in(backend, service, now_seconds()))
        .await
        .map_err(|error| {
            log(error.log_message("action_account"));
            error.into()
        })
}

fn known_service(name: &str) -> Result<&'static str, ActionCommandRefusal> {
    service(name)
        .map(|known| known.name)
        .ok_or_else(unknown_service)
}

/// Opens a reviewed guided step's page in the user's browser, or refuses it.
#[tauri::command]
pub fn action_open_guided<R: Runtime>(app: AppHandle<R>, request: StepRef) -> OpenResult {
    let state = app.state::<ActionState>();
    match open_guided(&state.routes, &state.limiter, &request, state.now_ms()) {
        Ok(page) => open(&app, &page),
        Err(reason) => OpenResult::Refused { reason },
    }
}

/// Opens a `browser` block's address in the user's browser, if the route
/// list's web origins allow it, or refuses it.
#[tauri::command]
pub fn action_open_page<R: Runtime>(app: AppHandle<R>, url: String) -> OpenResult {
    let state = app.state::<ActionState>();
    match open_page(&state.routes, &state.limiter, &url, state.now_ms()) {
        Ok(page) => open(&app, &page),
        Err((reason, why)) => {
            if let Some(why) = why {
                log(format!("action_open_page: refused ({why})"));
            }
            OpenResult::Refused { reason }
        }
    }
}

fn open<R: Runtime>(app: &AppHandle<R>, page: &Url) -> OpenResult {
    match app.opener().open_url(page.as_str(), None::<&str>) {
        Ok(()) => OpenResult::Opened,
        Err(error) => {
            log(format!("the browser didn't open a stepper's page: {error}"));
            OpenResult::NotOpened
        }
    }
}

#[path = "action_paperclip.rs"]
pub mod paperclip;

#[path = "action_records.rs"]
pub mod records;

#[cfg(test)]
#[path = "actions_tests.rs"]
mod tests;
