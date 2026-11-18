//! Requirement `studio.src-tauri.http-fetch-command`: the proxy rules, held
//! to the CLI's through the shared vectors, and the user name and password.

use std::collections::HashMap;

use serde_json::Value;
use url::Url;

use super::*;

/// The cases the CLI's `proxyFromEnv`, `NoProxy` and `routeFor` pass too.
const VECTORS: &str =
    include_str!("../../../../../../packages/adapters/http-node/test-vectors/proxy-rules.json");

fn vectors(section: &str) -> Vec<Value> {
    let all: Value = serde_json::from_str(VECTORS).expect("the vectors are JSON");
    all[section].as_array().expect("a list of cases").clone()
}

fn setting_of(env: &Value) -> ProxySetting {
    let env: HashMap<String, String> =
        serde_json::from_value(env.clone()).expect("env is names to values");
    ProxySetting::from_env(|name| env.get(name).cloned())
}

fn shown(setting: &ProxySetting) -> String {
    match setting {
        ProxySetting::None => "none".to_owned(),
        ProxySetting::Refused(_) => "refused".to_owned(),
        ProxySetting::Proxy { endpoint, .. } => endpoint.url(),
    }
}

fn text<'a>(case: &'a Value, field: &str) -> &'a str {
    case[field].as_str().expect("a text field")
}

#[test]
fn proxy_settings_read_as_the_cli_reads_them() {
    for case in vectors("settings") {
        let setting = setting_of(&case["env"]);
        assert_eq!(shown(&setting), text(&case, "setting"), "{case}");
    }
}

#[test]
fn proxy_no_proxy_matches_as_the_cli_matches() {
    for case in vectors("noProxy") {
        let url = Url::parse(text(&case, "url")).expect("a URL");
        let matches = NoProxy::parse(text(&case, "list")).matches(&url);
        assert_eq!(
            matches,
            case["matches"].as_bool().expect("a flag"),
            "{case}"
        );
    }
}

#[test]
fn proxy_routes_as_the_cli_routes() {
    for case in vectors("routes") {
        let setting = setting_of(&case["env"]);
        let url = Url::parse(text(&case, "url")).expect("a URL");
        let route = match route_for(&url, &setting) {
            Ok(Route::Direct) => "direct",
            Ok(Route::Tunnel(_)) => "tunnel",
            Err(_) => "refused",
        };
        assert_eq!(route, text(&case, "route"), "{case}");
    }
}

#[test]
fn proxy_refusals_have_stable_codes() {
    let url = Url::parse("http://api.example.com/").unwrap();
    let proxied = ProxySetting::from_env(|name| {
        (name == "HTTPS_PROXY").then(|| "http://proxy.corp:3128".to_owned())
    });
    let refusal = route_for(&url, &proxied).unwrap_err();
    assert_eq!(refusal.code(), "plain_http_proxied");
    assert!(refusal.message().contains("NO_PROXY"));
    let unusable = ProxySetting::Refused("The proxy setting is not a URL.".to_owned());
    let secure = Url::parse("https://api.example.com/").unwrap();
    assert_eq!(
        route_for(&secure, &unusable).unwrap_err().code(),
        "proxy_refused"
    );
}

/// A proxy URL with a user name and password, built here so no literal one
/// sits in the source.
fn proxy_url(scheme: &str, username: &str, password: &str, rest: &str) -> String {
    format!("{scheme}://{username}:{password}{}{rest}", '@')
}

#[test]
fn proxy_credentials_are_decoded_for_the_connect_line() {
    let endpoint = ProxyEndpoint::parse(&proxy_url(
        "http",
        "us%40er",
        "p%3Aa%25ss",
        "proxy.corp:3128",
    ))
    .expect("a proxy");
    assert_eq!(endpoint.credentials(), Some(("us@er", "p:a%ss")));
    let bare = ProxyEndpoint::parse("http://proxy.corp:3128").expect("a proxy");
    assert_eq!(bare.credentials(), None);
}

#[test]
fn proxy_credentials_never_show_in_printing_or_refusals() {
    let endpoint =
        ProxyEndpoint::parse(&proxy_url("http", "bob", "hunter2", "proxy.corp:3128")).unwrap();
    for printed in [
        format!("{endpoint}"),
        format!("{endpoint:?}"),
        endpoint.url(),
    ] {
        assert_eq!(printed, "http://proxy.corp:3128");
    }
    for value in [
        proxy_url("socks5", "bob", "hunter2", "proxy.corp:1080"),
        proxy_url("http", "bob", "hunter2%zz", "proxy.corp:1"),
        proxy_url("http", "bob", "hunter2%+f", "proxy.corp:1"),
        proxy_url("http", "bob", "hunter2", "proxy.corp:1/path"),
        format!("bob:hunter2{}proxy.corp:3128", '@'),
    ] {
        let message = ProxyEndpoint::parse(&value).unwrap_err();
        assert!(
            !message.contains("bob") && !message.contains("hunter2"),
            "{message}"
        );
    }
}

#[test]
fn proxy_refusal_names_the_scheme_it_does_not_support() {
    let message = ProxyEndpoint::parse("socks5://proxy.corp:1080").unwrap_err();
    assert!(message.contains("socks5"), "{message}");
}
