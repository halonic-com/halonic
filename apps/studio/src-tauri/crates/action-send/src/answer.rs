//! What of a service's answer goes back to the page: the route's kept fields
//! that hold plain values, or for a failed status the service's own message,
//! capped and with anything key-shaped dropped (architecture note on
//! HAL-17491, 4.2). Some APIs echo submitted values back, so the text is
//! untrusted either way.

use halonic_shell_log::find_key_shape;
use serde_json::{Map, Value};

use crate::send::Answer;

/// The most characters of error text that go back: `maxActionErrorLength`
/// in `@halonicjs/events`.
pub const MAX_ERROR_CHARS: usize = 300;

/// What replaces a word that looks like a key.
const REMOVED: &str = "[removed]";

/// Words at least this long, made only of key characters and holding a
/// digit and a capital letter, are dropped as possible keys, whatever their
/// prefix.
const LONG_KEY_CHARS: usize = 32;

/// The route's kept fields that the answer has as plain values. Nothing
/// when the answer isn't a JSON object. A text value that holds the token
/// or looks like a key is left out, in case the service echoes one back.
pub fn kept_fields(answer: &Answer, keep: &[String], token: &str) -> Map<String, Value> {
    let is_json = answer
        .content_type
        .as_deref()
        .is_some_and(|content_type| content_type.to_ascii_lowercase().contains("json"));
    let Some(Value::Object(fields)) = is_json
        .then(|| serde_json::from_slice::<Value>(&answer.body).ok())
        .flatten()
    else {
        return Map::new();
    };
    keep.iter()
        .filter_map(|name| {
            let value = fields.get(name)?;
            let plain = match value {
                Value::String(text) => !text
                    .split_whitespace()
                    .any(|word| looks_like_a_key(word, token)),
                Value::Number(_) | Value::Bool(_) | Value::Null => true,
                Value::Array(_) | Value::Object(_) => false,
            };
            plain.then(|| (name.clone(), value.clone()))
        })
        .collect()
}

/// The text for an answer that redirected: the shell doesn't follow it,
/// and the address it pointed to isn't shown.
pub fn redirect_text() -> String {
    "The service answered with a redirect, which Halonic doesn't follow.".to_owned()
}

/// The service's message for a failed status, cleaned, with the permission
/// GitHub says the call needs. `None` when there is neither.
pub fn failure_text(answer: &Answer, token: &str) -> Option<String> {
    let message = serde_json::from_slice::<Value>(&answer.body)
        .ok()
        .and_then(|body| body.get("message")?.as_str().map(str::to_owned));
    let needs = answer
        .accepted_permissions
        .as_deref()
        .filter(|value| {
            value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_=,; ".contains(&byte))
        })
        .map(|value| format!("Needs the permission: {value}."));
    let text = match (message, needs) {
        (None, None) => return None,
        (Some(message), None) => message,
        (None, Some(needs)) => needs,
        (Some(message), Some(needs)) => format!("{message} {needs}"),
    };
    Some(error_text(&text, token))
}

/// Cleans untrusted text: every word holding the token, a key shape or a
/// long random-looking run is replaced, and the rest is cut to
/// [`MAX_ERROR_CHARS`].
pub fn error_text(text: &str, token: &str) -> String {
    let cleaned: Vec<&str> = text
        .split_whitespace()
        .map(|word| {
            if looks_like_a_key(word, token) {
                REMOVED
            } else {
                word
            }
        })
        .collect();
    cleaned.join(" ").chars().take(MAX_ERROR_CHARS).collect()
}

fn looks_like_a_key(word: &str, token: &str) -> bool {
    (!token.is_empty() && word.contains(token))
        || find_key_shape(word).is_some()
        || is_long_random(word)
}

fn is_long_random(word: &str) -> bool {
    word.split(|character: char| {
        !(character.is_ascii_alphanumeric() || character == '-' || character == '_')
    })
    .any(|run| {
        run.len() >= LONG_KEY_CHARS
            && run.bytes().any(|byte| byte.is_ascii_digit())
            && run.bytes().any(|byte| byte.is_ascii_uppercase())
    })
}
