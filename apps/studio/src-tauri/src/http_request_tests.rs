//! Requirement `studio.http-request`: which requests the shell sends for the
//! page, and which addresses it refuses.

use std::net::{IpAddr, SocketAddr};

use serde_json::json;

use super::{HttpRequest, Target, checked_addresses, is_public, prepared, target_of};

fn ip(text: &str) -> IpAddr {
    text.parse().expect("an IP address")
}

fn request(value: serde_json::Value) -> HttpRequest {
    serde_json::from_value(value).expect("a request")
}

fn refused(value: serde_json::Value) -> &'static str {
    prepared(&request(value)).expect_err("refused").kind
}

#[test]
fn http_request_reaches_provider_hosts_over_https_only() {
    for url in [
        "https://api.anthropic.com/v1/messages",
        "https://API.OpenAI.com/v1/chat/completions",
    ] {
        assert!(target_of(url).is_ok(), "{url}");
    }
    for url in [
        "http://api.anthropic.com/v1/messages",
        "https://api.anthropic.com:8443/",
        "https://example.com/",
        "https://api.anthropic.com.evil.example/",
        "https://user:pass@api.anthropic.com/",
        "https://127.0.0.1/",
        "file:///etc/passwd",
        "not an address",
    ] {
        assert!(target_of(url).is_err(), "{url}");
    }
}

#[test]
fn http_request_reaches_local_model_servers_on_their_own_ports_only() {
    for url in [
        "http://localhost:11434/v1/models",
        "http://127.0.0.1:1234/v1",
    ] {
        assert!(target_of(url).expect(url).loopback, "{url}");
    }
    for url in [
        "http://localhost:8080/",
        "http://localhost/",
        "https://localhost:11434/",
    ] {
        assert!(target_of(url).is_err(), "{url}");
    }
}

#[test]
fn http_request_refuses_addresses_that_are_not_on_the_internet() {
    for text in [
        "127.0.0.1",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "2001:db8::1",
    ] {
        assert!(!is_public(ip(text)), "{text}");
    }
    for text in [
        "8.8.8.8",
        "160.79.104.10",
        "2606:4700::1111",
        "::ffff:8.8.8.8",
    ] {
        assert!(is_public(ip(text)), "{text}");
    }
}

#[test]
fn http_request_refuses_other_methods_and_headers_the_shell_owns() {
    let url = "https://api.anthropic.com/v1/messages";
    assert_eq!(
        refused(json!({"url": url, "method": "DELETE"})),
        "method_refused"
    );
    assert_eq!(
        refused(json!({"url": url, "method": "POST", "headers": [["Cookie", "a=b"]]})),
        "header_refused"
    );
    assert!(
        prepared(&request(
            json!({"url": url, "method": "post", "headers": [["x-api-key", "k"]]})
        ))
        .is_ok()
    );
}

fn answers(addresses: &[&str]) -> impl Fn(&str, u16) -> std::io::Result<Vec<SocketAddr>> {
    let addresses: Vec<SocketAddr> = addresses
        .iter()
        .map(|text| SocketAddr::new(ip(text), 443))
        .collect();
    move |_, _| Ok(addresses.clone())
}

fn checked(url: &str, addresses: &[&str]) -> Result<Vec<SocketAddr>, &'static str> {
    let target: Target = target_of(url).expect(url);
    checked_addresses(&target, &answers(addresses)).map_err(|refusal| refusal.kind)
}

#[test]
fn http_request_connects_only_when_every_address_is_public() {
    let url = "https://api.anthropic.com/v1/messages";
    assert_eq!(
        checked(url, &["160.79.104.10", "2606:4700::1111"]).map(|a| a.len()),
        Ok(2)
    );
    assert_eq!(checked(url, &["10.0.0.1"]), Err("address_refused"));
    assert_eq!(checked(url, &["169.254.169.254"]), Err("address_refused"));
    // One private address among public ones refuses the whole answer.
    assert_eq!(
        checked(url, &["160.79.104.10", "10.0.0.1"]),
        Err("address_refused")
    );
    assert_eq!(checked(url, &[]), Err("address_refused"));
}

#[test]
fn http_request_connects_a_local_server_only_to_loopback() {
    let url = "http://localhost:11434/v1/models";
    assert!(checked(url, &["127.0.0.1", "::1"]).is_ok());
    assert_eq!(checked(url, &["160.79.104.10"]), Err("address_refused"));
    assert_eq!(
        checked(url, &["127.0.0.1", "10.0.0.1"]),
        Err("address_refused")
    );
}

#[test]
fn http_request_answers_unreachable_when_the_name_does_not_resolve() {
    let target = target_of("https://api.openai.com/v1/models").expect("a target");
    let refusal = checked_addresses(&target, &|_, _| Err(std::io::Error::other("no such host")))
        .expect_err("refused");
    assert_eq!(refusal.kind, "unreachable");
}
