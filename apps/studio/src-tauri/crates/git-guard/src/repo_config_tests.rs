use super::{ConfigEntry, check_listing, parse_listing};
use crate::error::GitError;

fn entry(scope: &str, key: &str, value: &str) -> ConfigEntry {
    ConfigEntry {
        scope: scope.to_owned(),
        key: key.to_owned(),
        value: value.to_owned(),
    }
}

#[test]
fn git_hardening_reads_config_scopes_keys_and_values_with_newlines() {
    let listing = b"global\0user.name\nAcme Tester\0local\0core.bare\nfalse\0local\0x.flag\0local\0x.text\none\ntwo\0";
    assert_eq!(
        parse_listing(listing),
        [
            entry("global", "user.name", "Acme Tester"),
            entry("local", "core.bare", "false"),
            entry("local", "x.flag", ""),
            entry("local", "x.text", "one\ntwo"),
        ]
    );
}

#[test]
fn git_hardening_refuses_a_listing_git_could_not_give() {
    assert_eq!(check_listing(Some(0)), Ok(()));
    assert_eq!(check_listing(Some(1)), Err(GitError::RepositoryUnreadable));
    assert_eq!(check_listing(None), Err(GitError::RepositoryUnreadable));
}
