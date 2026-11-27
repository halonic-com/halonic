//! What the `action_*` commands give `halonic-action-send`: the network
//! (reqwest, following no redirect), the OS keychain on a worker thread,
//! the native confirmation and the dialog with text fields (`dialog`), the
//! clock, and the stepper that shows a sign-in's code. The crate decides
//! what is sent; this file only carries it out.

use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use halonic_action_send::account::{self, Account};
use halonic_action_send::{
    Answer, AskSheet, Clock, CodeScreen, ConfirmSheet, Dialogs, Keychain, Outgoing, SignInCancel,
    Tokens, Transport, Typed, UserCode,
};
use halonic_http_guard::{ProxySetting, Route, route_for};
use halonic_secrets::{SecretBackend, SecretError};
use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::native_dialogs;

/// The dialog with text fields, in a window of its own (HAL-18085).
#[path = "action_dialog.rs"]
pub mod dialog;

/// The longest a call may take, from connecting to the last byte.
const CALL_TIMEOUT: Duration = Duration::from_secs(30);

/// The most of an answer's body the shell reads. Only a few fields of it
/// are ever kept.
const MAX_ANSWER_BYTES: usize = 1024 * 1024;

/// How often a paused sign-in looks whether it was cancelled.
const CANCEL_CHECK: Duration = Duration::from_millis(250);

/// Seconds since 1970.
pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

/// The network: reqwest with redirects off, `https` only, through the proxy
/// the person set (HAL-12966), as `http_fetch` does.
pub struct ShellTransport {
    pub proxy: Arc<ProxySetting>,
}

impl Transport for ShellTransport {
    fn send(&self, call: Outgoing) -> impl Future<Output = Result<Answer, String>> + Send {
        let proxy = Arc::clone(&self.proxy);
        async move { send_call(call, &proxy).await }
    }
}

/// The client every stepper call and sign-in goes through. It follows no
/// redirect, to any host: a `3xx` comes back as it is, so the token's
/// header never goes anywhere else.
pub fn action_client() -> reqwest::ClientBuilder {
    // reqwest is built without a crypto provider, and only the updater
    // installs one; a stepper call can come first.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        // An error here only means another thread installed a provider
        // between the check and this call, and any provider will do: the
        // updater installs this same one.
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(CALL_TIMEOUT)
}

async fn send_call(call: Outgoing, proxy: &ProxySetting) -> Result<Answer, String> {
    let builder = action_client().https_only(true);
    let builder = match route_for(&call.address, proxy).map_err(|refusal| refusal.to_string())? {
        Route::Direct => builder.no_proxy(),
        Route::Tunnel(endpoint) => {
            let tunnel = reqwest::Proxy::https(endpoint.url())
                .map_err(|_| "the proxy setting couldn't be used".to_owned())?;
            builder.proxy(match endpoint.credentials() {
                Some((username, password)) => tunnel.basic_auth(username, password),
                None => tunnel,
            })
        }
    };
    let client = builder
        .build()
        .map_err(|_| "the HTTP client couldn't be made".to_owned())?;
    send_with(&client, call).await
}

/// Sends one call with `client` and reads its answer, at most
/// [`MAX_ANSWER_BYTES`] of it. The call is dropped, and so its token and
/// device code wiped, as soon as the request has gone.
pub async fn send_with(client: &reqwest::Client, call: Outgoing) -> Result<Answer, String> {
    let method = reqwest::Method::from_bytes(call.method.as_bytes())
        .map_err(|_| "not a method".to_owned())?;
    let mut request = client.request(method, call.address.clone());
    for (name, value) in &call.headers {
        request = request.header(name, value);
    }
    // reqwest gets its own copy of the body, as of each header, which this
    // shell can't wipe; the call keeps the one it can.
    if let Some(body) = &call.body {
        request = request.body(body.clone());
    }
    let sent = request.send().await;
    drop(call);
    // reqwest's error names the address, never the headers.
    let mut response = sent.map_err(|error| error.without_url().to_string())?;
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let mut answer = Answer {
        status: response.status().as_u16(),
        content_type: header("content-type"),
        accepted_permissions: header("x-accepted-github-permissions"),
        body: Vec::new(),
    };
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| error.without_url().to_string())?
    {
        if answer.body.len() + chunk.len() > MAX_ANSWER_BYTES {
            return Err("the answer was too large".to_owned());
        }
        answer.body.extend_from_slice(&chunk);
    }
    Ok(answer)
}

/// The OS keychain, called on a worker thread: it may ask the user to
/// unlock it, and that must not hold up the UI.
pub struct ShellKeychain {
    pub backend: Arc<dyn SecretBackend>,
}

impl ShellKeychain {
    /// Runs one keychain call on a worker thread.
    pub async fn on_worker<T, F>(&self, call: F) -> Result<T, SecretError>
    where
        T: Send + 'static,
        F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
    {
        let backend = Arc::clone(&self.backend);
        tauri::async_runtime::spawn_blocking(move || call(backend.as_ref()))
            .await
            .unwrap_or_else(|error| {
                Err(SecretError::Backend {
                    message: error.to_string(),
                })
            })
    }
}

impl Tokens for ShellKeychain {
    fn token(
        &self,
        service: &str,
    ) -> impl Future<Output = Result<Option<(Account, String)>, SecretError>> + Send {
        let service = service.to_owned();
        self.on_worker(move |backend| account::token(backend, &service, now_seconds()))
    }
}

impl Keychain for ShellKeychain {
    fn with_backend<T, F>(&self, call: F) -> impl Future<Output = Result<T, SecretError>> + Send
    where
        T: Send + 'static,
        F: FnOnce(&dyn SecretBackend) -> Result<T, SecretError> + Send + 'static,
    {
        self.on_worker(call)
    }
}

/// The native confirmation and the dialog with text fields, which the page
/// can't draw or click.
pub struct ShellDialogs<R: Runtime> {
    pub app: AppHandle<R>,
}

impl<R: Runtime> Dialogs for ShellDialogs<R> {
    fn confirm(&self, sheet: &ConfirmSheet) -> impl Future<Output = bool> + Send {
        let app = self.app.clone();
        let sheet = sheet.clone();
        async move {
            tauri::async_runtime::spawn_blocking(move || {
                native_dialogs::ask_to_send_step(&app, &step_question(&sheet))
            })
            .await
            .unwrap_or(false)
        }
    }

    fn ask(&self, sheet: &AskSheet) -> impl Future<Output = Option<Typed>> + Send {
        let app = self.app.clone();
        let sheet = sheet.clone();
        async move {
            tauri::async_runtime::spawn_blocking(move || dialog::ask(&app, sheet))
                .await
                .unwrap_or(None)
        }
    }
}

/// The confirmation's text: the account, then the method and address the
/// shell built, then each body field and its value as JSON.
pub fn step_question(sheet: &ConfirmSheet) -> String {
    let mut question = format!(
        "As {}:\n\n{} {}\n",
        sheet.account, sheet.method, sheet.address
    );
    for (name, value) in &sheet.fields {
        question.push_str(&format!("\n{name}: {value}"));
    }
    question.push_str("\n\nSend only if you just pressed Run in Halonic.");
    question
}

/// The wall clock. A pause ends early when the sign-in is cancelled, so
/// closing the stepper stops the poll at once.
pub struct ShellClock {
    pub cancel: Arc<SignInCancel>,
}

impl Clock for ShellClock {
    fn now(&self) -> u64 {
        now_seconds()
    }

    fn pause(&self, seconds: u64) -> impl Future<Output = ()> + Send {
        let cancel = Arc::clone(&self.cancel);
        let until = tokio::time::Instant::now() + Duration::from_secs(seconds);
        async move {
            while !cancel.is_cancelled() && tokio::time::Instant::now() < until {
                tokio::time::sleep(CANCEL_CHECK).await;
            }
        }
    }
}

/// The stepper that started the sign-in: it gets the code over its
/// channel, and GitHub's sign-in page opens in the user's browser.
pub struct ShellCodeScreen<R: Runtime> {
    pub app: AppHandle<R>,
    pub channel: Channel<UserCode>,
}

impl<R: Runtime> CodeScreen for ShellCodeScreen<R> {
    fn show(&self, code: &UserCode) {
        // A page that has gone can't take the code; its sign-in is
        // cancelled when it goes, so nothing waits on it.
        if let Err(error) = self.channel.send(code.clone()) {
            halonic_shell_log::record("actions", format!("action_sign_in: {error}"));
        }
        if let Err(error) = self.app.opener().open_url(code.page, None::<&str>) {
            halonic_shell_log::record("actions", format!("action_sign_in: {error}"));
        }
    }
}

#[cfg(test)]
#[path = "action_parts_tests.rs"]
mod tests;
