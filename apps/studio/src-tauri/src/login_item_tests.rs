// Tests for studio.src-tauri.login-item-commands: each name starts with
// `login_item_commands_` until the trace check reads `cargo test` results.

use std::path::PathBuf;

use halonic_login_item::{LoginItem, Place};

use super::*;

fn item_in(name: &str) -> (PathBuf, LoginItem) {
    let folder = std::env::temp_dir().join(format!(
        "halonic-login-item-commands-{name}-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&folder);
    let executable = std::env::temp_dir().join("Acme").join("Halonic");
    let item = LoginItem::at(executable, Place::File(folder.join("halonic.desktop")));
    (folder, item)
}

#[test]
fn login_item_commands_turn_on_then_off_and_answer_the_state() {
    let (folder, item) = item_in("on-off");
    assert_eq!(set(&item, true, true), Ok(true));
    assert_eq!(set(&item, false, false), Ok(false));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn login_item_commands_refuse_on_for_a_halonic_that_isnt_installed() {
    let (folder, item) = item_in("not-installed");
    assert_eq!(set(&item, true, false), Err(LoginItemRefusal::NotInstalled));
    assert_eq!(item.is_on(), Ok(false));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn login_item_commands_turn_off_wherever_halonic_runs_from() {
    let (folder, item) = item_in("off-anywhere");
    set(&item, true, true).expect("on");
    assert_eq!(set(&item, false, false), Ok(false));
    let _ = std::fs::remove_dir_all(&folder);
}

#[test]
fn login_item_commands_answer_refusals_as_words_without_a_path() {
    let words = serde_json::to_string(&[LoginItemRefusal::NotInstalled, LoginItemRefusal::Failed])
        .expect("serialised");
    assert_eq!(words, r#"["not_installed","failed"]"#);
}

#[test]
fn login_item_commands_are_granted_to_the_main_window_only_and_never_served() {
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/desktop-login-item.json"))
            .expect("the capability");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], serde_json::json!(["main"]));
    assert!(capability.get("remote").is_none());
    assert_eq!(
        capability["permissions"],
        serde_json::json!(["allow-login-item-get", "allow-login-item-set"])
    );
}
