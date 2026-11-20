//! Secret names, checked against the cases the CLI's token store shares.

use halonic_secrets::{HALONIC_NAMES, SecretError, SecretName};

const SHARED_CASES: &str = include_str!("fixtures/canonical-names.tsv");

#[test]
fn secret_names_match_the_cli_canonical_form() {
    let cases = SHARED_CASES.lines().filter(|line| !line.starts_with('#'));
    let mut checked = 0;
    for line in cases {
        let (name, expected) = line.split_once('\t').expect("each case has a tab");
        let actual = SecretName::parse(name);
        match expected {
            "INVALID" => assert_eq!(actual, Err(SecretError::InvalidName), "{name:?}"),
            canonical => assert_eq!(
                actual.map(|name| name.as_str().to_owned()),
                Ok(canonical.to_owned())
            ),
        }
        checked += 1;
    }
    assert_eq!(checked, 13);
}

#[test]
fn secret_names_that_differ_in_case_or_dashes_are_the_same() {
    let first = SecretName::parse("Provider-Anthropic").expect("a valid name");
    let second = SecretName::parse("provider_anthropic").expect("a valid name");
    assert_eq!(first, second);
}

const RESERVED_NAMES: &str = include_str!("fixtures/reserved-names.txt");

#[test]
fn secret_names_reserved_by_the_shell_are_the_shared_ones() {
    let mut shared: Vec<&str> = RESERVED_NAMES
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();
    let mut reserved = HALONIC_NAMES.to_vec();
    shared.sort_unstable();
    reserved.sort_unstable();
    assert_eq!(reserved, shared);
    for name in HALONIC_NAMES {
        let parsed = SecretName::parse(name).expect("a valid name");
        assert!(parsed.is_halonic(), "{name}");
    }
}
