// Tests for studio.src-tauri.app-shortcuts-commands: each name starts with
// `app_shortcuts_commands_` until the trace check reads `cargo test` results.

use std::cell::RefCell;

use super::*;

const COMPUTER: &str = "acme-desk_1";

/// What the shell was asked to delete, in order.
#[derive(Default)]
struct Recorded(RefCell<Vec<String>>);

impl KeptOfComputer for Recorded {
    fn clear_saved(&self, computer: &str) {
        self.0.borrow_mut().push(format!("saved {computer}"));
    }

    fn forget_last_chat(&self, computer: &str) {
        self.0.borrow_mut().push(format!("last chat {computer}"));
    }
}

fn both_cleared() -> Vec<String> {
    vec![format!("saved {COMPUTER}"), format!("last chat {COMPUTER}")]
}

#[test]
fn app_shortcuts_commands_forget_clears_the_computer_s_saved_text_and_last_chat() {
    let kept = Recorded::default();
    after_forget(&kept, COMPUTER, &ForgetOutcome::Forgotten);
    assert_eq!(kept.0.into_inner(), both_cleared());
}

#[test]
fn app_shortcuts_commands_a_forget_that_stopped_clears_nothing() {
    let kept = Recorded::default();
    after_forget(
        &kept,
        COMPUTER,
        &ForgetOutcome::Stopped(Problem::KeysUnavailable),
    );
    assert!(kept.0.into_inner().is_empty());
}

#[test]
fn app_shortcuts_commands_removed_clears_the_computer_s_saved_text_and_last_chat() {
    let kept = Recorded::default();
    after_status(&kept, COMPUTER, &PageStatus::Removed);
    assert_eq!(kept.0.into_inner(), both_cleared());
}

#[test]
fn app_shortcuts_commands_other_statuses_clear_nothing() {
    let kept = Recorded::default();
    after_status(&kept, COMPUTER, &PageStatus::Connected);
    after_status(&kept, COMPUTER, &PageStatus::Connecting);
    assert!(kept.0.into_inner().is_empty());
}
