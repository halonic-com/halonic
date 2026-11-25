//! Requirement `studio.src-tauri.crates.action-send.action-pages`.
//!
//! `action_open_guided` and `action_open_page` open only reviewed pages:
//! a guided step's address from its route, and a `browser` block's address
//! on an allow-listed host and path prefix (HAL-17525; architecture note on
//! HAL-17491, 7.1).

mod support;

use halonic_action_send::{
    ANY_PAGE_GAP_MS, OpenLimiter, Refusal, SAME_PAGE_GAP_MS, StepRef, open_guided, open_page,
};
use serde_json::json;
use support::routes;

const PAGE: &str = "https://github.com/acme/app/settings/variables/actions";

fn opened(address: &str) -> Result<String, Refusal> {
    open_page(&routes(), &OpenLimiter::default(), address, 10_000)
        .map(|page| page.to_string())
        .map_err(|(reason, _)| reason)
}

#[test]
fn a_page_under_an_allowed_prefix_opens() {
    assert_eq!(opened(PAGE), Ok(PAGE.to_owned()));
    assert_eq!(
        opened("https://GitHub.com/acme/app/settings/rules/"),
        Ok("https://github.com/acme/app/settings/rules/".to_owned())
    );
}

#[test]
fn a_page_off_the_allow_list_or_not_https_is_refused() {
    // Put together here, so the file holds no address with a password in it.
    let with_password = [
        "https://acme",
        ":",
        "x",
        "@github.com/acme/app/settings/variables/actions",
    ]
    .concat();
    for address in [
        "https://evil.example/acme/app/settings/variables/actions",
        "https://github.com.evil.example/acme/app/settings/variables/actions",
        "http://github.com/acme/app/settings/variables/actions",
        "javascript:alert(1)",
        "https://acme@github.com/acme/app/settings/variables/actions",
        &with_password,
        "https://github.com:8443/acme/app/settings/variables/actions",
    ] {
        assert_eq!(opened(address), Err(Refusal::BadValue), "{address}");
    }
}

#[test]
fn a_page_outside_the_prefixes_is_refused() {
    for address in [
        "https://github.com/acme/app/settings/",
        "https://github.com/acme/app/settings/access",
        "https://github.com/settings/tokens/new",
        "https://github.com/login/device",
        "https://github.com/acme/app/settings/variables",
        "https://github.com//app/settings/variables/actions",
    ] {
        assert_eq!(opened(address), Err(Refusal::BadValue), "{address}");
    }
}

#[test]
fn path_tricks_are_refused_after_decoding_once() {
    for address in [
        "https://github.com/acme/app/settings/variables/../../settings/access",
        "https://github.com/acme/app/settings/variables/%2e%2e/%2e%2e/settings/access",
        "https://github.com/acme/app/settings/variables/./x",
        "https://github.com/acme/app/settings/variables//x",
        "https://github.com/acme/app/settings/variables/%2F%2Fevil.example",
        "https://github.com/acme/app/settings/variables/%252F",
        "https://github.com/acme/app/settings/variables/\\..\\access",
        "https://github.com/acme/app/settings/variables/%5C..%5Caccess",
        "https://github.com/acme/app/settings/variables/%5c",
        "https://github.com/acme/app/settings/variables/%zz",
        "https://github.com/acme/app/settings/variables/%c3%28",
        "https://github.com/acme/app/settings/variables/.\t./x",
        "https://github.com/acme/app/settings/variables/ x",
        "https://github.com/acme/app/settings/variables/%09",
    ] {
        assert_eq!(opened(address), Err(Refusal::BadValue), "{address:?}");
    }
}

#[test]
fn a_query_or_fragment_is_refused() {
    for address in [
        "https://github.com/acme/app/settings/variables/actions?return_to=https://evil.example",
        "https://github.com/acme/app/settings/variables/actions#x",
        "https://github.com?x=/acme/app/settings/variables/",
    ] {
        assert_eq!(opened(address), Err(Refusal::BadValue), "{address}");
    }
}

#[test]
fn the_refusal_reason_goes_to_the_log_not_the_page() {
    let refusal = open_page(
        &routes(),
        &OpenLimiter::default(),
        "https://evil.example/",
        10_000,
    );
    let Err((Refusal::BadValue, Some(reason))) = refusal else {
        panic!("{refusal:?}")
    };
    assert!(reason.contains("evil.example"));
}

#[test]
fn page_script_cant_keep_opening_pages() {
    let limiter = OpenLimiter::default();
    let routes = routes();
    assert!(open_page(&routes, &limiter, PAGE, 10_000).is_ok());
    let again = open_page(&routes, &limiter, PAGE, 10_000 + SAME_PAGE_GAP_MS - 1);
    assert!(matches!(again, Err((Refusal::TooOften, None))));
    let other = "https://github.com/acme/app/settings/rules/";
    let soon = open_page(&routes, &limiter, other, 10_000 + ANY_PAGE_GAP_MS - 1);
    assert!(matches!(soon, Err((Refusal::TooOften, None))));
    assert!(open_page(&routes, &limiter, other, 10_000 + SAME_PAGE_GAP_MS).is_ok());
}

fn guided(placeholders: serde_json::Value) -> StepRef {
    serde_json::from_value(json!({ "definition": "acme.set-variable", "version": 1, "step": 1, "placeholders": placeholders }))
        .expect("a well-formed step")
}

#[test]
fn a_guided_step_opens_the_address_its_route_builds() {
    let page = open_guided(
        &routes(),
        &OpenLimiter::default(),
        &guided(json!({ "owner": "acme", "repo": "app" })),
        10_000,
    );
    assert_eq!(
        page.map(|page| page.to_string()),
        Ok("https://github.com/acme/app/settings/variables/actions/new".to_owned())
    );
}

#[test]
fn a_guided_step_checks_its_values_and_the_list() {
    let limiter = OpenLimiter::default();
    for repo in ["../../settings", "app/x", "%2e%2e", ""] {
        let page = open_guided(
            &routes(),
            &limiter,
            &guided(json!({ "owner": "acme", "repo": repo })),
            10_000,
        );
        assert_eq!(page, Err(Refusal::BadValue), "{repo:?}");
    }
    let call_step: StepRef = serde_json::from_value(
        json!({ "definition": "acme.approve-run", "version": 1, "step": 1,
        "placeholders": { "owner": "acme", "repo": "app", "runId": "1" } }),
    )
    .expect("well-formed");
    assert_eq!(
        open_guided(&routes(), &limiter, &call_step, 10_000),
        Err(Refusal::NotInCatalog)
    );
}
