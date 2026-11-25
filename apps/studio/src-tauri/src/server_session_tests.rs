//! The command's own rules: what it answers for input it refuses, the
//! double-click guard, and the dialog's text.

use std::time::{Duration, Instant};

use halonic_server_session::validate_target;
use serde_json::json;

use super::{ServerSessionAnswer, ServerSessionState, check_input, question};

const BRIEF: &str =
    "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\nSteps:\n1. Restart the worker\n";

#[test]
fn a_task_id_off_pattern_is_refused_before_anything_else() {
    for task in [
        "hal-1",
        "HAL-",
        "HAL-1;x",
        "HAL-1\n",
        "../HAL-1",
        "HAL-12345678",
    ] {
        assert_eq!(
            check_input(task, BRIEF, "sha256-abc"),
            Some(ServerSessionAnswer::Refused {
                reason: "the task id isn't like HAL-1234".to_owned()
            }),
            "{task:?}"
        );
    }
}

#[test]
fn a_brief_for_another_task_or_a_hash_that_is_text_is_refused() {
    assert!(check_input("HAL-99", BRIEF, "sha256-abc").is_some());
    assert!(check_input("HAL-1234", BRIEF, "not a hash; rm").is_some());
    assert!(check_input("HAL-1234", BRIEF, "").is_some());
    assert_eq!(check_input("HAL-1234", BRIEF, "sha256-abc"), None);
}

#[test]
fn the_answers_are_kinds_the_page_knows_and_hold_no_path() {
    let answers = [
        (
            ServerSessionAnswer::TerminalOpened,
            json!({"kind": "terminal-opened"}),
        ),
        (ServerSessionAnswer::Cancelled, json!({"kind": "cancelled"})),
        (
            ServerSessionAnswer::NoTerminal,
            json!({"kind": "no-terminal"}),
        ),
        (
            ServerSessionAnswer::NotConfigured,
            json!({"kind": "not-configured"}),
        ),
        (
            ServerSessionAnswer::UnsupportedPlatform,
            json!({"kind": "unsupported-platform"}),
        ),
        (
            super::refused("the brief is over 8 KB"),
            json!({"kind": "refused", "reason": "the brief is over 8 KB"}),
        ),
    ];
    for (answer, expected) in answers {
        assert_eq!(serde_json::to_value(&answer).expect("JSON"), expected);
    }
}

#[test]
fn a_second_launch_within_a_minute_is_ignored_and_a_cancel_frees_it() {
    let state = ServerSessionState::default();
    let now = Instant::now();
    assert!(state.take_turn("sha256-abc", now));
    assert!(!state.take_turn("sha256-abc", now + Duration::from_secs(30)));
    assert!(state.take_turn("sha256-def", now));
    assert!(state.take_turn("sha256-abc", now + Duration::from_secs(61)));
    state.forget("sha256-def");
    assert!(state.take_turn("sha256-def", now + Duration::from_secs(1)));
}

#[test]
fn the_dialog_names_the_server_and_task_and_shows_the_whole_brief() {
    let target = validate_target(
        Some(&json!("build.acme.example")),
        Some(&json!("ops")),
        None,
    )
    .expect("a valid target");
    let text = question(&target, "HAL-1234", BRIEF);
    assert!(text.starts_with("Start Claude Code on ops@build.acme.example for HAL-1234?"));
    assert!(text.ends_with(BRIEF));
}
