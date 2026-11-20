//! The served page and the secret commands: the connect page may call them
//! on desktop, and the shell refuses Halonic's own names before the keychain.

use serde_json::json;

use super::{CONNECT_PAGE, app_window, invoke};

#[test]
fn served_page_test_sees_the_connect_page_allowed_the_secret_commands_on_desktop() {
    // Each call gets through to its command, and the command refuses the
    // name before it reaches the keychain, which CI doesn't have.
    let window = app_window();
    for (command, body) in [
        ("secret_get", json!({"name": "not a name"})),
        ("secret_has", json!({"name": "not a name"})),
        ("secret_set", json!({"name": "not a name", "value": "v"})),
        ("secret_delete", json!({"name": "not a name"})),
        ("secret_allowed_origins", json!({"name": "not a name"})),
        (
            "secret_allow_origin",
            json!({"name": "not a name", "address": "https://llm.example.com"}),
        ),
        ("token_get", json!({"name": "not a name"})),
        ("token_set", json!({"name": "not a name", "value": "v"})),
        ("token_delete", json!({"name": "not a name"})),
    ] {
        let answer = invoke(&window, CONNECT_PAGE, command, body);
        let refusal = answer.expect_err("the name is invalid");
        assert_eq!(refusal["kind"], "invalid_name", "{command}: {refusal}");
    }
}

#[test]
fn served_page_test_sees_the_secret_commands_refuse_halonic_names_over_ipc() {
    // The refusal is the shell's, not the page's: a page that calls the
    // commands directly gets it before the keychain, which CI doesn't have.
    let window = app_window();
    for name in [
        "halonic_token_google_refresh_acme",
        "token-key",
        "serve-password",
        "remote-host-key",
    ] {
        for (command, body) in [
            ("secret_get", json!({"name": name})),
            ("secret_has", json!({"name": name})),
            ("secret_set", json!({"name": name, "value": "v"})),
            ("secret_delete", json!({"name": name})),
            ("secret_allowed_origins", json!({"name": name})),
            (
                "secret_allow_origin",
                json!({"name": name, "address": "https://llm.example.com"}),
            ),
        ] {
            let answer = invoke(&window, CONNECT_PAGE, command, body);
            let refusal = answer.expect_err("the name belongs to Halonic");
            assert_eq!(
                refusal["kind"], "reserved_name",
                "{command} {name}: {refusal}"
            );
        }
    }
}
