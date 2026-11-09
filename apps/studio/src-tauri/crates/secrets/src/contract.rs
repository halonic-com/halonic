//! The behaviour every [`SecretBackend`] must show (agreed with Priya on
//! HAL-229). CI runs it against [`crate::MemoryBackend`]; the desktop
//! keychain and the Android Keystore run the same check in their own tests.

use crate::backend::{MAX_VALUE_BYTES, SecretBackend, delete_secret, get_secret, set_secret};
use crate::error::SecretError;

/// The names the check writes to. They start with `halonic_contract_`, so
/// a run against a real keychain can't touch a real secret, and the check
/// deletes them again at the end.
const FIRST: &str = "halonic_contract_first";
const SECOND: &str = "halonic_contract_second";

/// Runs every contract case against `backend`. Returns the first case that
/// failed, described without any value.
pub fn check_backend_contract(backend: &dyn SecretBackend) -> Result<(), String> {
    let result = run_cases(backend);
    // Clean up even after a failure; a failure to clean up is reported only
    // when the cases themselves passed.
    let cleanup = delete_secret(backend, FIRST).and_then(|()| delete_secret(backend, SECOND));
    result?;
    cleanup.map_err(|error| format!("cleaning up failed: {error}"))
}

fn run_cases(backend: &dyn SecretBackend) -> Result<(), String> {
    expect(
        "a missing secret reads as nothing",
        get_secret(backend, FIRST),
        None,
    )?;
    step("set", set_secret(backend, FIRST, "first value"))?;
    expect(
        "set then get",
        get_secret(backend, FIRST),
        Some("first value"),
    )?;
    step("overwrite", set_secret(backend, FIRST, "second value"))?;
    expect(
        "overwrite replaces the value",
        get_secret(backend, FIRST),
        Some("second value"),
    )?;
    expect(
        "the other name stays empty",
        get_secret(backend, SECOND),
        None,
    )?;
    let limit = backend.max_value_bytes();
    if limit == 0 || limit > MAX_VALUE_BYTES {
        return Err(format!(
            "the backend's value limit, {limit} bytes, must be between 1 and {MAX_VALUE_BYTES}"
        ));
    }
    let largest = "x".repeat(limit);
    step(
        "set the largest value",
        set_secret(backend, SECOND, &largest),
    )?;
    expect(
        "the largest value reads back whole",
        get_secret(backend, SECOND),
        Some(&largest),
    )?;
    if set_secret(backend, SECOND, &format!("{largest}x")) != Err(SecretError::InvalidValue) {
        return Err("one byte over the limit: the value was not refused".to_owned());
    }
    expect(
        "a refused value leaves the old one",
        get_secret(backend, SECOND),
        Some(&largest),
    )?;
    expect(
        "names are kept apart",
        get_secret(backend, FIRST),
        Some("second value"),
    )?;
    expect(
        "names match in canonical form",
        get_secret(backend, "Halonic-Contract-First"),
        Some("second value"),
    )?;
    step("delete", delete_secret(backend, FIRST))?;
    expect(
        "a deleted secret reads as nothing",
        get_secret(backend, FIRST),
        None,
    )?;
    step("delete a missing secret", delete_secret(backend, FIRST))?;
    Ok(())
}

fn step(case: &str, result: Result<(), SecretError>) -> Result<(), String> {
    result.map_err(|error| format!("{case}: {error}"))
}

fn expect(
    case: &str,
    actual: Result<Option<String>, SecretError>,
    expected: Option<&str>,
) -> Result<(), String> {
    match actual {
        Ok(value) if value.as_deref() == expected => Ok(()),
        Ok(_) => Err(format!("{case}: the backend returned a different value")),
        Err(error) => Err(format!("{case}: {error}")),
    }
}
