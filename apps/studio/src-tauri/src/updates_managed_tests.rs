use std::net::TcpListener;
use std::sync::Arc;

use halonic_http_guard::ProxySetting;
use halonic_update_state::{CheckFailure, CheckResult, Managed, ManagedBy, UpdateState};
use tauri::Manager;
use tauri::test::mock_app;

use super::super::{Inner, Updates, update_restart};
use super::{apply, fetch};

fn scoop_install() -> Inner {
    Inner {
        current: "0.1.0".to_owned(),
        managed: Some(Managed {
            by: ManagedBy::Scoop,
            command: "scoop update halonic".to_owned(),
        }),
        checking: true,
        ..Inner::default()
    }
}

#[test]
fn update_managed_says_a_newer_bucket_version_is_available_and_downloads_nothing() {
    let mut inner = scoop_install();
    apply(&mut inner, Ok("0.1.1".to_owned()), 5);
    assert!(!inner.checking);
    assert_eq!(inner.record.last_checked, Some(5));
    assert_eq!(
        inner.record.last_result,
        Some(CheckResult::Available {
            version: "0.1.1".to_owned()
        })
    );
    let status = inner.status();
    assert!(matches!(
        status.state,
        UpdateState::Available { ref version, .. } if version == "0.1.1"
    ));
    // Available, never Downloading or Ready: no restart prompt can follow.
    assert!(!inner.busy());
    assert_eq!(
        status.managed.expect("managed").command,
        "scoop update halonic"
    );
}

#[test]
fn update_managed_says_up_to_date_for_the_same_or_an_older_bucket_version() {
    for offered in ["0.1.0", "0.0.9"] {
        let mut inner = scoop_install();
        apply(&mut inner, Ok(offered.to_owned()), 5);
        assert_eq!(inner.state, Some(UpdateState::UpToDate));
    }
}

#[test]
fn update_managed_reports_a_blocked_bucket_as_cant_check() {
    // The blocked-update-check case (HAL-1114): only the status changes.
    let mut inner = scoop_install();
    apply(&mut inner, Err(CheckFailure::Offline), 5);
    assert_eq!(
        inner.state,
        Some(UpdateState::CantCheck {
            reason: CheckFailure::Offline
        })
    );
    assert_eq!(inner.record.last_checked, None);
    assert!(!inner.checking);
}

#[test]
fn update_managed_refuses_restart_to_update() {
    let app = mock_app();
    app.manage(Updates::default());
    app.state::<Updates>().inner.lock().expect("lock").managed = scoop_install().managed;
    let refusal = update_restart(app.handle().clone()).expect_err("refused");
    assert!(refusal.contains("managed"), "{refusal}");
}

#[test]
fn update_managed_leaves_an_unmanaged_install_alone() {
    let mut inner = scoop_install();
    inner.managed = None;
    assert!(inner.status().managed.is_none());
    let app = mock_app();
    app.manage(Updates::default());
    let refusal = update_restart(app.handle().clone()).expect_err("nothing is ready");
    assert!(refusal.contains("no update is ready"), "{refusal}");
}

/// `HTTPS_PROXY` set to `value`, and nothing else.
fn proxy_setting(value: &str) -> Arc<ProxySetting> {
    Arc::new(ProxySetting::from_env(|name| {
        (name == "HTTPS_PROXY").then(|| value.to_owned())
    }))
}

/// A loopback address nothing listens on any more.
fn closed_url() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let port = listener.local_addr().expect("its address").port();
    drop(listener);
    format!("http://127.0.0.1:{port}")
}

fn bucket_check(url: &str, setting: &Arc<ProxySetting>) -> CheckFailure {
    tauri::async_runtime::block_on(fetch(url, setting)).expect_err("no manifest")
}

#[test]
fn update_managed_names_an_unusable_proxy_setting() {
    let unusable = proxy_setting("socks5://127.0.0.1:1080");
    let failure = bucket_check("https://bucket.test/halonic.json", &unusable);
    assert_eq!(failure, CheckFailure::ProxySetting);
}

#[test]
fn update_managed_names_a_proxy_nobody_answers() {
    let setting = proxy_setting(&closed_url());
    let failure = bucket_check("https://bucket.test/halonic.json", &setting);
    assert_eq!(failure, CheckFailure::Proxy);
}

#[test]
fn update_managed_sends_nothing_for_plain_http_to_a_public_name_behind_a_proxy() {
    let setting = proxy_setting(&closed_url());
    let failure = bucket_check("http://bucket.test/halonic.json", &setting);
    assert_eq!(failure, CheckFailure::NoAnswer);
}

#[test]
fn update_managed_is_offline_when_a_direct_call_finds_no_server() {
    let failure = bucket_check(
        &format!("{}/halonic.json", closed_url()),
        &Arc::new(ProxySetting::None),
    );
    assert_eq!(failure, CheckFailure::Offline);
}
