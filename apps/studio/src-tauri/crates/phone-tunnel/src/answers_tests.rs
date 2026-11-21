//! The exact shape of every answer and status the page gets: a field
//! outside these would fail here, so no key can slip into one.

use halonic_device_keys::{ComputerDetails, ComputerId, DeviceKeyError, PairedComputer, Standing};
use halonic_tunnel::{ConnectError, PairRefusedReason, PairingProblem, PhoneStatus, SessionError};
use serde_json::{Value, json};

use crate::answers::{
    ComputerView, ComputersAnswer, ConnectOutcome, ForgetOutcome, PairingOutcome, PairingStep,
    Problem,
};
use crate::status::{PageStatus, Reason};

fn shape(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("serialises")
}

fn computer(standing: Standing) -> PairedComputer {
    PairedComputer {
        id: ComputerId::parse("desk").unwrap(),
        details: Some(ComputerDetails {
            name: "Desk".to_owned(),
            endpoints: vec!["tcp://192.168.1.20:4100".to_owned()],
            standing,
            paired_at_ms: 1_000,
            last_connected_at_ms: Some(2_000),
        }),
    }
}

#[test]
fn phone_tunnel_answers_have_exactly_their_fields() {
    let step = PairingStep::Check {
        computer_name: "Desk".to_owned(),
        check_code: "4F72KQ".to_owned(),
    };
    assert_eq!(
        shape(step),
        json!({ "kind": "check", "computerName": "Desk", "checkCode": "4F72KQ" })
    );
    let view = ComputerView::from(&computer(Standing::Paired { host_key: [7; 32] }));
    let listed = json!({
        "id": "desk",
        "standing": "paired",
        "name": "Desk",
        "endpoints": ["tcp://192.168.1.20:4100"],
        "pairedAtMs": 1000,
        "lastConnectedAtMs": 2000,
    });
    assert_eq!(shape(&view), listed);
    assert_eq!(
        shape(PairingOutcome::Paired(view.clone())),
        json!({ "kind": "paired", "computer": listed })
    );
    assert_eq!(
        shape(ComputersAnswer::Computers(vec![view])),
        json!({ "kind": "computers", "computers": [listed] })
    );
    assert_eq!(
        shape(ConnectOutcome::Connecting),
        json!({ "kind": "connecting" })
    );
    assert_eq!(
        shape(ForgetOutcome::Forgotten),
        json!({ "kind": "forgotten" })
    );
}

#[test]
fn phone_tunnel_answers_say_each_standing_without_the_pinned_key() {
    let cant_confirm = ComputerView::from(&computer(Standing::CantConfirm { host_key: [7; 32] }));
    assert_eq!(shape(&cant_confirm)["standing"], "cant-confirm");
    let removed = ComputerView::from(&computer(Standing::Removed));
    assert_eq!(shape(&removed)["standing"], "removed");
    let unreadable = ComputerView::from(&PairedComputer {
        id: ComputerId::parse("desk").unwrap(),
        details: None,
    });
    assert_eq!(
        shape(&unreadable),
        json!({ "id": "desk", "standing": "unreadable", "endpoints": [] })
    );
}

#[test]
fn phone_tunnel_answers_give_problems_as_typed_kinds() {
    let cases = [
        (
            Problem::WrongCode { tries_left: 3 },
            json!({ "kind": "wrong-code", "triesLeft": 3 }),
        ),
        (Problem::CodeEnded, json!({ "kind": "code-ended" })),
        (Problem::Denied, json!({ "kind": "denied" })),
        (Problem::TimedOut, json!({ "kind": "timed-out" })),
        (
            Problem::HandshakeFailed,
            json!({ "kind": "handshake-failed" }),
        ),
        (
            Problem::CantReach {
                reason: Reason::NetworkDown,
            },
            json!({ "kind": "cant-reach", "reason": "network-down" }),
        ),
        (
            Problem::NoLocalNetwork { ask_again: true },
            json!({ "kind": "no-local-network", "askAgain": true }),
        ),
        (Problem::NotPaired, json!({ "kind": "not-paired" })),
        (Problem::KeyUnreadable, json!({ "kind": "key-unreadable" })),
        (
            Problem::KeysUnavailable,
            json!({ "kind": "keys-unavailable" }),
        ),
    ];
    for (problem, expected) in cases {
        assert_eq!(shape(problem), expected);
        assert_eq!(shape(ConnectOutcome::Stopped(problem)), expected);
        assert_eq!(shape(PairingStep::Stopped(problem)), expected);
    }
}

#[test]
fn phone_tunnel_answers_map_the_crates_errors() {
    let refused = |reason, tries_left| {
        Problem::from(PairingProblem::Session(SessionError::PairRefused {
            reason,
            tries_left,
        }))
    };
    assert_eq!(
        refused(PairRefusedReason::WrongCode, 4),
        Problem::WrongCode { tries_left: 4 }
    );
    // The fifth wrong try ends the code.
    assert_eq!(refused(PairRefusedReason::WrongCode, 0), Problem::CodeEnded);
    assert_eq!(refused(PairRefusedReason::CodeUsed, 0), Problem::CodeUsed);
    assert_eq!(
        refused(PairRefusedReason::RateLimited, 0),
        Problem::RateLimited
    );
    assert_eq!(
        Problem::from(PairingProblem::Session(SessionError::CantConfirm)),
        Problem::HandshakeFailed
    );
    assert_eq!(
        Problem::from(PairingProblem::Session(SessionError::Unreadable)),
        Problem::Unreadable
    );
    assert_eq!(
        Problem::from(PairingProblem::CantReach(ConnectError::Timeout)),
        Problem::CantReach {
            reason: Reason::Timeout
        }
    );
    assert_eq!(Problem::from(PairingProblem::Denied), Problem::Denied);
    assert_eq!(Problem::from(PairingProblem::TimedOut), Problem::TimedOut);
    assert_eq!(
        Problem::from(DeviceKeyError::Unreadable),
        Problem::KeyUnreadable
    );
    assert_eq!(
        Problem::from(DeviceKeyError::Storage {
            message: "disk full".to_owned()
        }),
        Problem::KeysUnavailable
    );
}

#[test]
fn phone_tunnel_statuses_have_exactly_their_fields() {
    let reconnecting = PageStatus::from_phone(PhoneStatus::Reconnecting {
        last_try: Some(ConnectError::Refused),
    });
    assert_eq!(
        shape(reconnecting),
        json!({ "state": "reconnecting", "lastTry": "refused" })
    );
    assert_eq!(
        shape(reconnecting.with_next_try(5_000)),
        json!({ "state": "reconnecting", "lastTry": "refused", "nextTryAtMs": 5000 })
    );
    assert_eq!(PageStatus::Connected.with_next_try(5_000), None);
    for (status, state) in [
        (PhoneStatus::Connecting, "connecting"),
        (PhoneStatus::Connected, "connected"),
        (PhoneStatus::CantConfirm, "cant-confirm"),
        (PhoneStatus::Removed, "removed"),
        (PhoneStatus::Paused, "paused"),
        (PhoneStatus::Closed, "closed"),
    ] {
        assert_eq!(
            shape(PageStatus::from_phone(status)),
            json!({ "state": state })
        );
    }
}
