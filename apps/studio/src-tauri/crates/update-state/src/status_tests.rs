use super::{CheckFailure, JustUpdated, Unit, UpdateState, UpdateStatus, notes_url};
use serde_json::json;

#[test]
fn update_state_sends_the_status_in_the_agreed_shape() {
    let status = UpdateStatus {
        current: "0.1.0".to_owned(),
        automatic: true,
        checking: false,
        last_checked: Some(1_762_160_000_000),
        just_updated: Some(JustUpdated {
            from: "0.1.0".to_owned(),
            to: "0.1.1".to_owned(),
        }),
        state: UpdateState::Downloading {
            version: "0.1.1".to_owned(),
            done: 12,
            total: None,
            unit: Unit::Bytes,
        },
    };
    assert_eq!(
        serde_json::to_value(&status).expect("JSON"),
        json!({
            "current": "0.1.0",
            "automatic": true,
            "checking": false,
            "lastChecked": 1_762_160_000_000_u64,
            "justUpdated": { "from": "0.1.0", "to": "0.1.1" },
            "state": { "kind": "downloading", "version": "0.1.1", "done": 12, "total": null, "unit": "bytes" }
        })
    );
}

#[test]
fn update_state_names_each_state_as_the_plan_does() {
    let cases = [
        (
            UpdateState::NeverChecked,
            json!({ "kind": "never-checked" }),
        ),
        (
            UpdateState::CantCheck {
                reason: CheckFailure::NoAnswer,
            },
            json!({ "kind": "cant-check", "reason": "no-answer" }),
        ),
        (
            UpdateState::Ready {
                version: "0.1.1".to_owned(),
                notes_url: notes_url("0.1.1"),
            },
            json!({
                "kind": "ready",
                "version": "0.1.1",
                "notesUrl": "https://github.com/halonic-com/halonic/releases/tag/v0.1.1"
            }),
        ),
        (
            UpdateState::DidNotInstall {
                version: "0.1.1".to_owned(),
                attempts: 2,
            },
            json!({ "kind": "did-not-install", "version": "0.1.1", "attempts": 2 }),
        ),
    ];
    for (state, expected) in cases {
        assert_eq!(serde_json::to_value(&state).expect("JSON"), expected);
    }
}
