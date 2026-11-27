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

/// One pair of a call's query: a fixed key, filled with one placeholder's
/// value. The key comes from the route list, never from the page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryPair {
    pub key: String,
    pub placeholder: String,
}

/// Reads a call's template: a path as [`parse_path`] reads it, then an
/// optional query of `key={name}` pairs joined by `&`, such as
/// `/zones/{zone}/dns_records?type={type}&name.exact={name}`. Each key is
/// fixed text and each value a whole placeholder, so a definition can't add
/// a key and a value can't add a pair (plan on HAL-17530).
pub fn parse_call_path(template: &str) -> Result<(Vec<Segment>, Vec<QueryPair>), String> {
    let Some((path, query)) = template.split_once('?') else {
        return Ok((parse_path(template)?, Vec::new()));
    };
    let pairs = query
        .split('&')
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            let placeholder = value
                .strip_prefix('{')
                .and_then(|rest| rest.strip_suffix('}'))
                .filter(|name| is_name(name));
            match placeholder {
                Some(name) if is_fixed(key) => Ok(QueryPair {
                    key: key.to_owned(),
                    placeholder: name.to_owned(),
                }),
                _ => Err(format!(
                    "`{pair}` in `{template}` isn't a fixed key and one placeholder"
                )),
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok((parse_path(path)?, pairs))
}

/// The placeholders a call's path and query name, each once at most.
pub fn call_placeholder_names<'a>(
    segments: &'a [Segment],
    query: &'a [QueryPair],
) -> Result<Vec<&'a str>, String> {
    let mut names = placeholder_names(segments)?;
    for pair in query {
        let name = pair.placeholder.as_str();
        if names.contains(&name) {
            return Err(format!("`{{{name}}}` is used twice"));
        }
        names.push(name);
    }
    Ok(names)
}

/// Builds a call's address: the service's base path, then the route's path
/// as [`fill`] does, then each query pair with its value form-encoded. The
/// values must already have passed their checks.
pub fn fill_call(
    origin: &Url,
    base_path: &str,
    segments: &[Segment],
    query: &[QueryPair],
    values: &BTreeMap<String, String>,
) -> Option<Url> {
    let base = base_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| Segment::Fixed(segment.to_owned()));
    let whole: Vec<Segment> = base.chain(segments.iter().cloned()).collect();
    let mut address = fill(origin, &whole, values)?;
    if !query.is_empty() {
        let mut pairs = address.query_pairs_mut();
        for pair in query {
            pairs.append_pair(&pair.key, values.get(&pair.placeholder)?);
        }
    }
    (address.origin() == origin.origin()).then_some(address)
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
