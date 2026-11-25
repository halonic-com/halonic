//! Requirement `action-commands`: the served page and the `action_*`
//! commands. The Studio the computer serves is refused every one of them,
//! while the app's own page reaches each, and the command refuses what isn't
//! on the route list before the keychain or the network, which CI doesn't
//! have.

use serde_json::{Value, json};

use super::{CONNECT_PAGE, SERVED_PAGE, app_window, every_command, invoke};

/// Each command with a body it would take from the app's own page.
fn action_calls() -> Vec<(&'static str, Value)> {
    let step = json!({"definition": "acme.unknown", "version": 1, "step": 1, "placeholders": {}});
    vec![
        ("action_send", json!({"request": step.clone()})),
        (
            "action_sign_in",
            json!({"service": "github", "code": "__CHANNEL__:7"}),
        ),
        ("action_sign_in_cancel", json!({})),
        ("action_sign_out", json!({"service": "github"})),
        ("action_account", json!({"service": "github"})),
        ("action_open_guided", json!({"request": step})),
        (
            "action_open_page",
            json!({"url": "https://github.com/acme/app/settings/variables/actions"}),
        ),
    ]
}

#[test]
fn served_page_is_refused_every_action_command() {
    let window = app_window();
    let commands = every_command();
    for (command, body) in action_calls() {
        assert!(
            commands.iter().any(|known| known == command),
            "{command} missing from {commands:?}"
        );
        let Err(refusal) = invoke(&window, SERVED_PAGE, command, body) else {
            panic!("{command} must be refused from the served page");
        };
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command} failed for another reason: {refusal}"
        );
    }
}

#[test]
fn served_page_test_sees_the_connect_page_reach_the_action_commands() {
    // Without this, a shell that refused everything would pass the test above.
    let window = app_window();
    let not_in_catalog = json!({"outcome": "refused", "reason": "not-in-catalog"});
    let step = json!({"definition": "acme.unknown", "version": 1, "step": 1, "placeholders": {}});
    let sent = invoke(
        &window,
        CONNECT_PAGE,
        "action_send",
        json!({"request": step.clone()}),
    );
    assert_eq!(sent, Ok(not_in_catalog.clone()));
    let guided = invoke(
        &window,
        CONNECT_PAGE,
        "action_open_guided",
        json!({"request": step}),
    );
    assert_eq!(guided, Ok(not_in_catalog));
    let page = invoke(
        &window,
        CONNECT_PAGE,
        "action_open_page",
        json!({"url": "http://github.com/acme/app/settings/variables/actions"}),
    );
    assert_eq!(
        page,
        Ok(json!({"outcome": "refused", "reason": "bad-value"}))
    );
    let cancelled = invoke(&window, CONNECT_PAGE, "action_sign_in_cancel", json!({}));
    assert_eq!(cancelled, Ok(Value::Null));
    for command in ["action_sign_out", "action_account"] {
        let answer = invoke(&window, CONNECT_PAGE, command, json!({"service": "acme"}));
        let refusal = answer.expect_err("no such service");
        assert_eq!(refusal["kind"], "unknown_service", "{command}: {refusal}");
    }
}
