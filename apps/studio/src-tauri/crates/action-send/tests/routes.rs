//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The route list loads only when every route can be checked: a fixed
//! service, plain path templates, matching placeholders and patterns the
//! shell can read. Any problem refuses the whole list.

mod support;

use halonic_action_send::{Pattern, RouteList};
use serde_json::{Value, json};
use support::ACME_ROUTES;

fn acme() -> Value {
    serde_json::from_str(ACME_ROUTES).expect("json")
}

fn with_first_route(change: impl FnOnce(&mut Value)) -> Result<RouteList, String> {
    let mut list = acme();
    change(&mut list["routes"][0]);
    RouteList::parse(&list.to_string())
}

#[test]
fn the_acme_list_loads() {
    let list = RouteList::parse(ACME_ROUTES).expect("loads");
    assert_eq!(list.calls.len(), 6);
    assert_eq!(list.guided.len(), 1);
}

#[test]
fn another_format_or_an_unknown_key_is_refused() {
    let mut list = acme();
    list["format"] = json!("halonic.action-routes/2");
    assert!(RouteList::parse(&list.to_string()).is_err());
    assert!(with_first_route(|route| route["origin"] = json!("https://evil.example")).is_err());
    assert!(with_first_route(|route| route["headers"] = json!({})).is_err());
}

#[test]
fn a_service_without_a_fixed_origin_in_the_shell_is_refused() {
    assert!(with_first_route(|route| route["service"] = json!("evil")).is_err());
}

#[test]
fn a_path_that_could_leave_the_origin_is_refused() {
    for path in [
        "//evil.example/repos",
        "https://evil.example/repos",
        "repos/{owner}",
        "/repos/../{owner}/{repo}/{runId}",
        "/repos/{owner}/{repo}/runs/{runId}?x=1",
        "/repos/{owner}{repo}/{runId}",
        "/repos/{owner}/{repo}/%2F/{runId}",
    ] {
        assert!(
            with_first_route(|route| route["path"] = json!(path)).is_err(),
            "{path}"
        );
    }
}

#[test]
fn placeholders_must_match_the_template() {
    assert!(
        with_first_route(|route| {
            route["placeholders"]["extra"] = json!("^[a-z]{1,3}$");
        })
        .is_err()
    );
    assert!(
        with_first_route(|route| {
            route["path"] = json!("/repos/{owner}/{repo}/{owner}/{runId}");
        })
        .is_err()
    );
}

#[test]
fn a_pattern_the_shell_cant_read_is_refused() {
    for pattern in [
        "[a-z]+",
        "^.*$",
        "^(a|b)$",
        "^[a-z]{3,1}$",
        "^[a-z$",
        "^\\w+$",
    ] {
        assert!(
            with_first_route(|route| route["placeholders"]["owner"] = json!(pattern)).is_err(),
            "{pattern}"
        );
    }
}

#[test]
fn a_get_with_a_body_or_a_body_listed_twice_is_refused() {
    let field = json!({ "name": "value", "kind": "integer" });
    let get_with_body = |route: &mut Value| {
        route["method"] = json!("GET");
        route["body"] = json!([field.clone()]);
    };
    assert!(with_first_route(get_with_body).is_err());
    assert!(
        with_first_route(|route| route["body"] = json!([field.clone(), field.clone()])).is_err()
    );
    assert!(
        with_first_route(|route| route["body"] =
            json!([{ "name": "x", "kind": "constant", "value": { "a": 1 } }]))
        .is_err()
    );
    assert!(
        with_first_route(|route| route["body"] = json!([{ "name": "x", "kind": "string" }]))
            .is_err()
    );
}

#[test]
fn a_guided_page_off_its_services_web_origins_is_refused() {
    for address in [
        "https://evil.example/{owner}/{repo}/settings/variables/actions/new",
        "http://github.com/{owner}/{repo}/settings/variables/actions/new",
    ] {
        let mut list = acme();
        list["routes"][5]["address"] = json!(address);
        assert!(RouteList::parse(&list.to_string()).is_err(), "{address}");
    }
}

#[test]
fn a_step_listed_twice_is_refused() {
    let mut list = acme();
    let first = list["routes"][0].clone();
    list["routes"].as_array_mut().expect("an array").push(first);
    assert!(RouteList::parse(&list.to_string()).is_err());
}

#[test]
fn patterns_match_whole_values() {
    let owner = Pattern::parse("^[A-Za-z0-9-]{1,39}$").expect("reads");
    assert!(owner.matches("acme-admin"));
    assert!(!owner.matches(""));
    assert!(!owner.matches("acme/admin"));
    assert!(!owner.matches(&"a".repeat(40)));
    let name = Pattern::parse("^[A-Z][A-Z0-9_]{0,63}$").expect("reads");
    assert!(name.matches("RELEASE_CHANNEL"));
    assert!(!name.matches("release"));
    let digits = Pattern::parse("^\\d+$").expect("reads");
    assert!(digits.matches("123456"));
    assert!(!digits.matches("12a"));
    let not_slash = Pattern::parse("^[^/]+\\.json$").expect("reads");
    assert!(not_slash.matches("app.json"));
    assert!(!not_slash.matches("a/b.json"));
    let dash_last = Pattern::parse("^[a-z_-]?x$").expect("reads");
    assert!(dash_last.matches("-x"));
    assert!(dash_last.matches("x"));
}

fn with_route(index: usize, change: impl FnOnce(&mut Value)) -> Result<RouteList, String> {
    let mut list = acme();
    change(&mut list["routes"][index]);
    RouteList::parse(&list.to_string())
}

/// The acme list's `irreversible` call, `acme.delete-repo`.
const DELETE_REPO: usize = 3;

#[test]
fn only_an_irreversible_call_names_a_target_from_its_own_placeholders() {
    // HAL-18085: the name the user types comes from the reviewed route.
    let refused = [
        with_route(DELETE_REPO, |route| {
            if let Some(route) = route.as_object_mut() {
                route.remove("target");
            }
        }),
        with_route(DELETE_REPO, |route| {
            route["target"] = json!("{owner}/{name}")
        }),
        with_route(DELETE_REPO, |route| route["target"] = json!("acme/app")),
        with_route(DELETE_REPO, |route| {
            route["target"] = json!("{owner}/{repo")
        }),
        with_route(DELETE_REPO, |route| {
            route["target"] = json!("{owner}}/{repo}")
        }),
        with_route(DELETE_REPO, |route| {
            route["target"] = json!("{owner}\u{202E}/{repo}")
        }),
        with_first_route(|route| route["target"] = json!("{owner}/{repo}")),
    ];
    for (index, list) in refused.iter().enumerate() {
        assert!(list.is_err(), "case {index}");
    }
    let mut list = acme();
    list["routes"][6]["target"] = json!("{owner}/{repo}");
    assert!(
        RouteList::parse(&list.to_string()).is_err(),
        "a guided step has no target"
    );
}
