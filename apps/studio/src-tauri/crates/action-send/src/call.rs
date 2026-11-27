//! Checks what the page asked for against one route, and builds the call.
//! The page names a step and gives values; the method, the address, the
//! body's shape and the fields to keep all come from the route.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use url::Url;

use crate::pattern::Pattern;
use crate::routes::{BodyField, BodyKind, CallRoute, Method, RouteList, StepKey};
use crate::template::fill_call;

/// The most items an `integer-list` body field may hold.
pub const MAX_LIST_ITEMS: usize = 100;

/// Why a send or an open was refused before anything left the computer:
/// `ActionRefusal` in `@halonicjs/ports`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Refusal {
    NotInCatalog,
    BadValue,
    SignedOut,
    TooOften,
}

/// Which reviewed step, and a value for each of its placeholders:
/// `ActionStepRef` in `@halonicjs/ports`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StepRef {
    pub definition: String,
    pub version: u32,
    pub step: u32,
    pub placeholders: BTreeMap<String, String>,
}

impl StepRef {
    /// The route list's key for the step.
    pub fn key(&self) -> StepKey {
        StepKey {
            definition: self.definition.clone(),
            version: self.version,
            step: self.step,
        }
    }
}

/// A request to send one call step: `ActionSendRequest` in `@halonicjs/ports`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SendRequest {
    pub definition: String,
    pub version: u32,
    pub step: u32,
    pub placeholders: BTreeMap<String, String>,
    #[serde(default)]
    pub body: BTreeMap<String, Value>,
}

/// A call ready to send, without the token, which the sender adds last.
#[derive(Debug, Clone)]
pub struct PreparedCall<'a> {
    pub route: &'a CallRoute,
    pub address: Url,
    /// The JSON body, or `None` when the route has no body fields.
    pub body: Option<Map<String, Value>>,
}

/// Whether the text holds a control character (C0, DEL or C1) or one
/// that changes the direction text is shown in (U+200E, U+200F,
/// U+202A–U+202E, U+2066–U+2069). The page's values end up in the native
/// confirmation, where such characters could hide or reorder what the user
/// reads, so they are refused whatever the route's pattern allows (Julian's
/// review of HAL-17525).
pub fn has_hidden_characters(text: &str) -> bool {
    text.chars().any(|character| {
        character.is_control()
            || matches!(
                character,
                '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
            )
    })
}

/// Checks each placeholder value: exactly the route's names, none empty,
/// `.` or `..`, none holding `/`, `\`, `?`, `#`, `%` or a hidden character,
/// each matching its pattern.
pub fn check_placeholders(
    declared: &BTreeMap<String, Pattern>,
    given: &BTreeMap<String, String>,
) -> Result<(), Refusal> {
    if declared.len() != given.len() {
        return Err(Refusal::BadValue);
    }
    let all_fit = given.iter().all(|(name, value)| {
        let one_segment = !value.is_empty()
            && value != "."
            && value != ".."
            && !value.contains(['/', '\\', '?', '#', '%'])
            && !has_hidden_characters(value);
        one_segment
            && declared
                .get(name)
                .is_some_and(|pattern| pattern.matches(value))
    });
    if all_fit {
        Ok(())
    } else {
        Err(Refusal::BadValue)
    }
}

fn checked_value(field: &BodyField, value: Option<&Value>) -> Result<Option<Value>, Refusal> {
    let checked = match (&field.kind, value) {
        // Typed into the shell's dialog during the send, never from the page.
        (BodyKind::SecretInput, None) => return Ok(None),
        (BodyKind::Constant(constant), None) => constant.clone(),
        (BodyKind::Text(pattern), Some(Value::String(text)))
            if pattern.matches(text) && !has_hidden_characters(text) =>
        {
            Value::String(text.clone())
        }
        (BodyKind::Integer, Some(number @ Value::Number(n))) if n.is_i64() || n.is_u64() => {
            number.clone()
        }
        (BodyKind::Boolean, Some(flag @ Value::Bool(_))) => flag.clone(),
        (BodyKind::IntegerList, Some(Value::Array(items)))
            if items.len() <= MAX_LIST_ITEMS
                && items.iter().all(|item| item.is_i64() || item.is_u64()) =>
        {
            Value::Array(items.clone())
        }
        _ => return Err(Refusal::BadValue),
    };
    Ok(Some(checked))
}

/// Builds the body field by field from the route: every field the page must
/// give, none extra, each of its kind, plus the route's constants. A
/// `secret-input` field never comes from the page: the sender adds the
/// typed value when it writes the body.
fn check_body(
    route: &CallRoute,
    given: &BTreeMap<String, Value>,
) -> Result<Option<Map<String, Value>>, Refusal> {
    let page_fields = route
        .body
        .iter()
        .filter(|field| !matches!(field.kind, BodyKind::Constant(_) | BodyKind::SecretInput))
        .count();
    if given.len() != page_fields {
        return Err(Refusal::BadValue);
    }
    if route.body.is_empty() {
        return Ok(None);
    }
    let mut body = Map::new();
    for field in &route.body {
        if let Some(value) = checked_value(field, given.get(&field.name))? {
            body.insert(field.name.clone(), value);
        }
    }
    Ok(Some(body))
}

/// Refuses a query value holding `&` or `=`. The value is form-encoded
/// anyway, so it can't add a pair; this refuses it before that matters
/// (Liam's conditions on HAL-20239).
fn check_query_values(route: &CallRoute, values: &BTreeMap<String, String>) -> Result<(), Refusal> {
    let adds_a_pair = route.query.iter().any(|pair| {
        values
            .get(&pair.placeholder)
            .is_none_or(|value| value.contains(['&', '=']))
    });
    if adds_a_pair {
        Err(Refusal::BadValue)
    } else {
        Ok(())
    }
}

/// Finds the request's route and checks every value the page gave.
pub fn prepare<'a>(
    list: &'a RouteList,
    request: &SendRequest,
) -> Result<PreparedCall<'a>, Refusal> {
    let key = StepKey {
        definition: request.definition.clone(),
        version: request.version,
        step: request.step,
    };
    let route = list.calls.get(&key).ok_or(Refusal::NotInCatalog)?;
    check_placeholders(&route.placeholders, &request.placeholders)?;
    check_query_values(route, &request.placeholders)?;
    let body = check_body(route, &request.body)?;
    if route.method == Method::Get && body.is_some() {
        return Err(Refusal::BadValue);
    }
    let origin = Url::parse(route.service.api_origin).map_err(|_| Refusal::NotInCatalog)?;
    let address = fill_call(
        &origin,
        route.service.base_path,
        &route.path,
        &route.query,
        &request.placeholders,
    )
    .ok_or(Refusal::BadValue)?;
    Ok(PreparedCall {
        route,
        address,
        body,
    })
}
