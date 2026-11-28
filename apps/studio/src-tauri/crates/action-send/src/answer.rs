//! What of a service's answer goes back to the page: the route's kept fields
//! that hold plain values, or for a failed status the service's own message,
//! capped and with anything key-shaped dropped (architecture note on
//! HAL-17491, 4.2). Some APIs echo submitted values back, so the text is
//! untrusted either way.

use halonic_shell_log::find_key_shape;
use serde_json::{Map, Value};

use crate::send::Answer;
use crate::services::AnswerShape;

/// The most characters of error text that go back: `maxActionErrorLength`
/// in `@halonicjs/events`.
pub const MAX_ERROR_CHARS: usize = 300;

/// What replaces a word that looks like a key.
const REMOVED: &str = "[removed]";

/// Words at least this long, made only of key characters and holding a
/// digit and a capital letter, are dropped as possible keys, whatever their
/// prefix.
const LONG_KEY_CHARS: usize = 32;

/// A list answer held more than one item: a step reads or changes exactly
/// one thing, so the shell keeps nothing from it.
#[derive(Debug, PartialEq, Eq)]
pub struct MoreThanOne;

/// The answer's body as JSON, or `None` when it isn't JSON.
fn json_body(answer: &Answer) -> Option<Value> {
    let is_json = answer
        .content_type
        .as_deref()
        .is_some_and(|content_type| content_type.to_ascii_lowercase().contains("json"));
    is_json
        .then(|| serde_json::from_slice::<Value>(&answer.body).ok())
        .flatten()
}

/// The fields kept fields are taken from. A plain answer is the object
/// itself. An envelope's are its `result` object's; when `result` is a list,
/// they are its one item's, if any, plus `total_count` from `result_info`,
/// and a list of more than one is refused (Liam's conditions on HAL-20239).
fn answer_fields(body: Value, shape: AnswerShape) -> Result<Map<String, Value>, MoreThanOne> {
    let Value::Object(mut fields) = body else {
        return Ok(Map::new());
    };
    if shape == AnswerShape::Plain {
        return Ok(fields);
    }
    match fields.remove("result") {
        Some(Value::Object(result)) => Ok(result),
        Some(Value::Array(items)) => {
            let total_count = fields
                .get("result_info")
                .and_then(|info| info.get("total_count"))
                .and_then(Value::as_u64)
                .unwrap_or_else(|| u64::try_from(items.len()).unwrap_or(u64::MAX));
            if items.len() > 1 || total_count > 1 {
                return Err(MoreThanOne);
            }
            let mut one = match items.into_iter().next() {
                Some(Value::Object(item)) => item,
                _ => Map::new(),
            };
            one.insert("total_count".to_owned(), Value::from(total_count));
            Ok(one)
        }
        _ => Ok(Map::new()),
    }
}

/// The route's kept fields that the answer has as plain values. Nothing
/// when the answer isn't a JSON object. A text or number value that holds a
/// `hidden` value (the token, a typed secret), or text that looks like a
/// key, is left out, in case the service echoes one back.
pub fn kept_fields(
    answer: &Answer,
    shape: AnswerShape,
    keep: &[String],
    hidden: &[&str],
) -> Result<Map<String, Value>, MoreThanOne> {
    let Some(body) = json_body(answer) else {
        return Ok(Map::new());
    };
    let fields = answer_fields(body, shape)?;
    Ok(keep
        .iter()
        .filter_map(|name| {
            let value = fields.get(name)?;
            let plain = match value {
                Value::String(text) => {
                    !holds_hidden(text, hidden)
                        && !text
                            .split_whitespace()
                            .any(|word| looks_like_a_key(word, hidden))
                }
                // A numeric secret can come back as a JSON number.
                Value::Number(number) => !holds_hidden(&number.to_string(), hidden),
                Value::Bool(_) | Value::Null => true,
                Value::Array(_) | Value::Object(_) => false,
            };
            plain.then(|| (name.clone(), value.clone()))
        })
        .collect())
}

/// The text for an answer that redirected: the shell doesn't follow it,
/// and the address it pointed to isn't shown.
pub fn redirect_text() -> String {
    "The service answered with a redirect, which Halonic doesn't follow.".to_owned()
}

/// An envelope's `errors`, each as `message (code N)`, joined with `; `.
fn envelope_errors(body: &Value) -> Option<String> {
    let errors: Vec<String> = body
        .get("errors")?
        .as_array()?
        .iter()
        .filter_map(|error| {
            let message = error.get("message")?.as_str()?;
            Some(match error.get("code").and_then(Value::as_i64) {
                Some(code) => format!("{message} (code {code})"),
                None => message.to_owned(),
            })
        })
        .collect();
    (!errors.is_empty()).then(|| errors.join("; "))
}

/// The service's message for a failed status, cleaned of the `hidden`
/// values, with the permission GitHub says the call needs. `None` when
/// there is neither.
pub fn failure_text(answer: &Answer, shape: AnswerShape, hidden: &[&str]) -> Option<String> {
    let body = serde_json::from_slice::<Value>(&answer.body).ok();
    let message = body.and_then(|body| match shape {
        AnswerShape::Plain => body.get("message")?.as_str().map(str::to_owned),
        AnswerShape::Envelope => envelope_errors(&body),
    });
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
    Some(cleaned_text(&text, hidden))
}

/// Cleans untrusted text: every word holding the token, a key shape or a
/// long random-looking run is replaced, and the rest is cut to
/// [`MAX_ERROR_CHARS`].
pub fn error_text(text: &str, token: &str) -> String {
    cleaned_text(text, &[token])
}

/// As [`error_text`], for each of the `hidden` values. A hidden value may
/// hold spaces, so each is replaced wherever it is before the words are
/// looked at.
pub(crate) fn cleaned_text(text: &str, hidden: &[&str]) -> String {
    let mut text = text.to_owned();
    for value in hidden.iter().filter(|value| !value.is_empty()) {
        text = text.replace(value, REMOVED);
    }
    let cleaned: Vec<&str> = text
        .split_whitespace()
        .map(|word| {
            if looks_like_a_key(word, hidden) {
                REMOVED
            } else {
                word
            }
        })
        .collect();
    cleaned.join(" ").chars().take(MAX_ERROR_CHARS).collect()
}

fn holds_hidden(text: &str, hidden: &[&str]) -> bool {
    hidden
        .iter()
        .any(|value| !value.is_empty() && text.contains(value))
}

fn looks_like_a_key(word: &str, hidden: &[&str]) -> bool {
    holds_hidden(word, hidden) || find_key_shape(word).is_some() || is_long_random(word)
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
