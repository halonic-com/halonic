//! Halonic version numbers, compared the way semantic versioning orders them.

use std::cmp::Ordering;
use std::fmt;

/// A version such as `0.1.0` or `0.1.0-beta.1`. Build metadata after `+` is
/// accepted and ignored, as semantic versioning says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    /// The pre-release identifiers, `["beta", "1"]` for `0.1.0-beta.1`.
    /// Empty for a release.
    pub pre_release: Vec<String>,
}

impl Version {
    /// Reads `major.minor.patch`, with an optional `-pre.release` and
    /// `+build`. Returns `None` for anything else.
    pub fn parse(text: &str) -> Option<Version> {
        let without_build = text.split_once('+').map_or(text, |(version, _)| version);
        let (core, pre_release) = match without_build.split_once('-') {
            Some((core, pre)) => (core, parse_pre_release(pre)?),
            None => (without_build, Vec::new()),
        };
        let mut numbers = core.split('.').map(parse_number);
        let version = Version {
            major: numbers.next()??,
            minor: numbers.next()??,
            patch: numbers.next()??,
            pre_release,
        };
        numbers.next().is_none().then_some(version)
    }
}

/// Digits only, without a leading zero.
fn parse_number(text: &str) -> Option<u64> {
    let digits_only = !text.is_empty() && text.chars().all(|c| c.is_ascii_digit());
    let leading_zero = text.len() > 1 && text.starts_with('0');
    (digits_only && !leading_zero)
        .then(|| text.parse().ok())
        .flatten()
}

/// Dot-separated identifiers of letters, digits and hyphens. A numeric one
/// has no leading zero, so `beta.01` and `beta.1` can't both exist.
fn parse_pre_release(text: &str) -> Option<Vec<String>> {
    let is_identifier = |part: &str| {
        let numeric = part.chars().all(|c| c.is_ascii_digit());
        match numeric {
            true => parse_number(part).is_some(),
            false => part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
        }
    };
    let parts: Vec<String> = text.split('.').map(str::to_owned).collect();
    parts
        .iter()
        .all(|part| is_identifier(part))
        .then_some(parts)
}

impl Ord for Version {
    /// A pre-release comes before its release: `0.1.0-beta.1 < 0.1.0`.
    fn cmp(&self, other: &Self) -> Ordering {
        (self.major, self.minor, self.patch)
            .cmp(&(other.major, other.minor, other.patch))
            .then_with(
                || match (self.pre_release.is_empty(), other.pre_release.is_empty()) {
                    (true, true) => Ordering::Equal,
                    (true, false) => Ordering::Greater,
                    (false, true) => Ordering::Less,
                    (false, false) => compare_pre_release(&self.pre_release, &other.pre_release),
                },
            )
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Identifier by identifier: numbers compare as numbers and come before
/// words; when one list runs out first, the shorter one comes first.
fn compare_pre_release(ours: &[String], theirs: &[String]) -> Ordering {
    for (a, b) in ours.iter().zip(theirs) {
        let order = match (a.parse::<u64>(), b.parse::<u64>()) {
            (Ok(a), Ok(b)) => a.cmp(&b),
            (Ok(_), Err(_)) => Ordering::Less,
            (Err(_), Ok(_)) => Ordering::Greater,
            (Err(_), Err(_)) => a.cmp(b),
        };
        if order != Ordering::Equal {
            return order;
        }
    }
    ours.len().cmp(&theirs.len())
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)?;
        if !self.pre_release.is_empty() {
            write!(f, "-{}", self.pre_release.join("."))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(text: &str) -> Version {
        Version::parse(text).expect("a test version")
    }

    #[test]
    fn hello_versions_read_releases_pre_releases_and_build_metadata() {
        assert_eq!(v("0.1.0").to_string(), "0.1.0");
        assert_eq!(v("0.1.0-beta.1").to_string(), "0.1.0-beta.1");
        assert_eq!(v("1.2.3+abc.5").to_string(), "1.2.3");
        for bad in [
            "",
            "0.1",
            "0.1.0.0",
            "v0.1.0",
            "01.1.0",
            "0.1.0-",
            "0.1.0-beta..1",
            "0.1.0-beta.01",
            "0.1.x",
        ] {
            assert_eq!(Version::parse(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn hello_versions_compare_in_semantic_versioning_order() {
        let ordered = [
            "0.1.0-alpha",
            "0.1.0-alpha.1",
            "0.1.0-alpha.beta",
            "0.1.0-beta.2",
            "0.1.0-beta.11",
            "0.1.0-rc.1",
            "0.1.0",
            "0.1.1",
            "0.2.0",
            "0.10.0",
            "1.0.0",
        ];
        for pair in ordered.windows(2) {
            assert!(v(pair[0]) < v(pair[1]), "{} < {}", pair[0], pair[1]);
        }
        assert_eq!(v("0.1.0+one").cmp(&v("0.1.0+two")), Ordering::Equal);
    }
}
