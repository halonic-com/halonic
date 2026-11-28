//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The Paperclip admin key's list of calls (note on HAL-17491, row C1; plan
//! OK on HAL-21110): it refuses any secrets call other than creating or
//! rotating the one secret the lookup found, and anything outside secrets.

use halonic_action_send::paperclip_calls::is_allowed;

const COMPANY: &str = "c0ffee00-acme";

#[test]
fn the_admin_key_may_make_only_its_own_calls() {
    let rotating = Some("sec-1");
    for (method, path) in [
        ("GET", "/api/cli-auth/me"),
        ("GET", "/api/companies/c0ffee00-acme"),
        ("GET", "/api/companies/c0ffee00-acme/secrets/catalog"),
        ("POST", "/api/companies/c0ffee00-acme/secrets"),
        ("POST", "/api/secrets/sec-1/rotate"),
    ] {
        assert!(
            is_allowed(method, path, COMPANY, rotating),
            "{method} {path}"
        );
    }
    for (method, path) in [
        // Listing secrets with their details, or reading one.
        ("GET", "/api/companies/c0ffee00-acme/secrets"),
        ("GET", "/api/secrets/sec-1"),
        ("GET", "/api/secrets/sec-1/usage"),
        // Deleting or changing one.
        ("DELETE", "/api/secrets/sec-1"),
        ("PATCH", "/api/secrets/sec-1"),
        // Rotating a secret the lookup didn't find.
        ("POST", "/api/secrets/sec-2/rotate"),
        // Another company, or the same calls with another method.
        ("POST", "/api/companies/other-company/secrets"),
        ("GET", "/api/companies/c0ffee00-acme/secrets/catalog/"),
        ("DELETE", "/api/companies/c0ffee00-acme/secrets"),
        // An agent's configuration or a person's secrets.
        ("PATCH", "/api/agents/agent-1"),
        ("POST", "/api/companies/c0ffee00-acme/me/user-secrets"),
    ] {
        assert!(
            !is_allowed(method, path, COMPANY, rotating),
            "{method} {path}"
        );
    }
    assert!(!is_allowed(
        "POST",
        "/api/secrets/sec-1/rotate",
        COMPANY,
        None
    ));
    assert!(!is_allowed(
        "POST",
        "/api/secrets/../rotate",
        COMPANY,
        Some("..")
    ));
}
