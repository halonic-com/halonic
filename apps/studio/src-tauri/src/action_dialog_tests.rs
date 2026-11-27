//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The dialog's window takes one answer for the dialog it shows: the form
//! read against that dialog's sheet, or Cancel. One dialog at a time
//! (HAL-18085). The navigation guard keeps its window on its own page, and
//! it opens over the app window the user just used.

use halonic_action_send::{AskSheet, ConfirmSheet};
use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, Url, WebviewUrl};

use super::{DialogState, WINDOW};
use crate::focused_apps::FocusedApp;
use crate::native_dialogs;

/// The page's own origin: Windows' webview serves a custom scheme over
/// `http`.
const BASE: &str = if cfg!(windows) {
    "http://halonic-action.localhost"
} else {
    "halonic-action://localhost"
};

fn shell_app() -> App<MockRuntime> {
    crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime")
}

fn sheet() -> AskSheet {
    AskSheet {
        confirm: ConfirmSheet {
            account: "acme-admin".to_owned(),
            method: "DELETE",
            address: "https://api.github.com/repos/acme/app".to_owned(),
            fields: Vec::new(),
        },
        target: Some("acme/app".to_owned()),
        secrets: vec!["value".to_owned()],
    }
}

#[test]
fn the_sent_form_answers_the_open_dialog_and_is_zeroed() {
    let state = DialogState::default();
    let (_, answered) = state.begin(sheet()).expect("a dialog opens");
    let mut body = b"target=acme%2Fapp&secret-0=acme-value".to_vec();
    state.answer_form(&mut body);
    assert!(body.iter().all(|byte| *byte == 0));
    let typed = answered.recv().expect("an answer").expect("what was typed");
    assert_eq!(
        typed.target.map(|name| name.as_str().to_owned()),
        Some("acme/app".to_owned())
    );
    assert_eq!(typed.secrets[0].1.as_str(), "acme-value");
    // A second form or a Cancel after it changes nothing.
    state.answer(None, None);
    assert!(answered.try_recv().is_err());
}

#[test]
fn cancel_and_a_bad_form_answer_none() {
    let state = DialogState::default();
    let (id, answered) = state.begin(sheet()).expect("a dialog opens");
    let mut body = b"target=acme%2Fapp".to_vec();
    state.answer_form(&mut body);
    assert!(body.iter().all(|byte| *byte == 0));
    assert!(answered.recv().expect("an answer").is_none());
    state.end(id);
    let (id, answered) = state.begin(sheet()).expect("a new dialog opens");
    state.answer(Some(id), None);
    assert!(answered.recv().expect("an answer").is_none());
    state.end(id);
}

#[test]
fn one_dialog_at_a_time_and_its_page_only_while_open() {
    let state = DialogState::default();
    assert!(state.page().is_none());
    let (id, _answered) = state.begin(sheet()).expect("a dialog opens");
    assert!(
        state.begin(sheet()).is_none(),
        "a second dialog waits for none"
    );
    let page = state.page().expect("the open dialog's page");
    assert!(page.contains("acme/app"));
    // Another dialog's close leaves this one open.
    state.end(id + 1);
    assert!(state.page().is_some());
    state.end(id);
    assert!(state.page().is_none());
    let mut body = b"target=acme%2Fapp&secret-0=x".to_vec();
    state.answer_form(&mut body);
    assert!(
        body.iter().all(|byte| *byte == 0),
        "zeroed with no dialog open"
    );
}

#[test]
fn the_navigation_guard_keeps_the_dialogs_window_on_its_page() {
    let app = shell_app();
    let window = WebviewWindowBuilder::new(&app, WINDOW, WebviewUrl::default())
        .build()
        .expect("the dialog's window opens");
    let (_, answered) = app
        .state::<DialogState>()
        .begin(sheet())
        .expect("a dialog opens");
    let decide = |url: &str| {
        let url = Url::parse(url).expect("a test URL");
        crate::navigation::on_navigation(window.as_ref(), &url)
    };
    assert!(decide(&format!("{BASE}/")), "its page loads");
    assert!(decide(&format!("{BASE}/send")), "its form is sent");
    for elsewhere in [
        "https://acme.example/",
        "tauri://localhost/studio.html",
        "halonic-action://acme.example/",
    ] {
        assert!(!decide(elsewhere), "{elsewhere}");
    }
    assert!(
        answered.try_recv().is_err(),
        "a refused page answers nothing"
    );
    assert!(!decide(&format!("{BASE}/cancel")), "Cancel doesn't load");
    assert!(answered.recv().expect("an answer").is_none());
}

/// `open_window` takes `native_dialogs::dialog_parent` as its parent. The
/// mock runtime has no GTK window to make a parent of, so this checks the
/// choice: the Inbox the user sent from, with Studio's window closed, and
/// never the dialog's own window.
#[test]
fn the_dialog_opens_over_the_inbox_while_only_it_is_open() {
    let app = shell_app();
    for label in [FocusedApp::Inbox.name(), WINDOW] {
        WebviewWindowBuilder::new(&app, label, WebviewUrl::default())
            .build()
            .expect("the window opens");
    }
    let parent = native_dialogs::dialog_parent(app.handle()).expect("a parent");
    assert_eq!(parent.label(), FocusedApp::Inbox.name());
}
