//! The golden cases next to the port's contract suite
//! (`packages/testing/contracts/src/golden/host-settings-limits.json`), which
//! the TypeScript adapters pass through the contract suite, so the shell and the
//! CLI agree on which keys, sizes and saved settings they take. Requirement
//! `host-settings-file`; these tests' names start with `host_settings_file_`.

mod support;

use halonic_host_settings::{HostSettingsError, MAX_BYTES, is_host_setting_key};
use serde_json::{Value, json};
use support::{Scratch, golden};

#[test]
fn host_settings_file_allows_exactly_the_golden_keys() {
    let golden = golden();
    let keys = golden["keys"].as_array().expect("keys");
    assert!(keys.len() >= 20, "every case is read");
    let scratch = Scratch::new("keys");
    let store = scratch.store();
    for case in keys {
        let key = case["key"].as_str().expect("a key");
        let allowed = case["allowed"].as_bool().expect("allowed");
        assert_eq!(is_host_setting_key(key), allowed, "{key:?}");
        if !allowed {
            let refused = HostSettingsError::InvalidKey {
                key: key.to_owned(),
            };
            assert_eq!(store.set(key, &json!(1)), Err(refused.clone()), "{key:?}");
            assert_eq!(store.remove(key), Err(refused), "{key:?}");
        }
    }
    assert!(
        !scratch.settings().exists(),
        "a refused key touches nothing"
    );
}

#[test]
fn host_settings_file_saves_up_to_the_golden_size() {
    assert_eq!(MAX_BYTES, 256 * 1024);
    for case in golden()["sizes"].as_array().expect("sizes") {
        let name = case["name"].as_str().expect("a name");
        let key = case["key"].as_str().expect("a key");
        let character = case["character"].as_str().expect("a character");
        let count = case["count"].as_u64().expect("a count");
        let value = Value::from(character.repeat(usize::try_from(count).unwrap()));
        let scratch = Scratch::new("sizes");
        let store = scratch.store();
        if case["fits"].as_bool().expect("fits") {
            store
                .set(key, &value)
                .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(store.read().unwrap()[key], value, "{name}");
        } else {
            let refused = HostSettingsError::TooLarge {
                key: key.to_owned(),
            };
            assert_eq!(store.set(key, &value), Err(refused), "{name}");
            assert!(!scratch.file().exists(), "{name}: nothing is saved");
        }
    }
}

#[test]
fn host_settings_file_reads_and_saves_over_the_golden_saved_settings() {
    for case in golden()["saved"].as_array().expect("saved") {
        let name = case["name"].as_str().expect("a name");
        let text = case["text"].as_str().expect("a text");
        let scratch = Scratch::new("saved");
        let store = scratch.store();
        scratch.write_saved(text);
        let values = if case["values"].is_null() {
            json!({})
        } else {
            case["values"].clone()
        };
        assert_eq!(Value::Object(store.read().unwrap()), values, "{name}");

        store.set("assistant.turn-limit", &json!(24)).unwrap();
        assert_eq!(scratch.saved(), case["afterSave"], "{name}");
        let broken = std::fs::read_to_string(scratch.settings().join("host.json.broken")).ok();
        let expected = case["values"].is_null().then(|| text.to_owned());
        assert_eq!(broken, expected, "{name}: the broken copy");
    }
}
