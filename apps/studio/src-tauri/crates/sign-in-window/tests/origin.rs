//! Requirement `studio.src-tauri.crates.sign-in-window.sign-in-window`: a
//! sign-in page opens only on exactly the scheme, host and port of the
//! origin the caller names for the service it signs in to (HAL-20663).

use halonic_sign_in_window::sign_in_url;

const PAPERCLIP: &str = "https://paperclip.acme.test";

#[test]
fn a_page_on_the_named_origin_may_open() {
    for (address, origin) in [
        (
            "https://paperclip.acme.test/cli-auth/challenge-1",
            PAPERCLIP,
        ),
        (
            "https://paperclip.acme.test:443/cli-auth/challenge-1",
            PAPERCLIP,
        ),
        (
            "https://paperclip.acme.test/x",
            "https://paperclip.acme.test/",
        ),
        (
            "http://localhost:3100/cli-auth/challenge-1",
            "http://localhost:3100",
        ),
    ] {
        assert!(
            sign_in_url(address, origin).is_some(),
            "{address:?} on {origin:?}"
        );
    }
}

#[test]
fn a_page_on_another_host_is_refused() {
    for address in [
        "https://other.acme.test/cli-auth/challenge-1",
        "https://acme.test/cli-auth/challenge-1",
        "https://paperclip.acme.test.evil.example/cli-auth/challenge-1",
        "https://sub.paperclip.acme.test/cli-auth/challenge-1",
    ] {
        assert!(sign_in_url(address, PAPERCLIP).is_none(), "{address:?}");
    }
}

#[test]
fn a_page_on_another_port_is_refused() {
    assert!(sign_in_url("https://paperclip.acme.test:8443/x", PAPERCLIP).is_none());
    assert!(sign_in_url("http://localhost:3101/x", "http://localhost:3100").is_none());
}

#[test]
fn a_page_on_another_scheme_is_refused() {
    assert!(sign_in_url("http://localhost:3100/x", "https://localhost:3100").is_none());
    assert!(sign_in_url("https://localhost:3100/x", "http://localhost:3100").is_none());
}

#[test]
fn plain_http_to_another_computer_is_refused_as_page_or_origin() {
    let remote = "http://paperclip.acme.test";
    assert!(sign_in_url("http://paperclip.acme.test/x", remote).is_none());
    assert!(sign_in_url("https://paperclip.acme.test/x", remote).is_none());
}

#[test]
fn an_origin_that_is_no_address_or_holds_a_user_refuses_every_page() {
    let page = "https://paperclip.acme.test/x";
    for origin in [
        "",
        "paperclip.acme.test",
        "https://user@paperclip.acme.test",
        "file:///C:/",
    ] {
        assert!(sign_in_url(page, origin).is_none(), "{origin:?}");
    }
}
