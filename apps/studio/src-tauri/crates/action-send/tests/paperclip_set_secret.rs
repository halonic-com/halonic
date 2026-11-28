//! Requirement `studio.src-tauri.crates.action-send.paperclip-admin-key`.
//!
//! `paperclip.set-secret` (note on HAL-17491, row C1; plan OK on HAL-21110)
//! against invented answers: the admin key makes only the calls on its list,
//! and the typed value goes only into the body of the one write that sets it.

mod set_secret_support;
mod support;

use halonic_action_send::{MORE_THAN_ONE, Refusal, SendResult, SetSecretStep};
use serde_json::{Value, json};
use set_secret_support::{
    COMPANY, ORIGIN, STEP, VALUE, answer, assert_value_only_in, catalog, company, existing, keys,
    me, set_secret, typing_the_value,
};
use support::FakeDialogs;

#[test]
fn an_existing_secret_is_rotated_with_the_value_only_in_that_body() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(existing()),
            answer(200, json!({ "id": "sec-1" })),
        ],
    );
    assert_eq!(
        outcome.result,
        SendResult::Answered {
            status: 200,
            kept: serde_json::Map::new(),
            error: None
        }
    );
    assert_eq!(
        outcome.network.routes(),
        vec![
            "GET /api/cli-auth/me",
            "GET /api/companies/c0ffee00-acme",
            "GET /api/companies/c0ffee00-acme/secrets/catalog",
            "POST /api/secrets/sec-1/rotate",
        ]
    );
    assert_value_only_in(&outcome, "/api/secrets/sec-1/rotate");
    let asked = outcome.dialogs.asked();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].secrets, vec!["value".to_owned()]);
    assert_eq!(asked[0].confirm.account, "user-1");
}

#[test]
fn a_new_secret_is_created_with_its_name_as_its_key() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(201, json!({ "id": "sec-9" })),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 201, .. }
    ));
    let bodies = outcome.network.bodies();
    assert_eq!(bodies.len(), 1);
    let sent: Value = serde_json::from_str(&bodies[0].1).expect("JSON");
    assert_eq!(
        sent,
        json!({ "name": "ACME_API_KEY", "key": "ACME_API_KEY", "value": VALUE })
    );
    assert_value_only_in(&outcome, "/api/companies/c0ffee00-acme/secrets");
}

#[test]
fn a_create_that_loses_a_race_reads_the_catalog_once_more_and_rotates() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(
                409,
                json!({ "error": "Secret key already exists: ACME_API_KEY" }),
            ),
            catalog(existing()),
            answer(200, json!({ "id": "sec-1" })),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 200, .. }
    ));
    let routes = outcome.network.routes();
    assert_eq!(routes.len(), 6);
    assert_eq!(routes[5], "POST /api/secrets/sec-1/rotate");
}

#[test]
fn a_create_that_conflicts_twice_ends_without_a_loop() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![
            me(),
            company(),
            catalog(json!([])),
            answer(409, json!({ "error": "Secret key already exists" })),
            catalog(json!([])),
        ],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 409, .. }
    ));
    assert_eq!(outcome.network.routes().len(), 5);
}

#[test]
fn a_step_for_another_host_or_company_asks_for_nothing_and_writes_nothing() {
    let keys = keys(true);
    let other_host = SetSecretStep {
        host: "paperclip.evil.example",
        ..STEP
    };
    let outcome = set_secret(&keys, other_host, typing_the_value(), vec![]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(outcome.network.routes().is_empty());
    let other_company = SetSecretStep {
        company: "GLOBEX",
        ..STEP
    };
    let outcome = set_secret(
        &keys,
        other_company,
        typing_the_value(),
        vec![me(), company()],
    );
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(outcome.dialogs.asked().is_empty());
    assert!(outcome.network.bodies().is_empty());
}

#[test]
fn a_key_that_no_longer_reaches_the_company_writes_nothing() {
    let keys = keys(true);
    let elsewhere = answer(
        200,
        json!({ "userId": "user-1", "companyIds": ["other-company"] }),
    );
    let outcome = set_secret(&keys, STEP, typing_the_value(), vec![elsewhere]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::SignedOut
        }
    );
    assert!(outcome.dialogs.asked().is_empty());
    assert_eq!(outcome.network.routes(), vec!["GET /api/cli-auth/me"]);
}

#[test]
fn without_the_admin_key_nothing_is_sent() {
    let keys = keys(false);
    let outcome = set_secret(&keys, STEP, typing_the_value(), vec![]);
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::SignedOut
        }
    );
    assert!(outcome.network.routes().is_empty());
}

#[test]
fn closing_the_dialog_or_leaving_the_value_empty_writes_nothing() {
    let keys = keys(true);
    for dialogs in [
        FakeDialogs::typing(None),
        FakeDialogs::typing(Some((None, vec![("value", "")]))),
    ] {
        let outcome = set_secret(
            &keys,
            STEP,
            dialogs,
            vec![me(), company(), catalog(existing())],
        );
        assert_eq!(outcome.result, SendResult::Cancelled);
        assert!(outcome.network.bodies().is_empty());
    }
}

#[test]
fn a_failed_write_says_why_without_the_value() {
    let keys = keys(true);
    let failure = answer(422, json!({ "error": format!("bad value {VALUE}") }));
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(existing()), failure],
    );
    let SendResult::Answered {
        status: 422,
        error: Some(error),
        ..
    } = &outcome.result
    else {
        panic!("answered 422: {:?}", outcome.result);
    };
    assert!(!error.contains(VALUE));
    assert_value_only_in(&outcome, "/api/secrets/sec-1/rotate");
}

#[test]
fn the_dialog_shows_the_create_on_the_connections_own_origin_and_company() {
    // Julian's review of #6946: the address comes from the key's record,
    // whatever the step's placeholders say.
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(json!([])), answer(201, json!({}))],
    );
    let asked = outcome.dialogs.asked();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].confirm.method, "POST");
    assert_eq!(
        asked[0].confirm.address,
        format!("{ORIGIN}/api/companies/{COMPANY}/secrets")
    );
    assert!(
        asked[0]
            .confirm
            .fields
            .iter()
            .all(|(name, _)| name != "replaces")
    );
}

#[test]
fn the_dialog_shows_the_rotate_and_that_it_replaces_the_value_in_use() {
    let keys = keys(true);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(existing()), answer(200, json!({}))],
    );
    let asked = outcome.dialogs.asked();
    assert_eq!(asked.len(), 1);
    assert_eq!(
        asked[0].confirm.address,
        format!("{ORIGIN}/api/secrets/sec-1/rotate")
    );
    assert!(
        asked[0]
            .confirm
            .fields
            .iter()
            .any(|(name, _)| name == "replaces")
    );
}

#[test]
fn two_secrets_of_that_name_ask_for_nothing_and_write_nothing() {
    let keys = keys(true);
    let twice = json!([
        { "id": "sec-1", "name": "ACME_API_KEY", "key": "ACME_API_KEY", "status": "active" },
        { "id": "sec-3", "name": "Acme", "key": "ACME_API_KEY", "status": "active" },
    ]);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(twice)],
    );
    let SendResult::Answered { error, .. } = &outcome.result else {
        panic!("answered: {:?}", outcome.result);
    };
    assert_eq!(error.as_deref(), Some(MORE_THAN_ONE));
    assert!(outcome.dialogs.asked().is_empty());
    assert!(outcome.network.bodies().is_empty());
}

#[test]
fn a_deleted_secret_of_that_name_is_created_anew() {
    let keys = keys(true);
    let deleted = json!([
        { "id": "sec-1", "name": "ACME_API_KEY", "key": "ACME_API_KEY", "status": "deleted" },
    ]);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(deleted), answer(201, json!({}))],
    );
    assert!(matches!(
        outcome.result,
        SendResult::Answered { status: 201, .. }
    ));
    assert_value_only_in(&outcome, "/api/companies/c0ffee00-acme/secrets");
}

#[test]
fn a_catalog_id_that_isnt_one_is_refused_before_the_dialog() {
    let keys = keys(true);
    let climbing = json!([
        { "id": "../companies", "name": "ACME_API_KEY", "key": "ACME_API_KEY", "status": "active" },
    ]);
    let outcome = set_secret(
        &keys,
        STEP,
        typing_the_value(),
        vec![me(), company(), catalog(climbing)],
    );
    assert_eq!(
        outcome.result,
        SendResult::Refused {
            reason: Refusal::BadValue
        }
    );
    assert!(outcome.dialogs.asked().is_empty());
    assert!(outcome.network.bodies().is_empty());
}
