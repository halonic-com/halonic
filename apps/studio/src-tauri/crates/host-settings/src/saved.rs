//! The saved settings' text, read and changed as `readSavedHostSettings`
//! and `changeSavedHostSettings` in `@halonicjs/ports` do, so either side
//! reads what the other wrote and keeps what it doesn't know.

use serde_json::{Map, Value};

use crate::error::HostSettingsError;

/// The most bytes every saved value may take together, as compact JSON of
/// the values by key in UTF-8, as `hostSettingsMaxBytes` counts them.
pub const MAX_BYTES: usize = 256 * 1024;

/// The longest key, as `isHostSettingKey` allows. Keys are ASCII, so bytes
/// and UTF-16 code units count alike.
const MAX_KEY_LENGTH: usize = 64;

/// Whether `key` can name a host setting, as `isHostSettingKey` decides:
/// two or more lowercase words joined by dots, each word starting with a
/// letter, then letters and digits with single `-` between them, and at
/// most 64 characters, such as `assistant.turn-limit`. No key can then be
/// `__proto__` or hold a path.
pub fn is_host_setting_key(key: &str) -> bool {
    key.len() <= MAX_KEY_LENGTH && key.contains('.') && key.split('.').all(is_word)
}

/// One word of a key: `[a-z][a-z0-9]*(-[a-z0-9]+)*`.
fn is_word(word: &str) -> bool {
    let lower_or_digit = |part: &str| {
        part.bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    };
    let mut parts = word.split('-');
    let first = parts.next().unwrap_or_default();
    first.starts_with(|character: char| character.is_ascii_lowercase())
        && lower_or_digit(first)
        && parts.all(|part| !part.is_empty() && lower_or_digit(part))
}

/// The values in saved settings' text, leaving out any key
/// [`is_host_setting_key`] refuses; `None` when the text can't be parsed as
/// an object with an object `values`.
pub fn read_saved_host_settings(text: &str) -> Option<Map<String, Value>> {
    let mut values = parse_saved(text)?.remove("values")?;
    let values = values.as_object_mut()?;
    values.retain(|key, _| is_host_setting_key(key));
    Some(std::mem::take(values))
}

/// What a save writes, from [`change_saved_host_settings`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedChange {
    /// The settings' new text: JSON indented by two spaces, and a newline.
    pub text: String,
    /// Whether the old text couldn't be parsed, so the store keeps it as a
    /// broken copy first.
    pub broken: bool,
}

/// The saved settings' text with `key` saved as `value`, or removed when
/// `value` is `None`, and every other key and field kept as it is. A
/// `version` is added when there is none; a newer one is kept.
///
/// `serde_json` sorts the fields when it writes them, and writes numbers in
/// its own form (`1e3` becomes `1000.0`), so the text may list them in
/// another order and spell a number otherwise than the TypeScript side;
/// the settings are the same. The size is counted in that form, so for a
/// number with fractions it may differ from `hostSettingsMaxBytes`' count
/// by a few bytes. A `Value` can't hold a number that isn't finite, so there is no
/// such number to refuse here: the page's adapter refuses it before it
/// calls the shell.
///
/// # Errors
///
/// `InvalidKey` when [`is_host_setting_key`] refuses the key, `TooLarge`
/// when the values would be over [`MAX_BYTES`].
pub fn change_saved_host_settings(
    text: Option<&str>,
    key: &str,
    value: Option<&Value>,
) -> Result<SavedChange, HostSettingsError> {
    if !is_host_setting_key(key) {
        return Err(HostSettingsError::InvalidKey {
            key: key.to_owned(),
        });
    }
    let saved = text.and_then(parse_saved);
    let broken = text.is_some() && saved.is_none();
    let mut fields = saved.unwrap_or_default();
    let mut values = match fields.remove("values") {
        Some(Value::Object(values)) => values,
        _ => Map::new(),
    };
    match value {
        Some(value) => values.insert(key.to_owned(), value.clone()),
        None => values.remove(key),
    };
    if compact_length(&values) > MAX_BYTES {
        return Err(HostSettingsError::TooLarge {
            key: key.to_owned(),
        });
    }
    fields.entry("version").or_insert(Value::from(1));
    fields.insert("values".to_owned(), Value::Object(values));
    let mut text = serde_json::to_string_pretty(&Value::Object(fields))
        .expect("a JSON value always serialises");
    text.push('\n');
    Ok(SavedChange { text, broken })
}

/// The saved settings' fields, when the text is an object whose `values`
/// is an object.
fn parse_saved(text: &str) -> Option<Map<String, Value>> {
    match serde_json::from_str::<Value>(text).ok()? {
        Value::Object(fields) if fields.get("values").is_some_and(Value::is_object) => Some(fields),
        _ => None,
    }
}

/// The values' length in bytes as compact JSON in UTF-8, as
/// `JSON.stringify(values)` gives it. Both escape the same characters, and
/// the order of the keys doesn't change the length.
fn compact_length(values: &Map<String, Value>) -> usize {
    serde_json::to_string(values)
        .expect("a JSON value always serialises")
        .len()
}
