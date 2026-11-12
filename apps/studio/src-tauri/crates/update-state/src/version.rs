//! Halonic's version numbers, ordered as semantic versioning orders them, so
//! the updater can tell an update from the version it runs.

use std::cmp::Ordering;
use std::fmt;

/// A version as Halonic's releases write it: `0.1.1` or `0.2.0-test.1`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    major: u64,
    minor: u64,
    patch: u64,
    pre: Vec<Identifier>,
}

/// One dot-separated part of a pre-release: numbers sort below text.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Identifier {
    Number(u64),
    Text(String),
}

impl Version {
    /// Reads `1.2.3` or `1.2.3-test.1`, with a leading `v` as tags have it.
    /// Build metadata (`+…`) is dropped: it doesn't count when versions are
    /// ordered. `None` for anything else, leading zeros included.
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.strip_prefix('v').unwrap_or(text);
        let text = text.split_once('+').map_or(text, |(version, _)| version);
        let (core, pre) = match text.split_once('-') {
            Some((core, pre)) => (core, Some(pre)),
            None => (text, None),
        };
        let mut parts = core.split('.');
        let major = number(parts.next()?)?;
        let minor = number(parts.next()?)?;
        let patch = number(parts.next()?)?;
        if parts.next().is_some() {
            return None;
        }
        let pre = match pre {
            None => Vec::new(),
            Some(pre) => pre.split('.').map(identifier).collect::<Option<_>>()?,
        };
        Some(Version {
            major,
            minor,
            patch,
            pre,
        })
    }
}

fn number(part: &str) -> Option<u64> {
    let digits = !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit());
    if !digits || (part.len() > 1 && part.starts_with('0')) {
        return None;
    }
    part.parse().ok()
}

fn identifier(part: &str) -> Option<Identifier> {
    if part.is_empty()
        || !part
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return None;
    }
    if part.bytes().all(|byte| byte.is_ascii_digit()) {
        number(part).map(Identifier::Number)
    } else {
        Some(Identifier::Text(part.to_owned()))
    }
}

impl Ord for Version {
    /// A release sorts above its own pre-releases: `0.1.1-test.1 < 0.1.1`.
    fn cmp(&self, other: &Self) -> Ordering {
        (self.major, self.minor, self.patch)
            .cmp(&(other.major, other.minor, other.patch))
            .then_with(|| match (self.pre.is_empty(), other.pre.is_empty()) {
                (true, true) => Ordering::Equal,
                (true, false) => Ordering::Greater,
                (false, true) => Ordering::Less,
                (false, false) => self.pre.cmp(&other.pre),
            })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)?;
        for (index, part) in self.pre.iter().enumerate() {
            f.write_str(if index == 0 { "-" } else { "." })?;
            match part {
                Identifier::Number(number) => write!(f, "{number}")?,
                Identifier::Text(text) => f.write_str(text)?,
            }
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "version_tests.rs"]
mod tests;
