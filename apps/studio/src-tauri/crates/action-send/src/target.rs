//! The name an `irreversible` step's user types before it is sent, such as
//! `acme/app` (architecture note on HAL-17491, 6.4). The route list gives it
//! as a template over the route's own placeholders, such as
//! `{owner}/{repo}`, so the name comes from the reviewed catalog and the
//! checked values, never from the page.

use std::collections::BTreeMap;

use crate::call::has_hidden_characters;
use crate::pattern::Pattern;
use crate::template::is_name;

/// One part of a target template.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetPart {
    /// Shown as written.
    Text(String),
    /// Filled with one placeholder's checked value.
    Placeholder(String),
}

/// Reads a target template: text with `{name}` parts, each naming one of
/// the route's placeholders, at least one of them. The text holds no `{`,
/// `}` or hidden character.
pub fn parse_target(
    template: &str,
    placeholders: &BTreeMap<String, Pattern>,
) -> Result<Vec<TargetPart>, String> {
    let mut parts = Vec::new();
    let mut rest = template;
    while !rest.is_empty() {
        let Some(start) = rest.find('{') else {
            parts.push(TargetPart::Text(text_part(rest, template)?));
            break;
        };
        if start > 0 {
            parts.push(TargetPart::Text(text_part(&rest[..start], template)?));
        }
        let after = &rest[start + 1..];
        let end = after
            .find('}')
            .ok_or_else(|| format!("the target `{template}` has an unclosed `{{`"))?;
        let name = &after[..end];
        if !is_name(name) || !placeholders.contains_key(name) {
            return Err(format!(
                "`{{{name}}}` in the target `{template}` isn't one of the route's placeholders"
            ));
        }
        parts.push(TargetPart::Placeholder(name.to_owned()));
        rest = &after[end + 1..];
    }
    if !parts
        .iter()
        .any(|part| matches!(part, TargetPart::Placeholder(_)))
    {
        return Err(format!("the target `{template}` names no placeholder"));
    }
    Ok(parts)
}

fn text_part(text: &str, template: &str) -> Result<String, String> {
    if text.contains('}') || has_hidden_characters(text) {
        return Err(format!(
            "the target `{template}` has a stray `}}` or a hidden character"
        ));
    }
    Ok(text.to_owned())
}

/// The target's name, filled from values that have passed their checks.
pub fn fill_target(parts: &[TargetPart], values: &BTreeMap<String, String>) -> Option<String> {
    parts.iter().try_fold(String::new(), |mut name, part| {
        match part {
            TargetPart::Text(text) => name.push_str(text),
            TargetPart::Placeholder(placeholder) => name.push_str(values.get(placeholder)?),
        }
        Some(name)
    })
}
