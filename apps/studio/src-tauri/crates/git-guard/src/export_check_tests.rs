//! Tests for `export_check.rs`: what an export takes, which needs no git.

use super::{check_address, check_reference, is_full_commit_id, redact};
use crate::error::GitError;

#[test]
fn git_export_takes_only_https_and_ssh_addresses_without_secrets() {
    for address in [
        "https://github.com/acme/weather",
        "HTTPS://github.com/acme/weather.git",
        "https://token@github.com/acme/weather",
        "https://github.com:8443/acme/weather",
        "ssh://git@github.com/acme/weather",
        "ssh://git@[::1]:2222/acme/weather",
    ] {
        assert_eq!(check_address(address), Ok(()), "{address} was refused");
    }
}

#[test]
fn git_export_refuses_addresses_git_would_read_as_something_else() {
    for address in [
        "",
        "-oProxyCommand=touch x",
        "--upload-pack=touch x",
        "ext::sh -c touch% x",
        "file:///srv/acme/weather",
        "/srv/acme/weather",
        "../weather",
        "git@github.com:acme/weather",
        "git://github.com/acme/weather",
        "http://github.com/acme/weather",
        "https:github.com/acme/weather",
        "https://",
        "https:///acme/weather",
        "https://-bad.example/acme/weather",
        "ssh://-oProxyCommand=touch@github.com/acme/weather",
        "ssh://git@-bad.example/acme/weather",
        "https://github.com /acme/weather",
        "https://github.com\n/acme/weather",
        "https://github.com\\acme\\weather",
        "https://user:@github.com/acme/weather",
        "ssh://user:pw@github.com/acme/weather",
        "https://%67ithub.com/acme/weather",
    ] {
        assert!(
            matches!(
                check_address(address),
                Err(GitError::AddressNotAllowed { .. })
            ),
            "{address:?} was accepted"
        );
    }
}

#[test]
fn git_export_never_repeats_a_password_in_its_refusal() {
    // Built in pieces so no password-shaped address sits in the source.
    let address = ["https://user", ":", "hunter2", "@github.com/acme/weather"].concat();
    let error = check_address(&address).expect_err("a password is refused");
    assert!(!error.to_string().contains("hunter2"), "{error}");
}

#[test]
fn git_export_never_repeats_the_address_or_its_token_in_what_git_said() {
    let address = "https://s3cr3ttoken@github.com/acme/weather";
    let said = "fatal: unable to access 'https://s3cr3ttoken@github.com/acme/weather/': 403\n";
    let message = redact(said, address);
    assert!(!message.contains("s3cr3ttoken"), "{message}");
    assert!(!message.contains("github.com"), "{message}");
    assert!(message.starts_with("fatal: unable to access"), "{message}");
}

#[test]
fn git_export_redacts_an_address_git_printed_without_its_trailing_slash() {
    let address = "https://s3cr3ttoken@github.com/acme/weather/";
    let message = redact(
        "fatal: https://s3cr3ttoken@github.com/acme/weather: 403",
        address,
    );
    assert!(!message.contains("s3cr3ttoken"), "{message}");
    assert!(!message.contains("github.com"), "{message}");
}

#[test]
fn git_export_leaves_a_short_user_in_what_git_said() {
    let message = redact("fatal: a is not a user of the address", "ssh://a@host/x");
    assert!(message.contains("a is not a user"), "{message}");
}

#[test]
fn git_export_takes_only_plain_references() {
    for reference in ["HEAD", "main", "v1.2.0", "feature/new-thing", "0123abcd"] {
        assert_eq!(
            check_reference(reference),
            Ok(()),
            "{reference} was refused"
        );
    }
    for reference in [
        "",
        "-x",
        "--upload-pack=x",
        "main..other",
        "main~1",
        "main^",
        "main:path",
        "a//b",
        "a/",
        "a.",
        "a b",
        "@{u}",
        "HEAD~1",
    ] {
        assert_eq!(
            check_reference(reference),
            Err(GitError::ReferenceNotAllowed),
            "{reference:?} was accepted"
        );
    }
}

#[test]
fn git_export_knows_a_full_commit_id() {
    assert!(is_full_commit_id(&"a".repeat(40)));
    assert!(is_full_commit_id(&"0".repeat(64)));
    assert!(!is_full_commit_id(&"a".repeat(39)));
    assert!(!is_full_commit_id(&"A".repeat(40)));
    assert!(!is_full_commit_id("main"));
}
