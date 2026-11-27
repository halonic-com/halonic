//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The dialog with text fields (HAL-18085): a `secret-input` value goes
//! from the dialog into the call body and never into the result, a log line
//! or what the page is given; an `irreversible` step is sent only after the
//! typed name matches its target.

mod support;

use halonic_action_send::{Answer, Refusal, SendResult};
use serde_json::{Value, json};
use support::{FakeDialogs, FakeKeychain, FakeLog, FakeNetwork, TypedAnswer, routes, send_with};

/// An invented secret with spaces in it, so a word-by-word check alone
/// couldn't drop it. Nothing about it looks like a key.
const SECRET: &str = "acme deploy secret 0001";

fn set_secret() -> Value {
    json!({ "definition": "acme.set-secret", "version": 1, "step": 1,
            "placeholders": { "owner": "acme", "repo": "app", "name": "DEPLOY_KEY" } })
}

fn add_key() -> Value {
    json!({ "definition": "acme.add-key", "version": 1, "step": 1,
            "placeholders": { "owner": "acme", "repo": "app" }, "body": { "title": "deploy" } })
}

fn delete_repo() -> Value {
    json!({ "definition": "acme.delete-repo", "version": 1, "step": 1,
            "placeholders": { "owner": "acme", "repo": "app" } })
}

/// Sends `request` with a user who types `typed`; gives back the result, the
/// dialogs, the network and the log.
fn send_typing(
    request: Value,
    typed: TypedAnswer,
    answer: Result<Answer, String>,
) -> (SendResult, FakeDialogs, FakeNetwork, FakeLog) {
    let network = FakeNetwork::answering(answer);
    let dialogs = FakeDialogs::typing(typed);
    let log = FakeLog::default();
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_in(),
        &dialogs,
        &log,
        request,
    );
    (result, dialogs, network, log)
}

fn json_answer(status: u16, body: Value) -> Result<Answer, String> {
    Ok(Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    })
}

fn sent_body(network: &FakeNetwork) -> Value {
    let calls = network.calls();
    serde_json::from_slice(calls[0].body.as_deref().unwrap_or_default()).expect("a JSON body")
}

#[test]
fn a_secret_input_value_reaches_the_call_body() {
    let (result, dialogs, network, _) = send_typing(
        set_secret(),
        Some((None, vec![("value", SECRET)])),
        Ok(Answer {
            status: 204,
            ..Answer::default()
        }),
    );
    assert!(
        matches!(result, SendResult::Answered { status: 204, .. }),
        "{result:?}"
    );
    assert_eq!(sent_body(&network), json!({ "value": SECRET }));
    let asked = dialogs.asked();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].secrets, ["value"]);
    assert_eq!(asked[0].target, None);
    assert_eq!(
        asked[0].confirm.address,
        "https://api.github.com/repos/acme/app/actions/secrets/DEPLOY_KEY"
    );
    // The plain confirmation isn't shown as well.
    assert!(dialogs.sheets.lock().expect("not poisoned").is_empty());
}

#[test]
fn a_routine_step_with_a_secret_asks_too_and_keeps_the_page_fields() {
    let (result, dialogs, network, _) = send_typing(
        add_key(),
        Some((None, vec![("key", SECRET)])),
        Ok(Answer::default()),
    );
    assert!(matches!(result, SendResult::Answered { .. }), "{result:?}");
    assert_eq!(dialogs.asked().len(), 1);
    assert_eq!(
        dialogs.asked()[0].confirm.fields,
        [("title".to_owned(), "\"deploy\"".to_owned())]
    );
    assert_eq!(
        sent_body(&network),
        json!({ "title": "deploy", "key": SECRET })
    );
}

#[test]
fn a_secret_is_never_in_the_result_a_log_line_or_the_dialogs_sheet() {
    let echoes = [
        json_answer(201, json!({ "id": 7, "title": "deploy", "key": SECRET })),
        json_answer(
            201,
            json!({ "id": 7, "title": format!("key {SECRET} added"), "key": "x" }),
        ),
        json_answer(
            422,
            json!({ "message": format!("Key {SECRET} is invalid") }),
        ),
        Err(format!("connection reset while sending {SECRET}")),
    ];
    for answer in echoes {
        let (result, dialogs, _, log) =
            send_typing(add_key(), Some((None, vec![("key", SECRET)])), answer);
        let shown = serde_json::to_string(&result).expect("serialises");
        assert!(!shown.contains(SECRET), "{shown}");
        assert!(!shown.contains("0001"), "{shown}");
        for line in log.lines() {
            assert!(!line.contains(SECRET), "{line}");
        }
        let sheet = format!("{:?}", dialogs.asked());
        assert!(!sheet.contains(SECRET), "{sheet}");
    }
    let (result, _, _, _) = send_typing(
        add_key(),
        Some((None, vec![("key", SECRET)])),
        json_answer(201, json!({ "id": 7, "title": "deploy", "key": SECRET })),
    );
    let SendResult::Answered { kept, .. } = result else {
        panic!("{result:?}")
    };
    assert_eq!(kept.get("id"), Some(&json!(7)));
    assert_eq!(kept.get("key"), None);
}

#[test]
fn a_numeric_secret_echoed_as_a_number_is_not_kept() {
    let (result, _, _, _) = send_typing(
        add_key(),
        Some((None, vec![("key", "40710042")])),
        json_answer(
            201,
            json!({ "id": 7, "title": "deploy", "key": 40_710_042 }),
        ),
    );
    let SendResult::Answered { kept, .. } = result else {
        panic!("{result:?}")
    };
    assert_eq!(kept.get("id"), Some(&json!(7)));
    assert_eq!(kept.get("key"), None);
    let shown = serde_json::to_string(&kept).expect("serialises");
    assert!(!shown.contains("40710042"), "{shown}");
}

#[test]
fn the_page_may_not_send_a_secret_field_itself() {
    let mut request = set_secret();
    request["body"] = json!({ "value": "from the page" });
    let (result, dialogs, network, _) = send_typing(
        request,
        Some((None, vec![("value", SECRET)])),
        Ok(Answer::default()),
    );
    assert_eq!(
        result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(dialogs.asked().is_empty());
    assert!(network.calls().is_empty());
}

#[test]
fn an_empty_or_missing_secret_sends_nothing() {
    for typed in [
        Some((None, vec![("value", "")])),
        Some((None, vec![])),
        Some((None, vec![("other", SECRET)])),
        Some((Some("acme/app"), vec![("value", SECRET)])),
    ] {
        let (result, _, network, _) = send_typing(set_secret(), typed, Ok(Answer::default()));
        assert_eq!(result, SendResult::Cancelled);
        assert!(network.calls().is_empty());
    }
}

#[test]
fn an_irreversible_step_is_sent_only_after_the_typed_name_matches_its_target() {
    let (result, dialogs, network, _) = send_typing(
        delete_repo(),
        Some((Some("acme/app"), vec![])),
        Ok(Answer {
            status: 204,
            ..Answer::default()
        }),
    );
    assert!(
        matches!(result, SendResult::Answered { status: 204, .. }),
        "{result:?}"
    );
    assert_eq!(dialogs.asked()[0].target.as_deref(), Some("acme/app"));
    assert_eq!(dialogs.asked()[0].confirm.method, "DELETE");
    let calls = network.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].address.as_str(),
        "https://api.github.com/repos/acme/app"
    );
}

#[test]
fn a_name_that_doesnt_match_the_target_exactly_sends_nothing() {
    for typed in ["acme/ap", "acme/app ", " acme/app", "ACME/APP", "app", ""] {
        let (result, _, network, log) = send_typing(
            delete_repo(),
            Some((Some(typed), vec![])),
            Ok(Answer::default()),
        );
        assert_eq!(result, SendResult::Cancelled, "{typed:?}");
        assert!(network.calls().is_empty(), "{typed:?}");
        assert!(
            log.lines()
                .iter()
                .any(|line| line.ends_with("not sent, the name typed isn't the target's")),
            "{typed:?}"
        );
    }
    let (result, _, network, _) =
        send_typing(delete_repo(), Some((None, vec![])), Ok(Answer::default()));
    assert_eq!(result, SendResult::Cancelled);
    assert!(network.calls().is_empty());
}
