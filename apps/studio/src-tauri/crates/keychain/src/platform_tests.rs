//! The desktop keychain without a keychain: which store and entry it picks,
//! and how it reports keyring's errors. The contract check against the real
//! keychain needs an unlocked one, so plain `cargo test` ignores it. CI runs
//! it with `cargo test -p halonic-keychain -- --ignored` in the `tauri`,
//! `tauri-windows` and `tauri-keychain-macos` jobs (HAL-4499); on a
//! desktop, run the same command.

use halonic_secrets::{SecretBackend, SecretError, SecretName, check_backend_contract, set_secret};
use keyring::Error;

use crate::DesktopKeychain;
use crate::platform::{MAX_STORED_BYTES, NO_ACCESS, PlatformCredential, entry, secret_error};

fn name(name: &str) -> SecretName {
    SecretName::parse(name).expect("a valid name")
}

#[test]
fn desktop_keychain_uses_the_platform_store_never_the_mock() {
    let entry = entry(&name("acme-key")).expect("making an entry touches no keychain");
    let credential = entry.get_credential();
    assert!(
        credential.downcast_ref::<PlatformCredential>().is_some(),
        "the entry is not the platform's credential type"
    );
    assert!(
        credential
            .downcast_ref::<keyring::mock::MockCredential>()
            .is_none(),
        "the entry would keep the secret in memory"
    );
}

#[cfg(target_os = "linux")]
#[test]
fn desktop_keychain_stores_under_the_service_and_the_canonical_name() {
    let entry = entry(&name("Acme-Key")).expect("making an entry touches no keychain");
    let credential = entry
        .get_credential()
        .downcast_ref::<PlatformCredential>()
        .expect("the platform's credential type");
    assert_eq!(credential.attributes["service"], "halonic");
    assert_eq!(credential.attributes["username"], "acme_key");
}

#[cfg(target_os = "macos")]
#[test]
fn desktop_keychain_stores_under_the_service_and_the_canonical_name() {
    let entry = entry(&name("Acme-Key")).expect("making an entry touches no keychain");
    let credential = entry
        .get_credential()
        .downcast_ref::<PlatformCredential>()
        .expect("the platform's credential type");
    assert_eq!(credential.service, "halonic");
    assert_eq!(credential.account, "acme_key");
}

#[cfg(target_os = "windows")]
#[test]
fn desktop_keychain_stores_under_the_service_and_the_canonical_name() {
    let entry = entry(&name("Acme-Key")).expect("making an entry touches no keychain");
    let credential = entry
        .get_credential()
        .downcast_ref::<PlatformCredential>()
        .expect("the platform's credential type");
    assert_eq!(credential.target_name, "acme_key.halonic");
    assert_eq!(credential.username, "acme_key");
}

#[test]
fn desktop_keychain_errors_never_hold_the_stored_bytes() {
    let stored = b"acme-secret-value\xff".to_vec();
    let error = secret_error(Error::BadEncoding(stored));
    assert_eq!(error, SecretError::Unreadable);
    assert!(!error.to_string().contains("acme-secret-value"), "{error}");

    let error = secret_error(Error::Ambiguous(Vec::new()));
    assert_eq!(error.kind(), "backend");
    assert!(!error.to_string().contains("credentials"), "{error}");
}

#[test]
fn desktop_keychain_maps_keyring_errors_to_kinds() {
    let platform_failure = || Box::<dyn std::error::Error + Send + Sync>::from("bus closed");
    assert_eq!(
        secret_error(Error::TooLong("password".to_owned(), 2560)),
        SecretError::InvalidValue
    );
    assert_eq!(
        secret_error(Error::NoStorageAccess(platform_failure())),
        NO_ACCESS
    );
    let error = secret_error(Error::PlatformFailure(platform_failure()));
    assert_eq!(error.kind(), "backend");
    assert!(error.to_string().contains("bus closed"), "{error}");
}

#[test]
fn desktop_keychain_refuses_values_longer_than_the_store_keeps() {
    // Refused before the keychain is touched: 16 KiB, or 1,280 bytes on
    // Windows.
    let keychain = DesktopKeychain::new();
    assert_eq!(keychain.max_value_bytes(), MAX_STORED_BYTES);
    assert_eq!(
        set_secret(&keychain, "acme-key", &"x".repeat(MAX_STORED_BYTES + 1)),
        Err(SecretError::InvalidValue)
    );
}

#[test]
#[ignore = "needs an unlocked keychain; CI's keychain contract steps run it with --ignored (HAL-4499)"]
fn desktop_keychain_passes_the_backend_contract() {
    assert_eq!(check_backend_contract(&DesktopKeychain::new()), Ok(()));
}
