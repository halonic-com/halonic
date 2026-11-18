//! The behaviour every [`DeviceKeyStore`] and every [`KeyWrapper`] must
//! show (requirement `device-keys`). CI runs both against the
//! [`crate::FakeWrapper`]; the Android adapter runs them on a phone.

use crate::computer::ComputerId;
use crate::error::DeviceKeyError;
use crate::key::{DeviceKeyPair, KEY_BYTES, PrivateKey};
use crate::store::DeviceKeyStore;
use crate::wrapper::KeyWrapper;

/// The computers the store check writes for. They start with
/// `halonic-contract-`, so a run on a phone can't touch a real computer's
/// key, and the check forgets them again at the end.
const FIRST: &str = "halonic-contract-first";
const SECOND: &str = "halonic-contract-second";

/// Runs every store case. Returns the first case that failed, described
/// without any key.
pub fn check_store_contract(store: &dyn DeviceKeyStore) -> Result<(), String> {
    let first = computer(FIRST)?;
    let second = computer(SECOND)?;
    let result = run_store_cases(store, &first, &second);
    // Clean up even after a failure; a failure to clean up is reported only
    // when the cases themselves passed.
    let cleanup = store.forget(&first).and_then(|()| store.forget(&second));
    result?;
    cleanup.map_err(|error| format!("cleaning up failed: {error}"))
}

fn run_store_cases(
    store: &dyn DeviceKeyStore,
    first: &ComputerId,
    second: &ComputerId,
) -> Result<(), String> {
    expect(
        "a computer with no key loads as nothing",
        store.load(first),
        None,
    )?;
    step("save", store.save(first, &pair(1)))?;
    expect("save then load", store.load(first), Some(&pair(1)))?;
    expect("another computer stays empty", store.load(second), None)?;
    step("save over", store.save(first, &pair(2)))?;
    expect(
        "save over replaces the pair",
        store.load(first),
        Some(&pair(2)),
    )?;
    step("save the other computer", store.save(second, &pair(3)))?;
    expect(
        "computers are kept apart",
        store.load(first),
        Some(&pair(2)),
    )?;
    step("forget", store.forget(first))?;
    expect("a forgotten key loads as nothing", store.load(first), None)?;
    expect(
        "forgetting one computer keeps the other's key",
        store.load(second),
        Some(&pair(3)),
    )?;
    step("forget a computer with no key", store.forget(first))?;
    Ok(())
}

/// Runs every wrapper case. Returns the first case that failed, described
/// without any key.
pub fn check_wrapper_contract(wrapper: &dyn KeyWrapper) -> Result<(), String> {
    let plain = pair(4).to_sealed_form();
    let context = b"halonic device key v1:halonic-contract-first";
    let other_context = b"halonic device key v1:halonic-contract-second";

    let sealed = wrapper
        .seal(&plain, context)
        .map_err(|error| format!("seal: {error}"))?;
    if sealed.windows(plain.len()).any(|window| window == plain) {
        return Err("the sealed bytes hold the plain bytes".to_owned());
    }
    match wrapper.open(&sealed, context) {
        Ok(opened) if opened == plain => {}
        Ok(_) => return Err("seal then open: the bytes differ".to_owned()),
        Err(error) => return Err(format!("seal then open: {error}")),
    }
    let again = wrapper
        .seal(&plain, context)
        .map_err(|error| format!("seal again: {error}"))?;
    if again == sealed {
        return Err("sealing the same bytes twice gave the same sealed bytes".to_owned());
    }
    unreadable(
        "opening for another computer",
        wrapper.open(&sealed, other_context),
    )?;
    for index in [0, sealed.len() / 2, sealed.len() - 1] {
        let mut changed = sealed.clone();
        changed[index] ^= 1;
        unreadable(
            &format!("opening with byte {index} changed"),
            wrapper.open(&changed, context),
        )?;
    }
    unreadable(
        "opening cut short",
        wrapper.open(&sealed[..sealed.len() - 1], context),
    )?;
    unreadable("opening nothing", wrapper.open(&[], context))
}

fn computer(id: &str) -> Result<ComputerId, String> {
    ComputerId::parse(id).map_err(|error| format!("{id}: {error}"))
}

/// A pair with every byte set from `seed`; the check never needs real keys.
fn pair(seed: u8) -> DeviceKeyPair {
    DeviceKeyPair {
        public: [seed; KEY_BYTES],
        private: PrivateKey::new([seed.wrapping_add(100); KEY_BYTES]),
    }
}

fn step(case: &str, result: Result<(), DeviceKeyError>) -> Result<(), String> {
    result.map_err(|error| format!("{case}: {error}"))
}

fn expect(
    case: &str,
    actual: Result<Option<DeviceKeyPair>, DeviceKeyError>,
    expected: Option<&DeviceKeyPair>,
) -> Result<(), String> {
    match (actual, expected) {
        (Ok(None), None) => Ok(()),
        (Ok(Some(found)), Some(wanted)) if found.same_as(wanted) => Ok(()),
        (Ok(_), _) => Err(format!("{case}: the store returned a different pair")),
        (Err(error), _) => Err(format!("{case}: {error}")),
    }
}

fn unreadable(case: &str, result: Result<Vec<u8>, DeviceKeyError>) -> Result<(), String> {
    match result {
        Err(DeviceKeyError::Unreadable) => Ok(()),
        Err(error) => Err(format!("{case}: {error}, not unreadable")),
        Ok(_) => Err(format!("{case}: it opened")),
    }
}
