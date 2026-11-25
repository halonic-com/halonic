//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The shell's own pattern matcher stays fast on patterns that make a plain
//! backtracking search explode (Liam's review of HAL-17525). Without the
//! memo, the cases below would take longer than the test run's time limit.

use halonic_action_send::{MAX_VALUE_CHARS, Pattern};

#[test]
fn stacked_repeats_finish_on_a_long_value_that_doesnt_match() {
    let pattern = Pattern::parse("^a*a*a*a*a*a*a*a*a*a*a*a*b$").expect("reads");
    let value = format!("{}c", "a".repeat(MAX_VALUE_CHARS - 1));
    assert!(!pattern.matches(&value));
    let classes = Pattern::parse("^[a-z]*[a-z0-9]*[a-z-]*[a-z_]*[0-9]$").expect("reads");
    assert!(!classes.matches(&"a".repeat(MAX_VALUE_CHARS)));
}

#[test]
fn the_memo_keeps_the_answers_the_same() {
    let pattern = Pattern::parse("^a*a*a*b$").expect("reads");
    assert!(pattern.matches("aaab"));
    assert!(pattern.matches("b"));
    assert!(!pattern.matches("aaa"));
    assert!(!pattern.matches("aaabb"));
    let counted = Pattern::parse("^[a-z]{2,3}[0-9]?x$").expect("reads");
    assert!(counted.matches("abx"));
    assert!(counted.matches("abc1x"));
    assert!(!counted.matches("ax"));
    assert!(!counted.matches("abcdx"));
}
