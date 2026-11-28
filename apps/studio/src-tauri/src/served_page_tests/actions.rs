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
        ("action_paperclip_sign_in", json!({"connection": "acme"})),
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
    // No Paperclip operation is listed yet, so the admin sign-in starts nothing.
    let admin = invoke(
        &window,
        CONNECT_PAGE,
        "action_paperclip_sign_in",
        json!({"connection": "acme"}),
    );
    assert_eq!(admin, Ok(json!({"outcome": "not-available"})));
    for command in ["action_sign_out", "action_account"] {
        let answer = invoke(&window, CONNECT_PAGE, command, json!({"service": "acme"}));
        let refusal = answer.expect_err("no such service");
        assert_eq!(refusal["kind"], "unknown_service", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_the_action_dialog_granted_nothing() {
    // HAL-18085: the dialog with text fields takes a secret or a target's
    // name. No capability names its window, so its page can call no
    // command; its answer is a form the shell's own scheme reads.
    use tauri::http::{Request, StatusCode};
    use tauri::webview::WebviewWindowBuilder;
    use tauri::{Manager, WebviewUrl};

    use crate::action_parts::dialog::{WINDOW, serve};

    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
    for entry in std::fs::read_dir(folder).expect("the capabilities folder") {
        let path = entry.expect("a capability file").path();
        let text = std::fs::read_to_string(&path).expect("a readable capability");
        let capability: Value = serde_json::from_str(&text).expect("the capability is JSON");
        for window in capability["windows"].as_array().into_iter().flatten() {
            let label = window.as_str().expect("a label");
            assert!(
                label != WINDOW && !label.contains('*'),
                "{path:?} names {label}"
            );
        }
    }
    let main = app_window();
    let dialog = WebviewWindowBuilder::new(main.app_handle(), WINDOW, WebviewUrl::default())
        .build()
        .expect("the dialog's window opens");
    for command in every_command() {
        let refusal = invoke(&dialog, "halonic-action://localhost/", &command, json!({}))
            .expect_err("the dialog's window is refused every command");
        assert!(
            refusal.to_string().contains("not allowed"),
            "{command}: {refusal}"
        );
    }
    // Its scheme serves nothing to another window, nor with no dialog open.
    for (label, method, path) in [
        ("main", "GET", "/"),
        ("main", "POST", "/send"),
        (WINDOW, "GET", "/"),
        (WINDOW, "GET", "/send"),
    ] {
        let request = Request::builder()
            .method(method)
            .uri(format!("halonic-action://localhost{path}"))
            .body(b"target=acme%2Fapp".to_vec())
            .expect("a request");
        let answer = serve(main.app_handle(), label, request);
        assert_eq!(
            answer.status(),
            StatusCode::NOT_FOUND,
            "{label} {method} {path}"
        );
    }
}
