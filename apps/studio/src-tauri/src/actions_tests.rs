//! Requirement `action-commands`: the compiled route list, the native
//! confirmation's text and the running sign-in, without a keychain or the
//! network.

use std::sync::{Arc, mpsc};
use std::thread;
use std::time::Duration;

use halonic_action_send::{ConfirmSheet, SignInCancel};

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
    // The sign-in's store, with a keychain that blocks until released.
    let write = thread::spawn(move || {
        cancel.unless_cancelled(|| {
            writing.send(()).expect("the test waits");
            released.recv().expect("the test releases it");
        })
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
    // The write that was under way finishes; none starts after the cancel.
    assert!(write.join().expect("the write ran").is_some());
}
