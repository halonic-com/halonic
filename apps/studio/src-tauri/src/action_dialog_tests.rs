//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The dialog's window takes one answer for the dialog it shows: the form
//! read against that dialog's sheet, or Cancel. One dialog at a time
//! (HAL-18085).

use halonic_action_send::{AskSheet, ConfirmSheet};

use super::DialogState;

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
