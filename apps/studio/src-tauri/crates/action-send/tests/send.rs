//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! `action_send` sends only steps on the route list, only to the service's
//! fixed origin, follows no redirect, and never hands back or logs the token
//! (HAL-17525, Done when (a), (b) and (c)).

mod support;

use halonic_action_send::{Answer, Refusal, SendRequest, SendResult};
use serde_json::{Value, json};
use support::{FakeDialogs, FakeKeychain, FakeLog, FakeNetwork, NOW, TOKEN, routes, send_with};

fn approve(placeholders: Value) -> Value {
    json!({ "definition": "acme.approve-run", "version": 1, "step": 1, "placeholders": placeholders })
}

fn good_placeholders() -> Value {
    json!({ "owner": "acme", "repo": "app", "runId": "123456" })
}

/// Sends with a signed-in keychain and a dialog that confirms; gives back the
/// result, the network and the log.
fn send(request: Value, answer: Result<Answer, String>) -> (SendResult, FakeNetwork, FakeLog) {
    let network = FakeNetwork::answering(answer);
    let log = FakeLog::default();
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_in(),
        &FakeDialogs::answering(true),
        &log,
        request,
    );
    (result, network, log)
}

fn json_answer(status: u16, body: Value) -> Result<Answer, String> {
    Ok(Answer {
        status,
        content_type: Some("application/json; charset=utf-8".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    })
}

fn refused(reason: Refusal) -> SendResult {
    SendResult::Refused { reason }
}

#[test]
fn a_step_on_the_list_goes_to_github_with_the_token_in_one_header() {
    let (result, network, _) = send(
        approve(good_placeholders()),
        Ok(Answer {
            status: 204,
            ..Answer::default()
        }),
    );
    assert_eq!(
        result,
        SendResult::Answered {
            status: 204,
            kept: serde_json::Map::new(),
            error: None
        }
    );
    let calls = network.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].method, "POST");
    assert_eq!(
        calls[0].address.as_str(),
        "https://api.github.com/repos/acme/app/actions/runs/123456/approve"
    );
    assert!(
        calls[0]
            .headers
            .contains(&("authorization".to_owned(), format!("Bearer {TOKEN}")))
    );
    assert!(
        calls[0]
            .headers
            .contains(&("x-github-api-version".to_owned(), "2022-11-28".to_owned()))
    );
    assert!(calls[0].body.is_none());
}

#[test]
fn an_off_catalog_step_or_version_is_refused_before_the_network() {
    for (definition, version, step) in [
        ("acme.unknown", 1, 1),
        ("acme.approve-run", 2, 1),
        ("acme.approve-run", 1, 2),
        ("acme.set-variable", 1, 1),
    ] {
        let request = json!({ "definition": definition, "version": version, "step": step, "placeholders": good_placeholders() });
        let (result, network, _) = send(request, Ok(Answer::default()));
        assert_eq!(
            result,
            refused(Refusal::NotInCatalog),
            "{definition}@{version} step {step}"
        );
        assert!(network.calls().is_empty());
    }
}

#[test]
fn a_request_carrying_a_method_an_address_or_a_header_doesnt_parse() {
    for extra in ["method", "path", "address", "origin", "headers", "url"] {
        let mut request = approve(good_placeholders());
        request[extra] = json!("DELETE");
        assert!(
            serde_json::from_value::<SendRequest>(request).is_err(),
            "{extra}"
        );
    }
}

#[test]
fn a_placeholder_that_would_change_the_path_or_origin_is_refused() {
    for repo in [
        "../../user",
        "app/x",
        "app%2Fx",
        "app\\x",
        "app?x=1",
        "app#x",
        "..",
        ".",
        "",
        "@evil.example",
        "app x",
    ] {
        let mut placeholders = good_placeholders();
        placeholders["repo"] = json!(repo);
        let (result, network, _) = send(approve(placeholders), Ok(Answer::default()));
        assert_eq!(result, refused(Refusal::BadValue), "{repo:?}");
        assert!(network.calls().is_empty(), "{repo:?}");
    }
}

#[test]
fn a_missing_or_extra_placeholder_is_refused() {
    let (missing, _, _) = send(
        approve(json!({ "owner": "acme", "repo": "app" })),
        Ok(Answer::default()),
    );
    assert_eq!(missing, refused(Refusal::BadValue));
    let mut extra = good_placeholders();
    extra["host"] = json!("evil.example");
    let (extra, _, _) = send(approve(extra), Ok(Answer::default()));
    assert_eq!(extra, refused(Refusal::BadValue));
}

#[test]
fn every_call_goes_to_the_services_own_origin() {
    // A value that looks like a host stays one path segment.
    let mut placeholders = good_placeholders();
    placeholders["owner"] = json!("evil-example-com");
    let (_, network, _) = send(approve(placeholders), Ok(Answer::default()));
    let calls = network.calls();
    assert_eq!(
        calls[0].address.origin().ascii_serialization(),
        "https://api.github.com"
    );
}

#[test]
fn a_redirect_is_not_followed_and_its_address_isnt_shown() {
    let answer = Ok(Answer {
        status: 302,
        content_type: Some("application/json".to_owned()),
        body: br#"{"url":"https://evil.example/collect","note":"x"}"#.to_vec(),
        ..Answer::default()
    });
    let request = json!({ "definition": "acme.read-run", "version": 1, "step": 1, "placeholders": good_placeholders() });
    let (result, network, _) = send(request, answer);
    assert_eq!(network.calls().len(), 1, "one call, no second hop");
    let SendResult::Answered {
        status,
        kept,
        error,
    } = &result
    else {
        panic!("{result:?}")
    };
    assert_eq!(*status, 302);
    assert!(kept.is_empty());
    assert!(
        !error
            .as_deref()
            .unwrap_or_default()
            .contains("evil.example")
    );
}

#[test]
fn only_the_routes_kept_fields_come_back() {
    let body = json!({ "status": "completed", "head_sha": "abc1234", "secret_stuff": "x", "note": { "nested": true } });
    let request = json!({ "definition": "acme.read-run", "version": 1, "step": 1, "placeholders": good_placeholders() });
    let (result, network, _) = send(request, json_answer(200, body));
    let expected = json!({ "status": "completed", "head_sha": "abc1234" });
    assert_eq!(
        result,
        SendResult::Answered {
            status: 200,
            kept: expected.as_object().cloned().unwrap_or_default(),
            error: None
        }
    );
    assert_eq!(network.calls()[0].method, "GET");
}

#[test]
fn the_token_is_never_in_a_result_or_a_log_line() {
    let request = json!({ "definition": "acme.read-run", "version": 1, "step": 1, "placeholders": good_placeholders() });
    let echoes = [
        json_answer(
            200,
            json!({ "status": TOKEN, "note": format!("token {TOKEN}") }),
        ),
        json_answer(
            401,
            json!({ "message": format!("Bad credentials for {TOKEN}") }),
        ),
        json_answer(403, json!({ "message": format!("token={TOKEN};") })),
        Err(format!("connection reset while sending Bearer {TOKEN}")),
        Ok(Answer {
            status: 302,
            body: TOKEN.as_bytes().to_vec(),
            ..Answer::default()
        }),
    ];
    for answer in echoes {
        let (result, _, log) = send(request.clone(), answer);
        let shown = serde_json::to_string(&result).expect("serialises");
        assert!(!shown.contains(TOKEN), "{shown}");
        for line in log.lines() {
            assert!(!line.contains(TOKEN), "{line}");
        }
    }
}

#[test]
fn error_text_is_capped_and_drops_key_shapes() {
    // Put together here, so the file itself holds nothing key-shaped.
    let key = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0"].concat();
    let message = format!("Bad: {key} {}", "x".repeat(400));
    let (result, _, _) = send(
        approve(good_placeholders()),
        json_answer(422, json!({ "message": message })),
    );
    let SendResult::Answered {
        error: Some(error), ..
    } = result
    else {
        panic!("{result:?}")
    };
    assert!(error.chars().count() <= 300);
    assert!(error.starts_with("Bad: [removed] x"));
}

#[test]
fn a_403_names_the_permission_github_asks_for() {
    let answer = Answer {
        status: 403,
        accepted_permissions: Some("actions=write".to_owned()),
        ..Answer::default()
    };
    let (result, _, _) = send(approve(good_placeholders()), Ok(answer));
    let SendResult::Answered { error, .. } = result else {
        panic!("{result:?}")
    };
    assert_eq!(
        error.as_deref(),
        Some("Needs the permission: actions=write.")
    );
}

#[test]
fn nobody_signed_in_or_an_expired_token_is_signed_out() {
    let network = FakeNetwork::default();
    let log = FakeLog::default();
    let dialogs = FakeDialogs::answering(true);
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_out(),
        &dialogs,
        &log,
        approve(good_placeholders()),
    );
    assert_eq!(result, refused(Refusal::SignedOut));
    let mut expired = FakeKeychain::signed_in();
    expired.now = NOW + 3_600;
    let result = send_with(
        &routes(),
        &network,
        &expired,
        &dialogs,
        &log,
        approve(good_placeholders()),
    );
    assert_eq!(result, refused(Refusal::SignedOut));
    assert!(network.calls().is_empty());
}

fn set_variable(body: Value) -> Value {
    json!({ "definition": "acme.set-variable", "version": 1, "step": 2,
            "placeholders": { "owner": "acme", "repo": "app", "name": "RELEASE_CHANNEL" }, "body": body })
}

#[test]
fn an_admin_step_shows_the_native_dialog_with_what_the_shell_built() {
    let network = FakeNetwork::default();
    let dialogs = FakeDialogs::answering(true);
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_in(),
        &dialogs,
        &FakeLog::default(),
        set_variable(json!({ "value": "beta" })),
    );
    assert!(
        matches!(result, SendResult::Answered { status: 204, .. }),
        "{result:?}"
    );
    let sheets = dialogs.sheets.lock().expect("not poisoned");
    assert_eq!(sheets.len(), 1);
    assert_eq!(sheets[0].account, "acme-admin");
    assert_eq!(sheets[0].method, "PATCH");
    assert_eq!(
        sheets[0].address,
        "https://api.github.com/repos/acme/app/actions/variables/RELEASE_CHANNEL"
    );
    let body: Value =
        serde_json::from_slice(network.calls()[0].body.as_deref().unwrap_or_default())
            .expect("json");
    assert_eq!(body, json!({ "value": "beta", "visibility": "all" }));
}

#[test]
fn closing_the_dialog_sends_nothing() {
    let network = FakeNetwork::default();
    let dialogs = FakeDialogs::answering(false);
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_in(),
        &dialogs,
        &FakeLog::default(),
        set_variable(json!({ "value": "beta" })),
    );
    assert_eq!(result, SendResult::Cancelled);
    assert!(network.calls().is_empty());
}

#[test]
fn the_body_is_checked_field_by_field() {
    for body in [
        json!({}),
        json!({ "value": "beta", "visibility": "private" }),
        json!({ "value": "beta", "extra": 1 }),
        json!({ "value": 7 }),
        json!({ "value": "has space" }),
        json!({ "value": { "nested": "beta" } }),
    ] {
        let (result, network, _) = send(set_variable(body.clone()), Ok(Answer::default()));
        assert_eq!(result, refused(Refusal::BadValue), "{body}");
        assert!(network.calls().is_empty());
    }
}

#[test]
fn closing_either_text_dialog_sends_nothing() {
    // HAL-18085: an irreversible step and a secret-input step each wait for
    // the dialog with text fields; closing it sends nothing.
    let delete = json!({ "definition": "acme.delete-repo", "version": 1, "step": 1, "placeholders": { "owner": "acme", "repo": "app" } });
    let secret = json!({ "definition": "acme.set-secret", "version": 1, "step": 1,
                         "placeholders": { "owner": "acme", "repo": "app", "name": "DEPLOY_KEY" } });
    for request in [delete, secret] {
        let network = FakeNetwork::default();
        let dialogs = FakeDialogs::typing(None);
        let result = send_with(
            &routes(),
            &network,
            &FakeKeychain::signed_in(),
            &dialogs,
            &FakeLog::default(),
            request,
        );
        assert_eq!(result, SendResult::Cancelled);
        assert_eq!(dialogs.asked().len(), 1);
        assert!(network.calls().is_empty());
    }
}

#[test]
fn a_sent_call_wipes_its_token_and_body() {
    // Liam's and Julian's reviews of HAL-18084: the call's copy of the token
    // in its header, and a sign-in poll's device code in its body, are
    // overwritten once it has gone. Dropping the call runs this `wipe`.
    let mut call = halonic_action_send::Outgoing {
        method: "POST",
        address: url::Url::parse("https://github.com/login/oauth/access_token").expect("a URL"),
        headers: vec![("authorization".to_owned(), format!("Bearer {TOKEN}"))],
        body: Some(b"client_id=acme&device_code=acme-device-code-0001".to_vec()),
    };
    let header_length = call.headers[0].1.len();
    call.wipe();
    let header = &call.headers[0].1;
    assert_eq!(header.len(), header_length);
    assert!(header.bytes().all(|byte| byte == 0));
    let body = call.body.as_deref().unwrap_or_default();
    assert!(!body.is_empty() && body.iter().all(|byte| *byte == 0));
}
