// Tests for studio.src-tauri.keep-awake-command: each name starts with
// `keep_awake_command_` until the trace check reads `cargo test` results.
// The lock's rules are tested with fakes in `crates/keep-awake`; these
// never turn both switches on, so no test holds this computer's real lock.

use super::*;

#[test]
fn keep_awake_command_holds_nothing_when_the_shell_starts() {
    let state = KeepAwakeState::default();
    let rules = state.keep.lock().unwrap_or_else(PoisonError::into_inner);
    assert!(!rules.holding());
    assert!(!rules.watching());
}

#[test]
fn keep_awake_command_holds_nothing_with_either_switch_off() {
    let state = KeepAwakeState::default();
    assert_eq!(set(&state, true, false), Ok(false));
    assert_eq!(set(&state, false, true), Ok(false));
    assert_eq!(set(&state, false, false), Ok(false));
}

#[test]
fn keep_awake_command_refuses_in_words_the_page_maps() {
    let refusal = serde_json::to_value(KeepAwakeRefusal::Failed).ok();
    assert_eq!(refusal, Some(serde_json::json!("failed")));
}

#[test]
fn keep_awake_command_is_granted_to_the_main_window_only_and_never_served() {
    let capability: Option<serde_json::Value> =
        serde_json::from_str(include_str!("../capabilities/desktop-keep-awake.json")).ok();
    let capability = capability.unwrap_or_default();
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], serde_json::json!(["main"]));
    assert!(capability.get("remote").is_none());
    assert_eq!(
        capability["permissions"],
        serde_json::json!(["allow-keep-awake-set"])
    );
}
