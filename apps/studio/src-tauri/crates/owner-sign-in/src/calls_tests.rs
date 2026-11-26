//! Requirement `deployment-call-commands`: which route, which run and which
//! origin the shell calls for the page, and what it refuses.

use halonic_secrets::{MemoryBackend, SecretBackend};

use super::*;
use crate::stored::StoredSession;

const ORIGIN: &str = "https://halonic.example:443";
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// A keychain that keeps a session for `origin`.
fn signed_in_to(origin: &str) -> MemoryBackend {
    let keychain = MemoryBackend::default();
    let stored = StoredSession {
        origin: origin.to_owned(),
        session: TOKEN.to_owned(),
        signed_in_at: 0,
    };
    let name = session_name(origin).expect("a name");
    let value = serde_json::to_string(&stored).expect("serialisable");
    keychain.set(&name, &value).expect("kept");
    keychain
}

#[test]
fn deployment_call_commands_know_only_three_read_routes() {
    let named = |name| DeploymentRoute::named(name);
    assert_eq!(
        named("GET /api/waiting-runs"),
        Some(DeploymentRoute::WaitingRuns)
    );
    assert_eq!(named("GET /api/runs/{run}"), Some(DeploymentRoute::Run));
    assert_eq!(
        named("GET /api/runs/{run}/events"),
        Some(DeploymentRoute::RunEvents)
    );
    for other in [
        "POST /api/runs/{run}/events",
        "POST /api/runs/{run}/cancel",
        "POST /api/runs",
        "GET /api/workspace",
        "GET /api/runs/run_1",
        "/api/waiting-runs",
        "get /api/waiting-runs",
        "",
    ] {
        assert_eq!(named(other), None, "{other}");
    }
    assert!(DeploymentRoute::RunEvents.streams());
    assert!(!DeploymentRoute::Run.streams());
}

#[test]
fn deployment_call_commands_build_the_path_from_a_run_id_only() {
    assert_eq!(
        DeploymentRoute::WaitingRuns.path(None),
        Ok("/api/waiting-runs".to_owned())
    );
    let run = "run_0b6c1e9e-1d2f-4c56-9a1d-3f2e1b0c9d8a";
    assert_eq!(
        DeploymentRoute::Run.path(Some(run)),
        Ok(format!("/api/runs/{run}"))
    );
    assert_eq!(
        DeploymentRoute::RunEvents.path(Some(run)),
        Ok(format!("/api/runs/{run}/events"))
    );
    let too_long = "r".repeat(129);
    for bad in [
        "",
        ".",
        "..",
        ".hidden",
        "a/b",
        "a%2Fb",
        "a?b",
        "a#b",
        "a b",
        "a\\b",
        "nul",
        too_long.as_str(),
    ] {
        assert_eq!(
            DeploymentRoute::Run.path(Some(bad)),
            Err(CallRefusal::BadRun),
            "{bad}"
        );
        assert_eq!(
            DeploymentRoute::RunEvents.path(Some(bad)),
            Err(CallRefusal::BadRun),
            "{bad}"
        );
    }
    assert_eq!(DeploymentRoute::Run.path(None), Err(CallRefusal::BadRun));
    assert_eq!(
        DeploymentRoute::WaitingRuns.path(Some("run_1")),
        Err(CallRefusal::BadRun)
    );
}

#[test]
fn deployment_call_commands_send_the_session_only_to_its_own_origin() {
    let keychain = signed_in_to(ORIGIN);
    let cookie = format!("{SESSION_COOKIE}={TOKEN}");
    // The same origin, however the page spells it.
    for same in [
        ORIGIN,
        "https://halonic.example",
        "https://HALONIC.example/",
    ] {
        assert_eq!(
            session_for(&keychain, same),
            Ok((ORIGIN.to_owned(), cookie.clone())),
            "{same}"
        );
    }
    for other in [
        "https://halonic.example:8443",
        "https://other.example",
        "https://halonic.example.other.example",
    ] {
        assert_eq!(
            session_for(&keychain, other),
            Err(CallRefusal::NotSignedIn),
            "{other}"
        );
    }
    assert_eq!(
        session_for(&keychain, "http://halonic.example"),
        Err(CallRefusal::Owner(OwnerError::NotHttps))
    );
    assert_eq!(
        session_for(&keychain, "https://halonic.example/api/runs"),
        Err(CallRefusal::Owner(OwnerError::NotAnAddress))
    );
}

#[test]
fn deployment_call_commands_never_use_a_session_kept_for_another_origin() {
    // An entry whose name is this origin's but which was made for another.
    let keychain = MemoryBackend::default();
    let stored = StoredSession {
        origin: "https://other.example:443".to_owned(),
        session: TOKEN.to_owned(),
        signed_in_at: 0,
    };
    let name = session_name(ORIGIN).expect("a name");
    let value = serde_json::to_string(&stored).expect("serialisable");
    keychain.set(&name, &value).expect("kept");
    assert_eq!(
        session_for(&keychain, ORIGIN),
        Err(CallRefusal::NotSignedIn)
    );
}

#[test]
fn deployment_call_commands_refuse_a_redirect() {
    for status in [301, 302, 303, 307, 308, 300, 399] {
        assert_eq!(
            not_redirected(status),
            Err(CallRefusal::Redirected),
            "{status}"
        );
    }
    for status in [200, 204, 401, 404, 429, 500] {
        assert_eq!(not_redirected(status), Ok(status), "{status}");
    }
}

#[test]
fn deployment_call_commands_answer_a_refusal_with_a_code_only() {
    assert_eq!(CallRefusal::UnknownRoute.code(), "unknownRoute");
    assert_eq!(CallRefusal::BadRun.code(), "badRun");
    assert_eq!(CallRefusal::NotSignedIn.code(), "notSignedIn");
    assert_eq!(CallRefusal::Redirected.code(), "redirected");
    assert_eq!(
        CallRefusal::Owner(OwnerError::InvalidCertificate).code(),
        "invalidCertificate"
    );
}
