//! The shell's own question before one of Settings › Remote's three saves
//! reaches the agent host (HAL-17795): turning remote on, letting phones
//! answer risky approvals, and allowing a phone to pair. The page sends them
//! through `agent_host_request`, and a compromised page could send them
//! without the person's click. So, as for the yes to run without the sandbox
//! (`agent_host_unfenced_allow.rs`), the shell asks in a native dialog the
//! page can't draw or answer. When the person doesn't say yes, nothing
//! reaches the host, nothing changes, and the page gets the refusal
//! `declined`. Turning remote or the risky approvals off, and not allowing a
//! phone, pass without asking.

use serde_json::Value;
use tauri::{AppHandle, Runtime};

use halonic_agent_host::{Method, Route};

use super::HostRefusal;
use crate::native_dialogs::{
    ask_to_allow_pairing, ask_to_allow_risky_remotely, ask_to_turn_remote_on,
};

/// Which of the three questions a save asks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemoteQuestion {
    TurnOn,
    AllowRisky,
    AllowPairing,
}

/// Asks the person before `route` with `body` is sent when it is one of the
/// three saves and turns something on; any other call passes without
/// asking. The question waits on a worker thread, so the page's other calls
/// keep going while the dialog is open.
pub(super) async fn ask_before_remote_save<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<&Value>,
) -> Result<(), HostRefusal> {
    let Some(question) = question_for(route, body) else {
        return Ok(());
    };
    let asking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        asked(Some(question), |question| match question {
            RemoteQuestion::TurnOn => ask_to_turn_remote_on(&asking),
            RemoteQuestion::AllowRisky => ask_to_allow_risky_remotely(&asking),
            RemoteQuestion::AllowPairing => ask_to_allow_pairing(&asking),
        })
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

/// `Ok` when the call may be sent: it asks no `question`, or `ask` said yes.
fn asked(
    question: Option<RemoteQuestion>,
    ask: impl FnOnce(RemoteQuestion) -> bool,
) -> Result<(), HostRefusal> {
    match question {
        None => Ok(()),
        Some(question) if ask(question) => Ok(()),
        Some(_) => Err(HostRefusal::new(
            "declined",
            "Nothing was saved because the confirmation window was cancelled.",
        )),
    }
}

/// The question `route` with `body` asks; `None` for any other route, and
/// for a save whose field is a plain `false`. Anything else, a missing or
/// odd field included, asks: the host refuses a body it doesn't expect, so
/// asking for it costs nothing, and not asking could let a yes through.
fn question_for(route: Route, body: Option<&Value>) -> Option<RemoteQuestion> {
    if route.method != Method::Post {
        return None;
    }
    let (question, field) = match route.path {
        "/v1/remote/on" => (RemoteQuestion::TurnOn, "on"),
        "/v1/remote/allow-risky" => (RemoteQuestion::AllowRisky, "allow"),
        "/v1/remote/pairing/answer" => (RemoteQuestion::AllowPairing, "allow"),
        _ => return None,
    };
    let says_no = body
        .and_then(|body| body.get(field))
        .and_then(Value::as_bool)
        == Some(false);
    (!says_no).then_some(question)
}

/// Requirement `remote-saves-ask`: the three saves reach the host only after
/// the person's yes in the shell's own dialog.
#[cfg(test)]
mod tests {
    use halonic_agent_host::{Answer, find_route};
    use serde_json::json;

    use super::*;

    fn route(name: &str) -> Route {
        find_route(name, Answer::Json).expect("a route of the host's table")
    }

    /// Sends `name` with `body` through the gate, answering its question
    /// `yes`, and gives the answer and the question it asked.
    fn send(
        name: &str,
        body: Value,
        yes: bool,
    ) -> (Result<(), HostRefusal>, Option<RemoteQuestion>) {
        let mut was_asked = None;
        let answer = asked(question_for(route(name), Some(&body)), |question| {
            was_asked = Some(question);
            yes
        });
        (answer, was_asked)
    }

    const SAVES: [(&str, &str, RemoteQuestion); 3] = [
        ("POST /v1/remote/on", "on", RemoteQuestion::TurnOn),
        (
            "POST /v1/remote/allow-risky",
            "allow",
            RemoteQuestion::AllowRisky,
        ),
        (
            "POST /v1/remote/pairing/answer",
            "allow",
            RemoteQuestion::AllowPairing,
        ),
    ];

    #[test]
    fn a_save_that_turns_something_on_is_not_sent_without_the_persons_yes() {
        for (name, field, question) in SAVES {
            let body = json!({ field: true, "pairing": "p1" });
            let (answer, was_asked) = send(name, body, false);
            assert_eq!(was_asked, Some(question), "{name} asks");
            assert_eq!(answer.expect_err("declined").kind, "declined", "{name}");
        }
    }

    #[test]
    fn a_save_that_turns_something_on_is_sent_after_the_persons_yes() {
        for (name, field, question) in SAVES {
            let body = json!({ field: true, "pairing": "p1" });
            let (answer, was_asked) = send(name, body, true);
            assert_eq!(was_asked, Some(question), "{name} asks");
            assert!(answer.is_ok(), "{name} is sent");
        }
    }

    #[test]
    fn a_save_without_a_plain_false_asks() {
        for (name, field, question) in SAVES {
            for body in [json!({}), json!({ field: "false" }), json!({ field: null })] {
                let (answer, was_asked) = send(name, body.clone(), false);
                assert_eq!(was_asked, Some(question), "{name} with {body} asks");
                assert!(answer.is_err(), "{name} with {body} isn't sent");
            }
        }
    }

    #[test]
    fn turning_off_and_saying_no_are_sent_without_asking() {
        for (name, field, _) in SAVES {
            let (answer, was_asked) = send(name, json!({ field: false, "pairing": "p1" }), false);
            assert_eq!(was_asked, None, "{name} with false isn't asked");
            assert!(answer.is_ok(), "{name} with false is sent");
        }
    }

    #[test]
    fn other_routes_are_sent_without_asking() {
        for name in [
            "POST /v1/remote/revoke",
            "POST /v1/remote/revoke-all",
            "POST /v1/remote/pairing/new-code",
            "POST /v1/remote/pairing/close",
            "POST /v1/unfenced-runs/take-back",
        ] {
            let (answer, was_asked) = send(name, json!({ "on": true, "allow": true }), false);
            assert_eq!(was_asked, None, "{name} isn't asked");
            assert!(answer.is_ok(), "{name} is sent");
        }
    }
}
