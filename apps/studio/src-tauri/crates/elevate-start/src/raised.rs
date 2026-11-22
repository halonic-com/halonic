//! Whether Studio itself was started with administrator rights it wasn't
//! given by default (HAL-16541). Studio installs per user, so the agent host
//! it starts is in a folder the user's programs without those rights can
//! write: a Studio opened with "Run as administrator" would start whatever
//! such a program put there, raised. The shell refuses to start then.
//!
//! The rule is the installer's `RaisedFromLimitedRights` (HAL-16523): only
//! the elevation type "full" counts, which Windows gives a program raised
//! from an account whose other programs run without those rights. With UAC
//! off, or for the built-in Administrator, every program of the account has
//! the rights already (type "default"), so refusing would change nothing.
//! When the type can't be read, any administrator counts as raised.

/// A process token's elevation type, as Windows names it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elevation {
    /// UAC is off, or the account isn't split: the rights the account has.
    Default,
    /// Raised to administrator rights from a split account.
    Full,
    /// A split account's program without administrator rights.
    Limited,
}

/// Whether a process with token elevation type `read` (`None` when it
/// can't be read) is raised; `administrator` is asked only then.
pub fn raised(read: Option<Elevation>, administrator: impl FnOnce() -> bool) -> bool {
    match read {
        Some(elevation) => elevation == Elevation::Full,
        None => administrator(),
    }
}

#[cfg(test)]
mod tests {
    use super::{Elevation, raised};

    #[test]
    fn raised_start_counts_only_full_elevation() {
        assert!(raised(Some(Elevation::Full), || false));
        assert!(!raised(Some(Elevation::Default), || true));
        assert!(!raised(Some(Elevation::Limited), || true));
    }

    #[test]
    fn raised_start_counts_any_administrator_when_the_type_cant_be_read() {
        assert!(raised(None, || true));
        assert!(!raised(None, || false));
    }

    #[test]
    fn raised_start_asks_about_administrators_only_without_a_type() {
        let mut asked = false;
        raised(Some(Elevation::Default), || {
            asked = true;
            true
        });
        assert!(!asked);
    }
}
