//! Server pairings (HAL-18501): the host reaches them in one exact form, the
//! page in none.

use halonic_secrets::{
    MemoryBackend, SecretBackend, SecretError, SecretName, delete_host_secret, delete_secret,
    delete_token, get_host_secret, get_secret, get_token, has_secret, is_server_pairing_name,
    set_host_secret, set_secret, set_token,
};

const SHARED_CASES: &str = include_str!("fixtures/server-pairing-names.tsv");
const PAIRING: &str = "server-pairing__0123456789abcdef0123456789abcdef";
const VALUE: &str = "a-test-value-not-a-token";

fn cases() -> impl Iterator<Item = (&'static str, &'static str, &'static str)> {
    SHARED_CASES
        .lines()
        .filter(|line| !line.starts_with('#'))
        .map(|line| {
            let mut columns = line.split('\t');
            let name = columns.next().expect("a name");
            let host = columns.next().expect("the host's answer");
            let page = columns.next().expect("the page's answer");
            (name, host, page)
        })
}

#[test]
fn pairing_names_follow_the_shared_cases_on_the_host_channel() {
    let mut checked = 0;
    for (name, host, _) in cases() {
        let backend = MemoryBackend::new();
        let accepted = host == "accept";
        assert_eq!(is_server_pairing_name(name), accepted, "{name:?}");
        let set = set_host_secret(&backend, name, VALUE);
        if accepted {
            assert_eq!(set, Ok(()), "{name:?}");
            assert_eq!(
                get_host_secret(&backend, name),
                Ok(Some(VALUE.into())),
                "{name:?}"
            );
            assert_eq!(delete_host_secret(&backend, name), Ok(()), "{name:?}");
            assert_eq!(get_host_secret(&backend, name), Ok(None), "{name:?}");
        } else {
            assert!(set.is_err(), "{name:?}");
            assert!(get_host_secret(&backend, name).is_err(), "{name:?}");
            assert!(delete_host_secret(&backend, name).is_err(), "{name:?}");
        }
        checked += 1;
    }
    assert_eq!(checked, 16);
}

#[test]
fn pairing_names_follow_the_shared_cases_on_the_page_commands() {
    for (name, _, page) in cases() {
        let backend = MemoryBackend::new();
        let expected = match page {
            "reserved" => Err(SecretError::ReservedName),
            "invalid" => Err(SecretError::InvalidName),
            "allowed" => Ok(()),
            other => panic!("unknown case {other:?}"),
        };
        assert_eq!(set_secret(&backend, name, VALUE), expected, "{name:?}");
        if page == "allowed" {
            continue;
        }
        assert_eq!(get_secret(&backend, name).map(|_| ()), expected, "{name:?}");
        assert_eq!(has_secret(&backend, name).map(|_| ()), expected, "{name:?}");
        assert_eq!(delete_secret(&backend, name), expected, "{name:?}");
        assert_eq!(set_token(&backend, name, VALUE), expected, "{name:?}");
        assert_eq!(get_token(&backend, name).map(|_| ()), expected, "{name:?}");
        assert_eq!(delete_token(&backend, name), expected, "{name:?}");
    }
}

#[test]
fn a_stored_pairing_is_out_of_the_page_s_reach_in_every_spelling() {
    let backend = MemoryBackend::new();
    set_host_secret(&backend, PAIRING, VALUE).expect("the host stores it");
    let stored = SecretName::parse("server_pairing__0123456789abcdef0123456789abcdef")
        .expect("a valid name");
    assert_eq!(backend.get(&stored), Ok(Some(VALUE.into())));
    for name in [PAIRING, "SERVER_PAIRING__0123456789ABCDEF0123456789ABCDEF"] {
        assert_eq!(get_secret(&backend, name), Err(SecretError::ReservedName));
        assert_eq!(
            delete_secret(&backend, name),
            Err(SecretError::ReservedName)
        );
        assert_eq!(get_token(&backend, name), Err(SecretError::ReservedName));
    }
    assert_eq!(backend.get(&stored), Ok(Some(VALUE.into())));
}
