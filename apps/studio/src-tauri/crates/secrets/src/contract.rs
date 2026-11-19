//! The behaviour every [`SecretBackend`] must show (agreed with Priya on
//! HAL-229), allowed origins included (HAL-11887). CI runs it against [`crate::MemoryBackend`]; the desktop
//! keychain and the Android Keystore run the same check in their own tests.

use crate::backend::{
    MAX_VALUE_BYTES, SecretBackend, delete_secret, get_secret, has_secret, set_secret,
};
use crate::error::SecretError;
use crate::origins::{AllowOrigin, allow_origin, allowed_origins};

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
    present(
        "a missing secret is not present",
        has_secret(backend, FIRST),
        false,
    )?;
    step("set", set_secret(backend, FIRST, "first value"))?;
    present(
        "a stored secret is present",
        has_secret(backend, FIRST),
        true,
    )?;
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
    present(
        "a deleted secret is not present",
        has_secret(backend, FIRST),
        false,
    )?;
    step("delete a missing secret", delete_secret(backend, FIRST))?;
    run_origin_cases(backend)
}

/// The origins a key may go to: kept apart from the value, kept when the
/// value changes, and removed with the key.
fn run_origin_cases(backend: &dyn SecretBackend) -> Result<(), String> {
    const ORIGIN: &str = "https://llm.example.com";
    const GATEWAY: &str = "http://localhost:8080";
    allowed(
        "a missing key allows no origin",
        allow_origin(backend, FIRST, ORIGIN),
        AllowOrigin::NoKey,
    )?;
    origins("a missing key has no origins", backend, None)?;
    step("set a key", set_secret(backend, FIRST, "key value"))?;
    origins("a new key has no origins", backend, None)?;
    allowed(
        "allow an origin",
        allow_origin(backend, FIRST, ORIGIN),
        AllowOrigin::Added,
    )?;
    allowed(
        "allow a second origin",
        allow_origin(backend, FIRST, GATEWAY),
        AllowOrigin::Added,
    )?;
    allowed(
        "allow an origin twice",
        allow_origin(backend, FIRST, ORIGIN),
        AllowOrigin::AlreadyAllowed,
    )?;
    origins(
        "the origins read back in order",
        backend,
        Some(&[ORIGIN, GATEWAY]),
    )?;
    expect(
        "the origins leave the value alone",
        get_secret(backend, FIRST),
        Some("key value"),
    )?;
    step(
        "change the key",
        set_secret(backend, FIRST, "new key value"),
    )?;
    origins(
        "a new value keeps the origins",
        backend,
        Some(&[ORIGIN, GATEWAY]),
    )?;
    step("delete the key", delete_secret(backend, FIRST))?;
    step("set the key again", set_secret(backend, FIRST, "key value"))?;
    origins("deleting the key removes its origins", backend, None)?;
    step("delete the key again", delete_secret(backend, FIRST))?;
    Ok(())
}

fn allowed(
    case: &str,
    actual: Result<AllowOrigin, SecretError>,
    expected: AllowOrigin,
) -> Result<(), String> {
    match actual {
        Ok(outcome) if outcome == expected => Ok(()),
        Ok(outcome) => Err(format!("{case}: the backend answered {outcome:?}")),
        Err(error) => Err(format!("{case}: {error}")),
    }
}

fn origins(
    case: &str,
    backend: &dyn SecretBackend,
    expected: Option<&[&str]>,
) -> Result<(), String> {
    let expected = expected.map(|list| list.iter().map(|&origin| origin.to_owned()).collect());
    match allowed_origins(backend, FIRST) {
        Ok(found) if found == expected => Ok(()),
        Ok(_) => Err(format!("{case}: the backend returned different origins")),
        Err(error) => Err(format!("{case}: {error}")),
    }
}

fn step(case: &str, result: Result<(), SecretError>) -> Result<(), String> {
    result.map_err(|error| format!("{case}: {error}"))
}

fn present(case: &str, actual: Result<bool, SecretError>, expected: bool) -> Result<(), String> {
    match actual {
        Ok(found) if found == expected => Ok(()),
        Ok(_) => Err(format!("{case}: the backend answered the other way")),
        Err(error) => Err(format!("{case}: {error}")),
    }
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
