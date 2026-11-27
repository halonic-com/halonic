//! The window of the shell's dialog with text fields (HAL-18085): an
//! `irreversible` step's "type the target's name" and a `secret-input`
//! step's masked fields. rfd's dialogs have no text field, so it is a
//! second window, as the server-session brief's is (HAL-18014).
//!
//! Its page is the fixed one `halonic_action_send::ask_page` writes, served
//! from its own scheme to this window only. No capability names the window,
//! so its page can call no command, and the page has no script: its content
//! security policy allows none. Send posts the form to the same scheme, so
//! what the user typed reaches [`serve`] in the request's body, never in an
//! address or the Studio page; Cancel is a link the shell catches, and
//! closing the window answers Cancel too.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Mutex, PoisonError};

pub use halonic_action_send::ask_page::WINDOW;
use halonic_action_send::ask_page::{
    self, AskNavigation, OPEN_URL, PAGE_PATH, SCHEME, SEND_PATH, SENT_PAGE,
};
use halonic_action_send::{AskSheet, Typed};
use tauri::http::{Method, Request, Response, StatusCode, header};
use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Builder, Manager, Runtime, Url, Webview, WebviewUrl, WindowEvent};

use crate::native_dialogs;

/// The dialog the window shows now, and who waits for the user's answer.
struct OpenDialog {
    id: u64,
    sheet: AskSheet,
    answer: Option<Sender<Option<Typed>>>,
}

/// The one dialog with text fields that may be open at a time.
#[derive(Default)]
pub struct DialogState {
    open: Mutex<Option<OpenDialog>>,
    next_id: Mutex<u64>,
}

impl DialogState {
    /// Holds `sheet` for the window; `None` while another dialog is open.
    fn begin(&self, sheet: AskSheet) -> Option<(u64, Receiver<Option<Typed>>)> {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        if open.is_some() {
            return None;
        }
        let mut next_id = self.next_id.lock().unwrap_or_else(PoisonError::into_inner);
        *next_id += 1;
        let (answer, answered) = channel();
        *open = Some(OpenDialog {
            id: *next_id,
            sheet,
            answer: Some(answer),
        });
        Some((*next_id, answered))
    }

    /// Gives the first answer for dialog `id`, or for the open dialog when
    /// `id` is `None`; later answers are dropped, which wipes them.
    fn answer(&self, id: Option<u64>, typed: Option<Typed>) {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(dialog) = open
            .as_mut()
            .filter(|dialog| id.is_none_or(|id| dialog.id == id))
        else {
            return;
        };
        if let Some(answer) = dialog.answer.take() {
            // The receiver is gone only once `ask` has stopped waiting.
            let _ = answer.send(typed);
        }
    }

    /// Reads the sent form against the open dialog's sheet and answers that
    /// same dialog with it, under one lock. The body is zeroed either way.
    fn answer_form(&self, body: &mut [u8]) {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(dialog) = open.as_mut()
            && let Some(answer) = dialog.answer.take()
        {
            let typed = ask_page::read_form(&dialog.sheet, body);
            // The receiver is gone only once `ask` has stopped waiting.
            let _ = answer.send(typed);
        }
        body.fill(0);
    }

    /// Forgets dialog `id`, so its page is served no more.
    fn end(&self, id: u64) {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        if open.as_ref().is_some_and(|dialog| dialog.id == id) {
            *open = None;
        }
    }

    fn page(&self) -> Option<String> {
        let open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        open.as_ref()
            .map(|dialog| ask_page::ask_page(&dialog.sheet))
    }
}

/// Adds the dialog's state and its scheme, served to its window only.
pub fn register<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .manage(DialogState::default())
        .register_uri_scheme_protocol(SCHEME, |context, request| {
            serve(context.app_handle(), context.webview_label(), request)
        })
}

/// Shows `sheet` in the dialog's window and waits; what the user typed
/// only when they press Send. Closing the window, a window that can't open,
/// or a dialog already open answers `None`, which sends nothing.
pub fn ask<R: Runtime>(app: &AppHandle<R>, sheet: AskSheet) -> Option<Typed> {
    let state = app.state::<DialogState>();
    let Some((id, answered)) = state.begin(sheet) else {
        log("a dialog with text fields is already open".to_owned());
        return None;
    };
    let typed = match open_window(app, id) {
        Ok(()) => answered.recv().unwrap_or(None),
        Err(error) => {
            log(format!("the dialog's window: {error}"));
            None
        }
    };
    state.end(id);
    if let Some(window) = app.get_webview_window(WINDOW)
        && let Err(error) = window.destroy()
    {
        log(format!("the dialog's window stays: {error}"));
    }
    typed
}

fn log(line: String) {
    halonic_shell_log::record("actions", line);
}

/// Opens the dialog's window over [`native_dialogs::dialog_parent`], the
/// app window the user just used, as the other dialogs do (HAL-17915), so a
/// send from the Inbox doesn't ask behind a minimised Studio. Closing it
/// answers Cancel.
fn open_window<R: Runtime>(app: &AppHandle<R>, id: u64) -> tauri::Result<()> {
    let page = Url::parse(OPEN_URL).map_err(tauri::Error::InvalidUrl)?;
    let mut builder = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::CustomProtocol(page))
        .title("Send this request?")
        .inner_size(520.0, 460.0)
        .min_inner_size(400.0, 320.0)
        .center()
        .minimizable(false)
        .focused(true);
    if let Some(parent) = native_dialogs::dialog_parent(app) {
        builder = builder.parent(&parent)?;
    }
    let window = builder.build()?;
    let shell = app.clone();
    window.on_window_event(move |event| window_event(&shell, id, event));
    Ok(())
}

/// Closing dialog `id`'s window answers Cancel.
fn window_event<R: Runtime>(app: &AppHandle<R>, id: u64, event: &WindowEvent) {
    if matches!(
        event,
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
    ) {
        app.state::<DialogState>().answer(Some(id), None);
    }
}

/// The navigation guard's decision for the dialog's window: true lets the
/// page load, or the form go to [`serve`]. Cancel answers and closes it.
pub fn on_navigation<R: Runtime>(webview: &Webview<R>, url: &Url) -> bool {
    match ask_page::ask_navigation(url.as_str()) {
        AskNavigation::Load | AskNavigation::Send => true,
        AskNavigation::Cancel => {
            webview.state::<DialogState>().answer(None, None);
            false
        }
        AskNavigation::Refuse => false,
    }
}

/// The guard's check of a page that loaded in the dialog's window: anything
/// but its own page answers Cancel.
pub fn on_page_load<R: Runtime>(webview: &Webview<R>, url: &Url) {
    let navigation = ask_page::ask_navigation(url.as_str());
    if !matches!(navigation, AskNavigation::Load | AskNavigation::Send) {
        webview.state::<DialogState>().answer(None, None);
    }
}

/// Serves the open dialog's page to the dialog's window, and reads its sent
/// form; nothing to any other window, method or path.
pub fn serve<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    mut request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let state = app.state::<DialogState>();
    let is_post = request.method() == Method::POST;
    let path = request.uri().path().to_owned();
    let page = match (label == WINDOW, path.as_str(), is_post) {
        (true, PAGE_PATH, false) => state.page(),
        (true, SEND_PATH, true) => {
            state.answer_form(request.body_mut());
            Some(SENT_PAGE.to_owned())
        }
        _ => None,
    };
    request.body_mut().fill(0);
    let Some(page) = page else {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap_or_default();
    };
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, ask_page::page_policy())
        .header(header::CACHE_CONTROL, "no-store")
        .body(page.into_bytes())
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "action_dialog_tests.rs"]
mod tests;
