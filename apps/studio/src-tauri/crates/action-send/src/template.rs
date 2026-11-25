//! Path templates such as `/repos/{owner}/{repo}/actions/runs/{runId}/approve`.

use std::collections::BTreeMap;

use url::Url;

/// One segment of a path template.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Segment {
    /// Sent as written.
    Fixed(String),
    /// Filled with one placeholder's value, percent-encoded.
    Placeholder(String),
}

/// Reads a path template. Each placeholder is a whole segment, and a fixed
/// segment holds only letters, digits, `-`, `_` and `.`, and is never `.`
/// or `..`. A trailing `/` gives an empty last segment.
pub fn parse_path(template: &str) -> Result<Vec<Segment>, String> {
    let rest = template
        .strip_prefix('/')
        .ok_or_else(|| format!("`{template}` doesn't start with /"))?;
    let segments: Vec<&str> = rest.split('/').collect();
    let last = segments.len() - 1;
    segments
        .iter()
        .enumerate()
        .map(|(index, segment)| {
            if let Some(name) = segment
                .strip_prefix('{')
                .and_then(|rest| rest.strip_suffix('}'))
            {
                return is_name(name)
                    .then(|| Segment::Placeholder(name.to_owned()))
                    .ok_or_else(|| {
                        format!("`{{{name}}}` in `{template}` isn't a placeholder name")
                    });
            }
            let empty_last = segment.is_empty() && index == last;
            if empty_last || is_fixed(segment) {
                Ok(Segment::Fixed((*segment).to_owned()))
            } else {
                Err(format!(
                    "`{segment}` in `{template}` isn't a plain path segment"
                ))
            }
        })
        .collect()
}

/// A placeholder's or a body field's name: a letter, then letters, digits or `_`.
pub fn is_name(name: &str) -> bool {
    let mut characters = name.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn is_fixed(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

/// The placeholders a template names, each once at most.
pub fn placeholder_names(segments: &[Segment]) -> Result<Vec<&str>, String> {
    let mut names: Vec<&str> = Vec::new();
    for segment in segments {
        if let Segment::Placeholder(name) = segment {
            if names.contains(&name.as_str()) {
                return Err(format!("`{{{name}}}` is used twice"));
            }
            names.push(name);
        }
    }
    Ok(names)
}

/// Builds the address: the origin, then each segment, a placeholder's value
/// percent-encoded as one segment. The values must already have passed
/// their checks; a missing one is a bug in the caller, refused here too.
pub fn fill(origin: &Url, segments: &[Segment], values: &BTreeMap<String, String>) -> Option<Url> {
    let mut address = origin.clone();
    {
        let mut path = address.path_segments_mut().ok()?;
        path.clear();
        for segment in segments {
            match segment {
                Segment::Fixed(text) => path.push(text),
                Segment::Placeholder(name) => path.push(values.get(name)?),
            };
        }
    }
    // `push` encodes `/`, `?` and `#`, so the origin can't change; checked
    // anyway, because a wrong host here would carry the user's token.
    (address.origin() == origin.origin()).then_some(address)
}
