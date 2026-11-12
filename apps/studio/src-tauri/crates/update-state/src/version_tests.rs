use super::Version;

fn version(text: &str) -> Version {
    Version::parse(text).unwrap_or_else(|| panic!("{text} is a version"))
}

#[test]
fn update_state_orders_versions_as_semver_does() {
    let sorted = [
        "0.1.0",
        "0.1.1-test",
        "0.1.1-test.1",
        "0.1.1-test.2",
        "0.1.1-test.10",
        "0.1.1-test.a",
        "0.1.1",
        "0.2.0",
        "1.0.0",
    ];
    for pair in sorted.windows(2) {
        assert!(
            version(pair[0]) < version(pair[1]),
            "{} < {}",
            pair[0],
            pair[1]
        );
    }
}

#[test]
fn update_state_reads_tags_and_drops_build_metadata() {
    assert_eq!(version("v0.1.1"), version("0.1.1"));
    assert_eq!(version("0.1.1+abc"), version("0.1.1"));
    assert_eq!(version("v0.2.0-test.1").to_string(), "0.2.0-test.1");
}

#[test]
fn update_state_refuses_what_is_not_a_version() {
    for text in [
        "",
        "0.1",
        "0.1.1.1",
        "01.1.1",
        "0.1.x",
        "0.1.1-",
        "0.1.1-a..b",
        "0.1.1-é",
        "latest",
    ] {
        assert_eq!(Version::parse(text), None, "{text:?}");
    }
}
