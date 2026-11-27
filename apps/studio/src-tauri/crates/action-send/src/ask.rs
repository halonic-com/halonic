//! The shell's dialog with text fields (HAL-18085; architecture note on
//! HAL-17491, 1.2, 2.4 and 6.4). An `irreversible` step is sent only after
//! the user types its target's name, and a `secret-input` value is typed
//! into the dialog and goes from there into the call: never through the
//! page, a result or a log line.

use serde_json::{Map, Value};

use crate::routes::{BodyKind, CallRoute};
use crate::send::ConfirmSheet;
use crate::wipe::Wiped;

/// What the dialog asks for, on top of what the `admin` confirmation shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AskSheet {
    pub confirm: ConfirmSheet,
    /// For an `irreversible` step, the name the user types, such as `acme/app`.
    pub target: Option<String>,
    /// The names of the step's `secret-input` fields, in the route's order.
    /// Each is typed into a masked field.
    pub secrets: Vec<String>,
}

/// Text the user typed. Its bytes are overwritten with zeros when it is
/// dropped, and it is never printed: `Debug` shows only its length.
pub struct TypedText(Wiped);

impl TypedText {
    /// Takes the text over without copying it.
    pub fn new(text: String) -> Self {
        Self(Wiped::text(text))
    }

    /// The text.
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl std::fmt::Debug for TypedText {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "TypedText({} bytes)", self.0.0.len())
    }
}

/// What the user typed into the dialog before pressing Send.
#[derive(Debug, Default)]
pub struct Typed {
    /// The target's name, when the dialog asked for it.
    pub target: Option<TypedText>,
    /// Each secret field's name and value.
    pub secrets: Vec<(String, TypedText)>,
}

/// Why typed answers aren't sent. Neither holds what was typed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Mismatch {
    /// The name typed isn't the target's, exactly.
    WrongTarget,
    /// A secret is missing, empty, or isn't one the dialog asked for.
    WrongSecrets,
}

/// Checks the answers against the sheet: the target's name exactly as the
/// shell built it, and one value, not empty, for each secret field asked
/// for, and nothing else. Hands back the secrets.
pub(crate) fn checked(
    sheet: &AskSheet,
    typed: Typed,
) -> Result<Vec<(String, TypedText)>, Mismatch> {
    let target_matches = match (&sheet.target, &typed.target) {
        (Some(expected), Some(given)) => given.as_str() == expected,
        (None, None) => true,
        _ => false,
    };
    if !target_matches {
        return Err(Mismatch::WrongTarget);
    }
    let names: Vec<&str> = typed
        .secrets
        .iter()
        .map(|(name, _)| name.as_str())
        .collect();
    let all_given = names.len() == sheet.secrets.len()
        && sheet
            .secrets
            .iter()
            .zip(&names)
            .all(|(asked, given)| asked == given)
        && typed
            .secrets
            .iter()
            .all(|(_, value)| !value.as_str().is_empty());
    if !all_given {
        return Err(Mismatch::WrongSecrets);
    }
    Ok(typed.secrets)
}

/// The names of the route's `secret-input` fields, in its order.
pub(crate) fn secret_fields(route: &CallRoute) -> Vec<String> {
    route
        .body
        .iter()
        .filter(|field| field.kind == BodyKind::SecretInput)
        .map(|field| field.name.clone())
        .collect()
}

/// The JSON body: the checked page and constant fields, and each typed
/// secret, in the route's order. A secret is written straight into one
/// buffer sized so it never grows, so no other copy of it is left behind;
/// the outgoing call wipes that buffer once it is sent.
pub(crate) fn body_bytes(
    route: &CallRoute,
    checked: &Map<String, Value>,
    secrets: &[(String, TypedText)],
) -> Vec<u8> {
    // A character takes at most 6 bytes in JSON (`\u001f`), and each name
    // and separator is counted with room to spare.
    let secret_room: usize = secrets
        .iter()
        .map(|(name, value)| 6 * (name.len() + value.as_str().len()) + 8)
        .sum();
    let checked_room: usize = checked
        .iter()
        .map(|(name, value)| 6 * name.len() + value.to_string().len() + 8)
        .sum();
    let mut out = Vec::with_capacity(secret_room + checked_room + 2);
    out.push(b'{');
    let mut first = true;
    for field in &route.body {
        let secret = secrets
            .iter()
            .find(|(name, _)| *name == field.name)
            .map(|(_, value)| value.as_str());
        let value = checked.get(&field.name);
        if secret.is_none() && value.is_none() {
            continue;
        }
        if !first {
            out.push(b',');
        }
        first = false;
        // Writing a `&str` or a `Value` to a `Vec` can't fail.
        let _ = serde_json::to_writer(&mut out, &field.name);
        out.push(b':');
        let _ = match secret {
            Some(secret) => serde_json::to_writer(&mut out, secret),
            None => serde_json::to_writer(&mut out, &value),
        };
    }
    out.push(b'}');
    out
}
