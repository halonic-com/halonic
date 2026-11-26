//! What `owner_check_available` answers for each phone (requirement
//! `owner-check-available-command`), with the crate's fake owner check.

use halonic_owner_check::{Availability, FakeOwnerCheck};

use super::{OwnerCheckReady, ready_with};

fn ready(check: &FakeOwnerCheck) -> OwnerCheckReady {
    tauri::async_runtime::block_on(ready_with(check))
}

#[test]
fn owner_check_available_is_ready_for_both_with_a_fingerprint() {
    let check = FakeOwnerCheck::new();
    assert_eq!(
        ready(&check),
        OwnerCheckReady {
            approval: true,
            answer: true
        }
    );
}

#[test]
fn owner_check_available_with_only_a_pin_is_ready_for_inbox_answers_only() {
    // HAL-19060: the shell takes the PIN for an Inbox answer, so the page
    // turns those answers on; a risky approval still needs a biometric.
    let check = FakeOwnerCheck::new();
    check.set_availability(Availability::NoStrongBiometric);
    check.set_screen_lock(true);
    assert_eq!(
        ready(&check),
        OwnerCheckReady {
            approval: false,
            answer: true
        }
    );
}

#[test]
fn owner_check_available_without_a_screen_lock_is_ready_for_neither() {
    let check = FakeOwnerCheck::new();
    check.set_availability(Availability::NotEnrolled);
    assert_eq!(ready(&check), OwnerCheckReady::default());
}

#[test]
fn owner_check_available_answers_two_booleans_and_nothing_else() {
    // Nothing about which biometric is enrolled, nor why it can't ask.
    let answer = serde_json::to_value(OwnerCheckReady {
        approval: false,
        answer: true,
    })
    .expect("serialises");
    assert_eq!(
        answer,
        serde_json::json!({ "approval": false, "answer": true })
    );
}
