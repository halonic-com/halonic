//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! The dialog's page has no script, masks each secret and posts its form
//! only to the shell's own scheme; the shell reads exactly the fields it
//! asked for and zeroes the form's body (HAL-18085).

use halonic_action_send::ask_page::{
    AskNavigation, MAX_FORM_BYTES, OPEN_URL, ask_navigation, ask_page, page_policy, read_form,
};
use halonic_action_send::{AskSheet, ConfirmSheet};

fn sheet(target: Option<&str>, secrets: &[&str]) -> AskSheet {
    AskSheet {
        confirm: ConfirmSheet {
            account: "acme-admin".to_owned(),
            method: "PUT",
            address: "https://api.github.com/repos/acme/app/actions/secrets/DEPLOY_KEY".to_owned(),
            fields: vec![("note".to_owned(), "\"<b>hi</b>\"".to_owned())],
        },
        target: target.map(str::to_owned),
        secrets: secrets.iter().map(|name| (*name).to_owned()).collect(),
    }
}

/// The page's own address, as the window's webview names it.
fn base() -> String {
    if cfg!(windows) {
        "http://halonic-action.localhost/".to_owned()
    } else {
        OPEN_URL.to_owned()
    }
}

#[test]
fn the_page_has_no_script_and_masks_each_secret() {
    let page = ask_page(&sheet(Some("acme/<app>"), &["value", "pass<word>"]));
    assert!(!page.to_ascii_lowercase().contains("<script"));
    assert!(
        !page
            .split_whitespace()
            .any(|word| word.starts_with("on") && word.contains('=')),
        "no inline event handler"
    );
    assert!(page.contains(r#"name="target" type="text""#));
    assert!(page.contains(r#"name="secret-0" type="password""#));
    assert!(page.contains(r#"name="secret-1" type="password""#));
    assert!(page.contains(&format!(r#"<form method="post" action="{}send""#, base())));
    // Everything the shell shows is escaped, so nothing in it is markup.
    assert!(page.contains("acme/&lt;app&gt;"));
    assert!(page.contains("pass&lt;word&gt;"));
    assert!(page.contains("&quot;&lt;b&gt;hi&lt;/b&gt;&quot;"));
    assert!(page.contains("As acme-admin:"));
}

#[test]
fn the_page_asks_only_for_what_the_step_needs() {
    let page = ask_page(&sheet(None, &["value"]));
    assert!(!page.contains(r#"name="target""#));
    let page = ask_page(&sheet(Some("acme/app"), &[]));
    assert!(!page.contains(r#"type="password""#));
}

#[test]
fn a_mistyped_name_is_shown_next_to_the_field_and_the_request_scrolls_by_keyboard() {
    // HAL-20318: the webview blocks Send and says why, with no script.
    let page = ask_page(&sheet(Some("acme/web.app"), &[]));
    assert!(page.contains(r#"pattern="acme\/web\.app""#));
    assert!(page.contains(r#"title="Type acme/web.app exactly as shown.""#));
    // An escaped `-` is a syntax error under the `v` flag, which drops the pattern.
    let page = ask_page(&sheet(Some("my-repo"), &[]));
    assert!(page.contains(r#"pattern="my-repo""#));
    let page = ask_page(&sheet(Some(r#"a"b$(c)"#), &[]));
    assert!(page.contains(r#"pattern="a&quot;b\$\(c\)""#));
    assert!(page.contains(r#"<pre tabindex="0" role="region" aria-label="The request">"#));
    // HAL-20442: the focusable request box gets the same ring as every other control.
    assert!(page.contains("pre:focus-visible"));
}

#[test]
fn the_policy_allows_no_script_and_sends_the_form_only_to_the_shell() {
    let policy = page_policy();
    assert!(policy.starts_with("default-src 'none';"));
    assert!(!policy.contains("script-src"));
    let form_action = policy
        .split(';')
        .map(str::trim)
        .find(|part| part.starts_with("form-action"))
        .expect("a form-action");
    let allowed = if cfg!(windows) {
        "form-action http://halonic-action.localhost"
    } else {
        "form-action halonic-action:"
    };
    assert_eq!(form_action, allowed);
}

#[test]
fn only_the_page_its_form_and_cancel_navigate() {
    let base = base();
    assert_eq!(ask_navigation(&base), AskNavigation::Load);
    assert_eq!(ask_navigation(&format!("{base}send")), AskNavigation::Send);
    assert_eq!(
        ask_navigation(&format!("{base}cancel")),
        AskNavigation::Cancel
    );
    for other in [
        format!("{base}send?target=acme%2Fapp"),
        format!("{base}send#x"),
        format!("{base}other"),
        "https://evil.example/".to_owned(),
        "halonic-brief://localhost/".to_owned(),
        "tauri://localhost/".to_owned(),
    ] {
        assert_eq!(ask_navigation(&other), AskNavigation::Refuse, "{other}");
    }
}

#[test]
fn the_form_is_read_decoded_and_its_body_zeroed() {
    let asked = sheet(Some("acme/app"), &["value", "other"]);
    let mut body = b"target=acme%2Fapp&secret-0=a+b%26c%3D%C3%A9&secret-1=x".to_vec();
    let typed = read_form(&asked, &mut body).expect("read");
    assert!(body.iter().all(|byte| *byte == 0), "the body is zeroed");
    assert_eq!(
        typed.target.as_ref().map(|name| name.as_str()),
        Some("acme/app")
    );
    let secrets: Vec<(&str, &str)> = typed
        .secrets
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    assert_eq!(secrets, [("value", "a b&c=é"), ("other", "x")]);
    // What was typed is never printed.
    assert!(!format!("{typed:?}").contains("a b&c"));
}

#[test]
fn a_form_with_anything_else_is_refused_and_still_zeroed() {
    let asked = sheet(Some("acme/app"), &["value"]);
    for form in [
        &b"secret-0=x"[..],
        b"target=acme%2Fapp",
        b"target=acme%2Fapp&secret-0=x&secret-1=y",
        b"target=acme%2Fapp&secret-0=x&secret-0=y",
        b"target=a&target=acme%2Fapp&secret-0=x",
        b"target=acme%2Fapp&secret-0=x&extra=1",
        b"target=acme%2Fapp&secret-0",
        b"target=acme%2Fapp&secret-0=%E9",
        b"target=acme%2Fapp&secret-0=%4",
        b"target=acme%2Fapp&secret-00x=x",
    ] {
        let mut body = form.to_vec();
        assert!(read_form(&asked, &mut body).is_none(), "{form:?}");
        assert!(body.iter().all(|byte| *byte == 0), "{form:?}");
    }
    let no_target = sheet(None, &["value"]);
    assert!(read_form(&no_target, &mut b"target=x&secret-0=y".to_vec()).is_none());
    let mut too_large =
        format!("target=acme%2Fapp&secret-0={}", "x".repeat(MAX_FORM_BYTES)).into_bytes();
    assert!(read_form(&asked, &mut too_large).is_none());
    assert!(too_large.iter().all(|byte| *byte == 0));
}
