//! The pages a stepper may open in the user's browser: a guided step's page,
//! built from its route, and a `browser` block's address, which an agent
//! wrote, checked against the web origins and their path prefixes
//! (architecture note on HAL-17491, 7.1).
//!
//! [`check_page`] applies the same rules as `checkBrowserAddress` in
//! `@halonicjs/action-steppers`; the shell checks again because the page
//! could skip its own check.

use std::collections::BTreeMap;

use url::Url;

use crate::routes::{GuidedRoute, WebOriginFile};
use crate::template::{Segment, fill, parse_path};

/// The pages `browser` blocks may open on one host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebOrigin {
    pub service: String,
    /// The host alone, lower-case. Always `https` on the default port.
    pub host: String,
    /// Each prefix's segments. Every prefix ends with `/`, so its last
    /// segment is empty.
    pub prefixes: Vec<Vec<Segment>>,
}

pub(crate) fn parse_web_origin(file: &WebOriginFile) -> Result<WebOrigin, String> {
    let host_is_plain = file.host.contains('.')
        && file.host.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-'
        });
    if !host_is_plain {
        return Err(format!("`{}` isn't a lower-case host name", file.host));
    }
    let prefixes = file
        .path_prefixes
        .iter()
        .map(|prefix| {
            if prefix.len() < 2 || !prefix.ends_with('/') {
                return Err(format!("the prefix `{prefix}` doesn't end with /"));
            }
            parse_path(prefix)
        })
        .collect::<Result<_, _>>()?;
    Ok(WebOrigin {
        service: file.service.clone(),
        host: file.host.clone(),
        prefixes,
    })
}

/// The address of a guided step's page, with the placeholders filled. The
/// values must already have passed their checks.
pub fn guided_address(route: &GuidedRoute, values: &BTreeMap<String, String>) -> Option<Url> {
    let origin = Url::parse(&format!("https://{}/", route.host)).ok()?;
    fill(&origin, &route.path, values)
}

/// Anything but printable ASCII. Browsers drop tabs and line breaks from an
/// address, so `.<TAB>.` would open as `..` after the checks passed.
fn is_unprintable(character: char) -> bool {
    !('\x21'..='\x7e').contains(&character)
}

/// Checks a `browser` block's address and gives back the address to open,
/// or why it is refused: `https` only, no user name, password or port, a
/// host on the list, no query or fragment, and a path that, decoded once,
/// holds no `.` or `..` segment, `..`, `//`, `\`, `%2F` or unprintable
/// character and starts with one of the host's prefixes.
pub fn check_page(address: &str, origins: &[WebOrigin]) -> Result<Url, String> {
    if address.chars().any(is_unprintable) {
        return Err(
            "the address holds a space, tab, line break or other unprintable character".to_owned(),
        );
    }
    let (scheme, rest) = address.split_once("://").ok_or("not a web address")?;
    if !scheme.eq_ignore_ascii_case("https") {
        return Err("only https pages can be opened".to_owned());
    }
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (authority, rest) = rest.split_at(authority_end);
    if authority.contains('@') {
        return Err("the address carries a user name or password".to_owned());
    }
    if authority.contains(':') {
        return Err("the address names a port".to_owned());
    }
    let host = authority.to_ascii_lowercase();
    let origin = origins
        .iter()
        .find(|origin| origin.host == host)
        .ok_or_else(|| format!("`https://{host}` isn't on the allow-list for browser steps"))?;
    if rest.contains(['?', '#']) {
        return Err("the address carries a query or fragment".to_owned());
    }
    let decoded = decode_once(rest).ok_or("the address has a path trick")?;
    if has_path_trick(&decoded) {
        return Err("the address has a path trick".to_owned());
    }
    let allowed = origin
        .prefixes
        .iter()
        .any(|prefix| starts_with(&decoded, prefix));
    if !allowed {
        return Err(format!(
            "`{host}{decoded}` isn't a page browser steps may open"
        ));
    }
    let page = Url::parse(&format!("https://{host}{rest}")).map_err(|error| error.to_string())?;
    // The parser may tidy the path, but never the host.
    if page.host_str() != Some(host.as_str()) {
        return Err("the address has a path trick".to_owned());
    }
    Ok(page)
}

/// Decodes `%XX` escapes once, or `None` when an escape is malformed or the
/// result isn't UTF-8, as `decodeURIComponent` refuses it.
fn decode_once(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn has_path_trick(decoded: &str) -> bool {
    // The browser removes `.` and `..` segments, which would step outside
    // the prefix; some browsers read `\` as `/`.
    let dot_segment = decoded
        .split('/')
        .any(|segment| segment == "." || segment == "..");
    dot_segment
        || decoded.chars().any(is_unprintable)
        || decoded.contains("..")
        || decoded.contains("//")
        || decoded.contains('\\')
        || decoded.to_ascii_lowercase().contains("%2f")
}

/// Whether the decoded path starts with the prefix, where a placeholder
/// stands for one non-empty segment.
fn starts_with(decoded: &str, prefix: &[Segment]) -> bool {
    let Some(path) = decoded.strip_prefix('/') else {
        return false;
    };
    let segments: Vec<&str> = path.split('/').collect();
    // The prefix's empty last segment needs the `/` after the one before it.
    segments.len() >= prefix.len()
        && prefix
            .iter()
            .zip(&segments)
            .all(|(wanted, segment)| match wanted {
                Segment::Fixed(text) if text.is_empty() => true,
                Segment::Fixed(text) => text == segment,
                Segment::Placeholder(_) => !segment.is_empty(),
            })
}
