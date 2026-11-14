//! The golden cases `@halonicjs/profile` is checked against
//! (`packages/core/profile/src/golden/profile-folders.json`), so the shell
//! and the CLI find the same profile, trust folder and settings folder.
//! Requirements `profile.trust-folder` and `profile.settings-folder`; these
//! tests' names start with `trust_folder_` and `settings_folder_`.

use halonic_profile::{Platform, ProfileEnvironment, ProfileError, ProfileFolder, profile_folder};
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
fn settings_folder_matches_every_golden_case() {
    let cases: Vec<Value> = serde_json::from_str(GOLDEN).unwrap();
    let mut checked = 0;
    for case in &cases {
        let name = case["name"].as_str().unwrap_or_default();
        let Some(expected) = case["settings"].as_str() else {
            assert!(
                case["settings"].is_null(),
                "{name}: settings is text or null"
            );
            continue;
        };
        let profile =
            profile_folder(&environment_of(case)).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(profile.settings_folder(), with_drive(expected), "{name}");
        checked += 1;
    }
    assert!(checked >= 19, "every case that finds a profile is checked");
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

/// A source's folder in `tool-approvals` for each location and source, as
/// `FileToolApprovalStore` in `fs-node` names it; its test
/// (`tool-approval-source-folders.test.ts`) holds the same cases.
const SOURCE_FOLDERS: [(&str, &str, &str); 6] = [
    (
        "/workspaces/acme",
        "notes",
        "598bee61ee995ab2430bab8a986cf4088f0f2bfd7ceb0801f9d4e1606bd1853b",
    ),
    (
        "/workspaces/acme",
        "docs",
        "d2e0367df032e0b4b1b3627c040398c5e499c4922b89fac925de869f7b466daa",
    ),
    (
        "/workspaces/acme corp/\"quoted\"",
        "back\\slash",
        "0e24a9db7069b33259e8c8e3c563c99b9fec6c444c58708c66239073c2f153d1",
    ),
    (
        "/workspaces/ünï/日本語/😀",
        "tab\tnew\nline",
        "43f61f52c3cad41428f4ce30f92ef888084ca8ca413d40de1a417e851d60d368",
    ),
    (
        "/workspaces/acme",
        "ctrl\u{1}\u{1f}\u{7f}\u{2028} end",
        "e1a7c2af4be3f819adab2663ce45202d8366c06e5deeca57954b6f0b5abd2028",
    ),
    (
        "<drive>\\workspaces\\acme",
        "notes",
        "1beb4f517c161304795c68b7f2d49c5929b328a33136722d04d07020ce4b35b5",
    ),
];

#[test]
fn tool_approval_source_folder_matches_every_golden_case() {
    let profile = ProfileFolder {
        platform: Platform::Linux,
        root: "/srv/acme/.local/share/halonic".to_owned(),
    };
    for (location, source, folder) in SOURCE_FOLDERS {
        assert_eq!(
            profile.tool_approval_source_folder(location, source),
            format!("/srv/acme/.local/share/halonic/tool-approvals/{folder}"),
            "{location:?} {source:?}"
        );
    }
}

#[test]
fn tool_approval_source_folder_drops_the_verbatim_prefix_on_windows() {
    let profile = ProfileFolder {
        platform: Platform::Windows,
        root: with_drive(r"<drive>\Users\acme\halonic"),
    };
    let plain = profile.tool_approval_source_folder(&with_drive(r"<drive>\work\acme"), "notes");
    let verbatim =
        profile.tool_approval_source_folder(&with_drive(r"\\?\<drive>\work\acme"), "notes");
    assert_eq!(plain, verbatim);
    assert!(plain.starts_with(&with_drive(r"<drive>\Users\acme\halonic\tool-approvals\")));
}

#[test]
fn tool_approval_folder_is_tool_approvals_in_the_profile() {
    let profile = ProfileFolder {
        platform: Platform::Linux,
        root: "/srv/acme/.local/share/halonic".to_owned(),
    };
    assert_eq!(
        profile.tool_approval_folder(),
        "/srv/acme/.local/share/halonic/tool-approvals"
    );
}
