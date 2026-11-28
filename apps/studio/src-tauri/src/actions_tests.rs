//! Requirement `action-commands`: the compiled route list, the native
//! confirmation's text and the running sign-in, without a keychain or the
//! network.

use std::sync::{Arc, mpsc};
use std::thread;
use std::time::Duration;

use halonic_action_send::ask_page::WINDOW as ACTION_DIALOG;
use halonic_action_send::{ConfirmSheet, RouteList, SignInCancel};

use super::{ActionState, RunningSignIn, compiled_routes};
use crate::action_parts::step_question;

#[test]
fn the_compiled_route_list_loads() {
    // An unreadable list would leave the shell sending nothing, silently
    // to the page; the build must not ship one.
    let parsed = halonic_action_send::RouteList::parse(super::ROUTES).expect("the list loads");
    let compiled = compiled_routes();
    assert_eq!(compiled.calls.len(), parsed.calls.len());
    assert_eq!(compiled.guided.len(), parsed.guided.len());
}

#[test]
fn the_confirmation_shows_what_the_shell_will_send() {
    let sheet = ConfirmSheet {
        account: "acme-admin".to_owned(),
        method: "PUT",
        address: "https://api.github.com/repos/acme/app/environments/release".to_owned(),
        fields: vec![("wait_timer".to_owned(), "30".to_owned())],
    };
    assert_eq!(
        step_question(&sheet),
        "As acme-admin:\n\n\
         PUT https://api.github.com/repos/acme/app/environments/release\n\n\
         wait_timer: 30\n\n\
         Send only if you just pressed Run in Halonic."
    );
}

fn running(state: &ActionState, page: &str) -> Arc<SignInCancel> {
    let cancel = Arc::new(SignInCancel::default());
    *state.sign_in.lock().expect("not poisoned") = Some(RunningSignIn {
        page: page.to_owned(),
        cancel: Arc::clone(&cancel),
    });
    cancel
}

#[test]
fn only_the_page_that_started_a_sign_in_cancels_it() {
    let state = ActionState::default();
    let cancel = running(&state, "main");
    state.cancel_sign_in(Some("inbox"));
    assert!(!cancel.is_cancelled());
    state.cancel_sign_in(Some("main"));
    assert!(cancel.is_cancelled());
    assert!(state.sign_in.lock().expect("not poisoned").is_none());
}

#[test]
fn a_new_sign_in_cancels_the_one_before_it() {
    let state = ActionState::default();
    let cancel = running(&state, "inbox");
    state.cancel_sign_in(None);
    assert!(cancel.is_cancelled());
}

#[test]
fn a_cancel_returns_while_a_keychain_write_holds_the_sign_in() {
    // Liam's review of HAL-18084: `action_sign_in_cancel` and `end_page`
    // run on the UI thread, so a cancel that waited for an unlock prompt
    // would freeze the window.
    let state = Arc::new(ActionState::default());
    let cancel = running(&state, "main");
    let (writing, write_started) = mpsc::channel();
    let (release, released) = mpsc::channel::<()>();
    // The sign-in's store, with a keychain that blocks until released; it
    // then looks whether it was cancelled meanwhile, as the device flow does.
    let write = thread::spawn(move || {
        writing.send(()).expect("the test waits");
        released.recv().expect("the test releases it");
        cancel.is_cancelled()
    });
    write_started.recv().expect("the write started");
    let (cancelled, cancel_returned) = mpsc::channel();
    let cancelling = Arc::clone(&state);
    thread::spawn(move || {
        cancelling.cancel_sign_in(Some("main"));
        cancelled.send(()).expect("the test waits");
    });
    // Only a failing cancel takes this long: a passing one returns at once.
    cancel_returned
        .recv_timeout(Duration::from_secs(30))
        .expect("the cancel returned while the write was still held");
    assert!(!write.is_finished());
    assert!(state.sign_in.lock().expect("not poisoned").is_none());
    release.send(()).expect("the write waits");
    // Once through, the write sees the cancel; the device flow then takes
    // it back (`a_cancel_while_the_token_is_written_takes_it_back`).
    assert!(write.join().expect("the write ran"));
}

/// A route list with `paperclip.set-secret`, which compiled_routes doesn't
/// have yet.
fn with_set_secret() -> ActionState {
    let file = r#"{"format":"halonic.action-routes/1","webOrigins":[],"routes":[{
        "kind":"operation","definition":"paperclip.set-secret","version":1,"step":1,
        "service":"paperclip","risk":"admin",
        "placeholders":{"company":"^[A-Za-z0-9]{1,16}$","host":"^[a-z0-9.-]{1,253}$",
            "name":"^[A-Z][A-Z0-9_]{0,63}$"},
        "operation":"paperclip.set-secret",
        "body":[{"name":"value","kind":"secret-input"}],"keep":[]}]}"#;
    ActionState {
        routes: RouteList::parse(file).expect("the list loads"),
        ..ActionState::default()
    }
}

#[test]
fn the_value_dialog_opening_and_closing_keeps_the_admin_key() {
    // Julian's review of #6946: set-secret opens the dialog while the key
    // is in use, and every webview's page load and close reach `end_page`.
    let state = with_set_secret();
    state.admin_page.signed_in("main");
    assert!(!state.admin_key_ends_with(ACTION_DIALOG));
    assert!(!state.admin_key_ends_with(ACTION_DIALOG));
    assert!(!state.admin_key_ends_with("inbox"));
    assert!(state.admin_key_ends_with("main"));
}

#[test]
fn the_page_that_signed_in_signs_the_admin_key_out_once() {
    let state = with_set_secret();
    state.admin_page.signed_in("inbox");
    assert!(state.admin_key_ends_with("inbox"));
    assert!(!state.admin_key_ends_with("inbox"));
    state.admin_page.signed_in("main");
    assert!(!state.admin_key_ends_with("inbox"));
    assert!(state.admin_key_ends_with("main"));
}

#[test]
fn the_first_page_end_after_a_start_signs_out_a_key_the_quit_left() {
    let state = with_set_secret();
    assert!(!state.admin_key_ends_with(ACTION_DIALOG));
    assert!(state.admin_key_ends_with("main"));
    assert!(!state.admin_key_ends_with("main"));
}

#[test]
fn without_a_paperclip_operation_no_page_end_reads_the_keychain() {
    let state = ActionState {
        routes: RouteList::default(),
        ..ActionState::default()
    };
    assert!(!state.admin_key_ends_with("main"));
    state.admin_page.signed_in("main");
    assert!(!state.admin_key_ends_with("main"));
}
