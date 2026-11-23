//! The shell's own question before the yes to run plugins and integrations
//! without the sandbox is saved (HAL-16466). The page asks first, but the
//! page sends `POST /v1/unfenced-runs/allow` through `agent_host_request`,
//! and a compromised page could send it without asking. So before the shell
//! passes that call on, it asks the person in a native dialog the page can't
//! draw or answer. When the person doesn't say yes, nothing reaches the host,
//! nothing is saved, and the page gets the refusal `declined`.

use tauri::{AppHandle, Runtime};

use halonic_agent_host::{Method, Route};

use super::HostRefusal;
use crate::native_dialogs::ask_to_allow_without_sandbox;

/// The host's route that saves the yes.
const ALLOW_PATH: &str = "/v1/unfenced-runs/allow";

/// Asks the person before `route` is sent when it saves the yes; any other
/// route passes without asking. The question waits on a worker thread, so
/// the page's other calls keep going while the dialog is open.
pub(super) async fn ask_before_allow<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
) -> Result<(), HostRefusal> {
    if !saves_the_yes(route) {
        return Ok(());
    }
    let asking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        asked(route, || ask_to_allow_without_sandbox(&asking))
    })
    .await
    .map_err(|error| HostRefusal::new("io", error))?
}

/// `Ok` when `route` may be sent: it doesn't save the yes, or `ask` said
/// yes.
fn asked(route: Route, ask: impl FnOnce() -> bool) -> Result<(), HostRefusal> {
    if !saves_the_yes(route) || ask() {
        return Ok(());
    }
    Err(HostRefusal::new(
        "declined",
        "Nothing was saved: you didn't allow it in Halonic's own question.",
    ))
}

fn saves_the_yes(route: Route) -> bool {
    route.method == Method::Post && route.path == ALLOW_PATH
}

/// Requirement `unfenced-allow-asks`: the yes is sent to the host only after
/// the person's yes in the shell's own dialog.
#[cfg(test)]
mod tests {
    use halonic_agent_host::{Answer, find_route};

    use super::*;

    fn route(name: &str) -> Route {
        find_route(name, Answer::Json).expect("a route of the host's table")
    }

    /// `asked` for the route `name`, answering the question `yes`, and
    /// whether it was asked.
    fn ask(name: &str, yes: bool) -> (Result<(), HostRefusal>, bool) {
        let mut was_asked = false;
        let answer = asked(route(name), || {
            was_asked = true;
            yes
        });
        (answer, was_asked)
    }

    #[test]
    fn the_yes_is_not_sent_without_the_persons_yes() {
        let (answer, was_asked) = ask("POST /v1/unfenced-runs/allow", false);
        assert!(was_asked);
        assert_eq!(answer.expect_err("declined").kind, "declined");
    }

    #[test]
    fn the_yes_is_sent_after_the_persons_yes() {
        let (answer, was_asked) = ask("POST /v1/unfenced-runs/allow", true);
        assert!(was_asked);
        assert!(answer.is_ok());
    }

    #[test]
    fn other_routes_are_sent_without_asking() {
        for name in [
            "GET /v1/unfenced-runs",
            "POST /v1/unfenced-runs/take-back",
            "POST /v1/plugins/call",
        ] {
            let (answer, was_asked) = ask(name, false);
            assert!(!was_asked, "{name} isn't asked");
            assert!(answer.is_ok(), "{name} is sent");
        }
    }
}
