//! Requirement `ports.action-operation-route`.
//!
//! The route list may name one of the shell's own operations instead of a
//! method and a path, only for that operation's service and with exactly its
//! placeholders and `secret-input` body; the shell's list of operations is
//! the one in `@halonicjs/ports`.

use std::collections::BTreeMap;

use halonic_action_send::{OPERATIONS, Operation, Refusal, RouteList, SendRequest, operation_step};
use serde_json::{Value, json};

/// The list `actionOperations` in `@halonicjs/ports` is checked against.
const GOLDEN: &str =
    include_str!("../../../../../../packages/core/ports/src/golden/action-operations.json");

fn set_secret_route() -> Value {
    json!({
        "kind": "operation",
        "definition": "paperclip.set-secret",
        "version": 1,
        "step": 1,
        "service": "paperclip",
        "risk": "admin",
        "placeholders": {
            "company": "^[A-Za-z0-9]{1,16}$",
            "host": "^[a-z0-9.-]{1,253}$",
            "name": "^[A-Z][A-Z0-9_]{0,63}$"
        },
        "operation": "paperclip.set-secret",
        "body": [{ "name": "value", "kind": "secret-input" }],
        "keep": []
    })
}

fn list_of(route: Value) -> Result<RouteList, String> {
    let file = json!({ "format": "halonic.action-routes/1", "webOrigins": [], "routes": [route] });
    RouteList::parse(&file.to_string())
}

fn changed(change: impl FnOnce(&mut Value)) -> Value {
    let mut route = set_secret_route();
    change(&mut route);
    route
}

fn request(placeholders: &[(&str, &str)], body: Value) -> SendRequest {
    serde_json::from_value(json!({
        "definition": "paperclip.set-secret",
        "version": 1,
        "step": 1,
        "placeholders": placeholders
            .iter()
            .map(|(name, value)| ((*name).to_owned(), Value::from(*value)))
            .collect::<serde_json::Map<String, Value>>(),
        "body": body,
    }))
    .expect("a request")
}

#[test]
fn the_shells_operations_are_the_ports_list() {
    let golden: BTreeMap<String, String> = serde_json::from_str(GOLDEN).expect("JSON");
    let shell: BTreeMap<String, String> = OPERATIONS
        .iter()
        .map(|(name, service)| ((*name).to_owned(), (*service).to_owned()))
        .collect();
    assert_eq!(shell, golden);
}

#[test]
fn an_operation_route_is_read_with_its_placeholders() {
    let list = list_of(set_secret_route()).expect("reads");
    let route = list.operations.values().next().expect("one operation");
    assert_eq!(route.operation, Operation::PaperclipSetSecret);
    assert_eq!(
        route
            .placeholders
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["company", "host", "name"]
    );
    assert!(list.calls.is_empty());
}

#[test]
fn an_operation_route_that_widens_the_operation_is_refused() {
    let wrong: Vec<(&str, Value)> = vec![
        (
            "an unknown operation",
            changed(|route| route["operation"] = json!("paperclip.read-secret")),
        ),
        (
            "another service",
            changed(|route| route["service"] = json!("github")),
        ),
        (
            "a routine risk",
            changed(|route| route["risk"] = json!("routine")),
        ),
        ("a method", changed(|route| route["method"] = json!("POST"))),
        (
            "a path",
            changed(|route| route["path"] = json!("/api/secrets")),
        ),
        (
            "a kept field",
            changed(|route| route["keep"] = json!(["value"])),
        ),
        (
            "a value the page sends",
            changed(|route| {
                route["body"] =
                    json!([{ "name": "value", "kind": "string", "pattern": "^.{1,100}$" }])
            }),
        ),
        (
            "an extra body field",
            changed(|route| {
                route["body"] = json!([
                    { "name": "value", "kind": "secret-input" },
                    { "name": "provider", "kind": "constant", "value": "external" }
                ]);
            }),
        ),
        ("no body", changed(|route| route["body"] = json!([]))),
        (
            "a missing placeholder",
            changed(|route| {
                if let Some(placeholders) = route["placeholders"].as_object_mut() {
                    placeholders.remove("company");
                }
            }),
        ),
        (
            "no operation",
            changed(|route| {
                if let Some(fields) = route.as_object_mut() {
                    fields.remove("operation");
                }
            }),
        ),
    ];
    for (why, route) in wrong {
        assert!(list_of(route).is_err(), "{why}");
    }
}

#[test]
fn a_call_or_guided_route_never_names_an_operation() {
    let mut call = set_secret_route();
    call["kind"] = json!("call");
    call["method"] = json!("POST");
    call["path"] = json!("/api/companies/{company}/secrets");
    assert!(list_of(call).is_err());
}

#[test]
fn a_send_of_an_operation_step_takes_only_fitting_placeholders_and_no_body() {
    let list = list_of(set_secret_route()).expect("reads");
    let fitting = [
        ("company", "ACME"),
        ("host", "paperclip.acme.example"),
        ("name", "ACME_API_KEY"),
    ];
    let sent = request(&fitting, json!({}));
    let (route, values) = operation_step(&list.operations, &sent)
        .expect("an operation step")
        .expect("fits");
    assert_eq!(route.operation, Operation::PaperclipSetSecret);
    assert_eq!(values.get("name").map(String::as_str), Some("ACME_API_KEY"));

    let with_value = request(&fitting, json!({ "value": "typed-in-the-page" }));
    assert_eq!(
        operation_step(&list.operations, &with_value).map(|step| step.map(|_| ())),
        Some(Err(Refusal::BadValue))
    );
    let bad_name = request(
        &[
            ("company", "ACME"),
            ("host", "paperclip.acme.example"),
            ("name", "../x"),
        ],
        json!({}),
    );
    assert_eq!(
        operation_step(&list.operations, &bad_name).map(|step| step.map(|_| ())),
        Some(Err(Refusal::BadValue))
    );
    let mut other = request(&fitting, json!({}));
    other.step = 2;
    assert!(operation_step(&list.operations, &other).is_none());
}
