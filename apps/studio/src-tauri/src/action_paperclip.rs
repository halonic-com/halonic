//! The Paperclip admin key of rows C1 and C5 in the shell (HAL-20275;
//! architecture note on HAL-17491, 6.8, condition 3; plan OK on HAL-21110).
//! Its sign-in runs only while a stepper's page is open and only when the
//! route list has a Paperclip operation for it; the page closing or
//! reloading cancels it and signs the key out, revoking it in Paperclip.
//! An operation step goes to the operation's own code in
//! `halonic-action-send`, never to the route list's calls. The key and the
//! value the user types never reach the page.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, PoisonError};

use halonic_action_send::account::Account;
use halonic_action_send::ask_page::WINDOW as ACTION_DIALOG;
use halonic_action_send::paperclip_admin::admin_session;
use halonic_action_send::{
    ApprovalScreen, Operation, OperationRoute, PAPERCLIP, PaperclipSignIn, Refusal, SendResult,
    SetSecret, SetSecretStep, SignInCancel, SignInResult,
};
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use super::{ActionCommandRefusal, ActionState, RunningSignIn, keychain, log};
use crate::action_parts::{PaperclipTransport, ShellClock, ShellDialogs, now_seconds};
use crate::http_fetch::HttpFetchState;

/// The open limit's name for the admin sign-in's approval page: one page
/// per click, as for GitHub's device page.
const APPROVAL_PAGE: &str = "paperclip:admin-sign-in";

/// Whose page ending signs the admin key out.
enum KeyPage {
    /// The shell just started: a key a quit left behind is still stored.
    LeftOver,
    /// No page signed in since the last sign-out.
    Nobody,
    /// The page that signed in last.
    SignedIn(String),
}

/// Which page's end signs the admin key out: the page that signed in, or,
/// at the first page end after the shell starts, a key the last quit left
/// behind. Never the value dialog's window: set-secret opens it while the
/// key is in use (Julian's review of #6946).
pub(super) struct AdminKeyPage(Mutex<KeyPage>);

impl Default for AdminKeyPage {
    fn default() -> Self {
        Self(Mutex::new(KeyPage::LeftOver))
    }
}

impl AdminKeyPage {
    /// `page` started a sign-in; its end signs the new key out.
    pub(super) fn signed_in(&self, page: &str) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = KeyPage::SignedIn(page.to_owned());
    }

    /// Whether `page` ending signs the key out. When it does, no other
    /// page's end signs it out again until the next sign-in.
    pub(super) fn ends_with(&self, page: &str) -> bool {
        if page == ACTION_DIALOG {
            return false;
        }
        let mut held = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let ends = match &*held {
            KeyPage::LeftOver => true,
            KeyPage::Nobody => false,
            KeyPage::SignedIn(signed_in) => signed_in == page,
        };
        if ends {
            *held = KeyPage::Nobody;
        }
        ends
    }
}

/// Opens Paperclip's approval page in the user's browser.
struct ShellBrowser<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> ApprovalScreen for ShellBrowser<R> {
    fn show(&self, page: &Url) {
        // Not the opener's error: on macOS and Linux it holds the launcher's
        // command line, so the address with its challenge token.
        if self
            .app
            .opener()
            .open_url(page.as_str(), None::<&str>)
            .is_err()
        {
            log("the browser didn't open Paperclip's approval page".to_owned());
        }
    }
}

fn transport<R: Runtime>(app: &AppHandle<R>) -> PaperclipTransport {
    PaperclipTransport {
        proxy: app.state::<HttpFetchState>().proxy(),
    }
}

/// Signs the user in for the admin key of the Paperclip connection
/// `connection`, through Paperclip's own approval page. Runs until a board
/// member approves it, it is turned down, or the stepper or its window
/// closes. Answers `not-available` when the route list has no Paperclip
/// operation, so no page can start it for anything else. A new sign-in
/// cancels the one before it.
#[tauri::command]
pub async fn action_paperclip_sign_in<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    connection: String,
) -> Result<SignInResult, ActionCommandRefusal> {
    let state = app.state::<ActionState>();
    if !state.paperclip_listed() {
        return Ok(SignInResult::NotAvailable);
    }
    if !state.limiter.allow(APPROVAL_PAGE, state.now_ms()) {
        return Err(ActionCommandRefusal {
            kind: "too-often",
            message: "a sign-in page opened a moment ago".to_owned(),
        });
    }
    let cancel = Arc::new(SignInCancel::default());
    state.cancel_sign_in(None);
    state.admin_page.signed_in(webview.label());
    *state.sign_in.lock().unwrap_or_else(PoisonError::into_inner) = Some(RunningSignIn {
        page: webview.label().to_owned(),
        cancel: Arc::clone(&cancel),
    });
    let result = PaperclipSignIn {
        connection: &connection,
        transport: &transport(&app),
        keychain: &keychain(&app),
        clock: &ShellClock {
            cancel: Arc::clone(&cancel),
        },
        screen: &ShellBrowser { app: app.clone() },
        cancel: &cancel,
        log: &log,
    }
    .sign_in()
    .await;
    let mut running = state.sign_in.lock().unwrap_or_else(PoisonError::into_inner);
    if running
        .as_ref()
        .is_some_and(|sign_in| Arc::ptr_eq(&sign_in.cancel, &cancel))
    {
        *running = None;
    }
    Ok(result)
}

/// Revokes the admin key in Paperclip and forgets it. Does nothing when
/// there is none.
pub(super) async fn sign_out<R: Runtime>(app: &AppHandle<R>) -> Result<(), ActionCommandRefusal> {
    let cancel = Arc::new(SignInCancel::default());
    PaperclipSignIn {
        connection: "",
        transport: &transport(app),
        keychain: &keychain(app),
        clock: &ShellClock {
            cancel: Arc::clone(&cancel),
        },
        screen: &ShellBrowser { app: app.clone() },
        cancel: &cancel,
        log: &log,
    }
    .sign_out()
    .await
    .map_err(|error| {
        log(error.log_message("action_sign_out paperclip"));
        error.into()
    })
}

/// The board member the admin key was approved by, or `None`. Never the key.
pub(super) async fn account<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<Account>, ActionCommandRefusal> {
    let now = now_seconds();
    // Only the name leaves the worker: the key is dropped there.
    keychain(app)
        .on_worker(move |backend| Ok(admin_session(backend, now)?.map(|(_, user, _)| user)))
        .await
        .map(|user| {
            user.map(|name| Account {
                service: PAPERCLIP.to_owned(),
                name,
            })
        })
        .map_err(|error| {
            log(error.log_message("action_account paperclip"));
            error.into()
        })
}

/// Signs the admin key out when the page that signed in reloads or closes,
/// so it never outlives its stepper (note, 6.7); `AdminKeyPage` says when.
/// Off the UI thread: the keychain may ask to be unlocked. At quit nothing
/// waits for it, so a key can stay stored until the first page end of the
/// next start, which signs it out (`KeyPage::LeftOver`).
pub(super) fn end_page<R: Runtime>(app: &AppHandle<R>) {
    // An app without the keychain or the network has no admin key to end.
    let ready = app.try_state::<crate::secrets::SecretsState>().is_some()
        && app.try_state::<HttpFetchState>().is_some();
    if !ready {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if sign_out(&app).await.is_err() {
            log("the Paperclip admin key couldn't be signed out as its page closed".to_owned());
        }
    });
}

/// Runs an operation step whose placeholders passed their checks.
pub(super) async fn run_operation<R: Runtime>(
    app: &AppHandle<R>,
    route: &OperationRoute,
    values: &BTreeMap<String, String>,
) -> SendResult {
    match route.operation {
        Operation::PaperclipSetSecret => {
            let value = |name: &str| values.get(name).map(String::as_str);
            let (Some(name), Some(host), Some(company)) =
                (value("name"), value("host"), value("company"))
            else {
                return SendResult::Refused {
                    reason: Refusal::BadValue,
                };
            };
            let cancel = Arc::new(SignInCancel::default());
            SetSecret {
                transport: &transport(app),
                keychain: &keychain(app),
                clock: &ShellClock { cancel },
                dialogs: &ShellDialogs { app: app.clone() },
                log: &log,
            }
            .run(SetSecretStep {
                name,
                host,
                company,
            })
            .await
        }
    }
}
