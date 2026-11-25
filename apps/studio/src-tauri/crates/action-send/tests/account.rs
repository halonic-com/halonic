//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! A stepper's sign-in lives in the keychain under `action__` names, which
//! only this crate reaches: the page's secret commands refuse them.

mod support;

use halonic_action_send::account::{self, Account};
use halonic_secrets::{MemoryBackend, SecretError, get_secret, has_secret, set_secret};
use support::{NOW, TOKEN};

fn acme_admin() -> Account {
    Account {
        service: "github".to_owned(),
        name: "acme-admin".to_owned(),
    }
}

#[test]
fn a_stored_sign_in_is_found_until_it_expires() {
    let backend = MemoryBackend::new();
    assert_eq!(account::signed_in(&backend, "github", NOW), Ok(None));
    account::store(&backend, "github", "acme-admin", TOKEN, NOW + 60).expect("stores");
    assert_eq!(
        account::signed_in(&backend, "github", NOW),
        Ok(Some(acme_admin()))
    );
    assert_eq!(
        account::token(&backend, "github", NOW),
        Ok(Some((acme_admin(), TOKEN.to_owned())))
    );
    assert_eq!(account::signed_in(&backend, "github", NOW + 60), Ok(None));
    assert_eq!(account::token(&backend, "github", NOW + 60), Ok(None));
}

#[test]
fn signing_out_forgets_the_token_and_the_account() {
    let backend = MemoryBackend::new();
    account::store(&backend, "github", "acme-admin", TOKEN, NOW + 60).expect("stores");
    account::sign_out(&backend, "github").expect("signs out");
    assert_eq!(account::token(&backend, "github", NOW), Ok(None));
    let leftover =
        halonic_secrets::SecretName::parse("action__github__acme-admin").expect("a name");
    assert_eq!(
        halonic_secrets::SecretBackend::get(&backend, &leftover),
        Ok(None)
    );
    account::sign_out(&backend, "github").expect("signing out twice does nothing");
}

#[test]
fn a_new_account_replaces_the_old_ones_token() {
    let backend = MemoryBackend::new();
    account::store(&backend, "github", "acme-admin", TOKEN, NOW + 60).expect("stores");
    account::store(
        &backend,
        "github",
        "acme-ops",
        "acme-user-token-0002",
        NOW + 60,
    )
    .expect("stores");
    let old = halonic_secrets::SecretName::parse("action__github__acme-admin").expect("a name");
    assert_eq!(
        halonic_secrets::SecretBackend::get(&backend, &old),
        Ok(None)
    );
    let signed_in = account::signed_in(&backend, "github", NOW).expect("reads");
    assert_eq!(
        signed_in.map(|account| account.name),
        Some("acme-ops".to_owned())
    );
}

#[test]
fn an_account_name_that_isnt_one_is_refused() {
    let backend = MemoryBackend::new();
    for name in ["", "-acme", "acme/admin", "acme_admin", &"a".repeat(40)] {
        assert_eq!(
            account::store(&backend, "github", name, TOKEN, NOW + 60),
            Err(SecretError::InvalidName),
            "{name:?}"
        );
    }
}

#[test]
fn the_secret_commands_cant_reach_a_stepper_sign_in() {
    let backend = MemoryBackend::new();
    account::store(&backend, "github", "acme-admin", TOKEN, NOW + 60).expect("stores");
    for name in [
        "action__github__acme-admin",
        "action__github",
        "Action--GitHub--Acme-Admin",
    ] {
        assert_eq!(
            get_secret(&backend, name),
            Err(SecretError::ReservedName),
            "{name}"
        );
        assert_eq!(
            has_secret(&backend, name),
            Err(SecretError::ReservedName),
            "{name}"
        );
        assert_eq!(
            set_secret(&backend, name, "x"),
            Err(SecretError::ReservedName),
            "{name}"
        );
    }
}
