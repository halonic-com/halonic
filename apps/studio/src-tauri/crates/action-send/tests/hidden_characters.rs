//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! A page value with a control character or one that changes the text's
//! direction never reaches the native confirmation, whatever the route's
//! pattern allows (Julian's review of HAL-17525). The route list here uses
//! loose `[^/]` patterns on purpose, so only that check can refuse them.

mod support;

use halonic_action_send::{Refusal, RouteList, SendResult};
use serde_json::{Value, json};
use support::{FakeDialogs, FakeKeychain, FakeLog, FakeNetwork, send_with};

const LOOSE_ROUTES: &str = r#"{
  "format": "halonic.action-routes/1",
  "webOrigins": [],
  "routes": [
    {
      "kind": "call",
      "definition": "acme.set-variable",
      "version": 1,
      "step": 1,
      "service": "github",
      "risk": "admin",
      "placeholders": { "owner": "^[^/]{1,39}$", "repo": "^[^/]{1,100}$" },
      "method": "PATCH",
      "path": "/repos/{owner}/{repo}/actions/variables/RELEASE",
      "body": [{ "name": "value", "kind": "string", "pattern": "^[^/]{1,200}$" }],
      "keep": []
    }
  ]
}"#;

fn send(owner: &str, value: &str) -> (SendResult, FakeNetwork, FakeDialogs) {
    let routes = RouteList::parse(LOOSE_ROUTES).expect("the list loads");
    let network = FakeNetwork::default();
    let dialogs = FakeDialogs::answering(true);
    let request: Value = json!({
        "definition": "acme.set-variable", "version": 1, "step": 1,
        "placeholders": { "owner": owner, "repo": "app" },
        "body": { "value": value }
    });
    let result = send_with(
        &routes,
        &network,
        &FakeKeychain::signed_in(),
        &dialogs,
        &FakeLog::default(),
        request,
    );
    (result, network, dialogs)
}

const HIDDEN: [&str; 9] = [
    "\u{0007}", "\u{001B}", "\u{007F}", "\u{0085}", "\u{200E}", "\u{200F}", "\u{202E}", "\u{2066}",
    "\u{2069}",
];

#[test]
fn a_hidden_character_in_a_body_value_is_refused_before_the_dialog() {
    for hidden in HIDDEN {
        let (result, network, dialogs) = send("acme", &format!("beta{hidden}ateb"));
        assert_eq!(
            result,
            SendResult::Refused {
                reason: Refusal::BadValue
            },
            "{hidden:?}"
        );
        assert!(dialogs.sheets.lock().expect("not poisoned").is_empty());
        assert!(network.calls().is_empty());
    }
}

#[test]
fn a_hidden_character_in_a_placeholder_is_refused_before_the_dialog() {
    for hidden in HIDDEN {
        let (result, network, dialogs) = send(&format!("acme{hidden}"), "beta");
        assert_eq!(
            result,
            SendResult::Refused {
                reason: Refusal::BadValue
            },
            "{hidden:?}"
        );
        assert!(dialogs.sheets.lock().expect("not poisoned").is_empty());
        assert!(network.calls().is_empty());
    }
}

#[test]
fn plain_values_on_the_loose_route_still_reach_the_dialog() {
    // Without this, a check that refused everything would pass the tests above.
    let (result, _, dialogs) = send("acme", "beta é");
    assert!(
        matches!(result, SendResult::Answered { status: 204, .. }),
        "{result:?}"
    );
    assert_eq!(dialogs.sheets.lock().expect("not poisoned").len(), 1);
}
