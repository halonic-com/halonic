// Tests for studio.src-tauri.app-shortcuts-commands: each name starts with
// `app_shortcuts_commands_` until the trace check reads `cargo test` results.

use super::*;

const COMPUTER: &str = "acme-desk_1";

fn taken(target: Option<&str>, computer: Option<&str>, chat: Option<&str>) -> Taken {
    Taken {
        target: target.map(str::to_owned),
        computer: computer.map(str::to_owned),
        chat: chat.map(str::to_owned),
    }
}

fn last_chat(computer: &str, chat: &str, name: &str) -> LastChat {
    LastChat {
        computer: computer.to_owned(),
        chat: chat.to_owned(),
        name: name.to_owned(),
    }
}

#[test]
fn app_shortcuts_commands_answer_inbox_and_messenger() {
    assert_eq!(
        target_of(taken(Some("inbox"), None, None)),
        Some(OpenTarget::Inbox)
    );
    assert_eq!(
        target_of(taken(Some("messenger"), None, None)),
        Some(OpenTarget::Messenger)
    );
}

#[test]
fn app_shortcuts_commands_answer_the_stored_chat() {
    assert_eq!(
        target_of(taken(Some("chat"), Some(COMPUTER), Some("launch-review"))),
        Some(OpenTarget::Chat {
            computer: COMPUTER.to_owned(),
            chat: "launch-review".to_owned()
        })
    );
}

#[test]
fn app_shortcuts_commands_open_the_messenger_list_for_a_chat_that_doesn_t_check_out() {
    for (computer, chat) in [
        (None, Some("launch-review")),
        (Some(COMPUTER), None),
        (Some("../acme"), Some("launch-review")),
        (Some(COMPUTER), Some("launch\nreview")),
        (Some(COMPUTER), Some(" ")),
    ] {
        assert_eq!(
            target_of(taken(Some("chat"), computer, chat)),
            Some(OpenTarget::Messenger)
        );
    }
}

#[test]
fn app_shortcuts_commands_answer_no_screen_for_anything_else() {
    assert_eq!(target_of(taken(None, None, None)), None);
    assert_eq!(target_of(taken(Some("settings"), None, None)), None);
    assert_eq!(target_of(taken(Some("Inbox"), None, None)), None);
}

#[test]
fn app_shortcuts_commands_keep_only_a_chat_that_fits() {
    assert!(chat_fits(&last_chat(
        COMPUTER,
        "launch-review",
        "Launch review"
    )));
    assert!(!chat_fits(&last_chat(
        "acme desk",
        "launch-review",
        "Launch review"
    )));
    assert!(!chat_fits(&last_chat(COMPUTER, "", "Launch review")));
    assert!(!chat_fits(&last_chat(
        COMPUTER,
        "launch-review",
        "Launch\u{7}review"
    )));
    assert!(!chat_fits(&last_chat(
        COMPUTER,
        "launch-review",
        &"a".repeat(MAX_CHAT_TEXT + 1)
    )));
    assert!(chat_fits(&last_chat(
        COMPUTER,
        "launch-review",
        &"a".repeat(MAX_CHAT_TEXT)
    )));
}

#[test]
fn app_shortcuts_commands_answer_the_page_s_screen_shape() {
    let chat = OpenTarget::Chat {
        computer: COMPUTER.to_owned(),
        chat: "c1".to_owned(),
    };
    assert_eq!(
        serde_json::to_value(chat).expect("JSON"),
        serde_json::json!({ "screen": "chat", "computer": COMPUTER, "chat": "c1" })
    );
    assert_eq!(
        serde_json::to_value(OpenTarget::Inbox).expect("JSON"),
        serde_json::json!({ "screen": "inbox" })
    );
}

#[test]
fn app_shortcuts_commands_pin_inbox_and_messenger_only() {
    assert!(serde_json::from_value::<PinScreen>(serde_json::json!("inbox")).is_ok());
    assert!(serde_json::from_value::<PinScreen>(serde_json::json!("messenger")).is_ok());
    assert!(serde_json::from_value::<PinScreen>(serde_json::json!("settings")).is_err());
}
