//! The name a new workspace folder may have (HAL-8745): one plain folder
//! name that works on Linux, macOS and Windows alike. Requirement
//! `trust-grants`.

use halonic_trust_grant::check_workspace_name;

fn reason(name: &str) -> Option<&'static str> {
    check_workspace_name(name).err().and_then(|refusal| {
        assert_eq!(refusal.kind(), "name_invalid", "{name:?}");
        refusal.reason()
    })
}

#[test]
fn trust_grants_accept_a_plain_name_trimmed() {
    assert_eq!(
        check_workspace_name("  Acme books ").as_deref().ok(),
        Some("Acme books")
    );
    for name in [
        "acme",
        "Acme 2026",
        "a.b",
        "über-café",
        ".hidden",
        "con-sulting",
        "CONSOLE",
        "com10",
    ] {
        assert_eq!(
            check_workspace_name(name).as_deref().ok(),
            Some(name),
            "{name}"
        );
    }
}

#[test]
fn trust_grants_refuse_an_empty_name_and_the_dot_names() {
    assert_eq!(reason(""), Some("empty"));
    assert_eq!(reason("   "), Some("empty"));
    assert_eq!(reason("."), Some("dots"));
    assert_eq!(reason(".."), Some("dots"));
    assert_eq!(reason(" .. "), Some("dots"));
}

#[test]
fn trust_grants_refuse_separators_and_nul_on_every_platform() {
    for name in ["a/b", "a\\b", "../x", "..\\x", "/abs", "a\0b"] {
        assert_eq!(reason(name), Some("separator"), "{name:?}");
    }
}

#[test]
fn trust_grants_refuse_a_name_over_255_bytes() {
    assert!(check_workspace_name(&"a".repeat(255)).is_ok());
    assert_eq!(reason(&"a".repeat(256)), Some("too_long"));
    // Bytes, not characters: 128 two-byte letters are 256 bytes.
    assert_eq!(reason(&"é".repeat(128)), Some("too_long"));
}

#[test]
fn trust_grants_refuse_what_windows_refuses_on_every_platform() {
    for name in [
        "a<b", "a>b", "a:b", "a\"b", "a|b", "a?b", "a*b", "a\nb", "a\tb",
    ] {
        assert_eq!(reason(name), Some("forbidden_character"), "{name:?}");
    }
    for name in ["abc.", "abc..", "a.b."] {
        assert_eq!(reason(name), Some("trailing_dot_or_space"), "{name:?}");
    }
    for name in [
        "CON",
        "con",
        "Nul",
        "AUX",
        "PRN",
        "COM1",
        "lpt9",
        "CON.txt",
        "nul.tar.gz",
        "CON .txt",
    ] {
        assert_eq!(reason(name), Some("reserved_name"), "{name:?}");
    }
}
