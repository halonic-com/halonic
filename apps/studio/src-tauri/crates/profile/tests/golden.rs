//! The golden cases `@halonicjs/profile` is checked against
//! (`packages/core/profile/src/golden/profile-folders.json`), so the shell
//! and the CLI find the same profile and trust folder. Requirement
//! `profile.trust-folder`; these tests' names start with `trust_folder_`.

use halonic_profile::{Platform, ProfileEnvironment, ProfileError, profile_folder};
use serde_json::Value;

/// The cases, shared with the TypeScript package's tests.
const GOLDEN: &str =
    include_str!("../../../../../../packages/core/profile/src/golden/profile-folders.json");

/// Drives are written `<drive>` in the cases, so the repo's leak guard
/// doesn't read them as a real machine's paths.
fn with_drive(text: &str) -> String {
    text.replace("<drive>", "D:")
}

/// The environment a case describes.
fn environment_of(case: &Value) -> ProfileEnvironment {
    let platform = match case["platform"].as_str() {
        Some("windows") => Platform::Windows,
        Some("macos") => Platform::Macos,
        Some("linux") => Platform::Linux,
        other => panic!("unknown platform {other:?}"),
    };
    let variable = |name: &str| case["variables"][name].as_str().map(with_drive);
    ProfileEnvironment {
        platform,
        home_folder: with_drive(case["homeFolder"].as_str().unwrap_or_default()),
        halonic_home: variable("HALONIC_HOME"),
        local_app_data: variable("LOCALAPPDATA"),
        xdg_data_home: variable("XDG_DATA_HOME"),
    }
}

#[test]
fn trust_folder_matches_every_golden_case() {
    let cases: Vec<Value> = serde_json::from_str(GOLDEN).unwrap();
    assert!(cases.len() >= 19, "every case is read");
    for case in &cases {
        let name = case["name"].as_str().unwrap_or_default();
        let found = profile_folder(&environment_of(case));
        match case["profile"].as_str() {
            None => assert!(found.is_err(), "{name}: should be refused"),
            Some(expected) => {
                let profile = found.unwrap_or_else(|error| panic!("{name}: {error}"));
                assert_eq!(profile.root, with_drive(expected), "{name}");
                let trust = case["trust"].as_str().map(with_drive);
                assert_eq!(Some(profile.trust_folder()), trust, "{name}");
            }
        }
    }
}

#[test]
fn trust_folder_names_why_an_environment_is_refused() {
    let mut environment = ProfileEnvironment {
        platform: Platform::Linux,
        home_folder: "acme".to_owned(),
        halonic_home: None,
        local_app_data: None,
        xdg_data_home: None,
    };
    let home = profile_folder(&environment).unwrap_err();
    assert_eq!(
        home,
        ProfileError::HomeNotAbsolute {
            value: "acme".to_owned(),
        }
    );
    let message = home.to_string();
    assert!(
        message.contains("home folder must be absolute"),
        "{message}"
    );

    environment.halonic_home = Some("profile".to_owned());
    let chosen = profile_folder(&environment).unwrap_err();
    let message = chosen.to_string();
    assert!(message.starts_with("HALONIC_HOME must be an"), "{message}");
}

#[test]
fn trust_folder_reads_the_platform_this_build_runs_on() {
    let expected = if cfg!(windows) {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Linux
    };
    assert_eq!(Platform::current(), expected);
}
