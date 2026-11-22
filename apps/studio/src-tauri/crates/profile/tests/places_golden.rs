//! The golden cases `@halonicjs/profile` is checked against
//! (`packages/core/profile/src/golden/profile-places.json`), so the shell
//! refuses the same workspaces for their profile's place as the CLI.
//! Requirement `profile.profile-outside-workspace`; these tests' names start
//! with `profile_place_`.

use halonic_profile::{
    Platform, ProfileEnvironment, ProfileMover, ProfilePlaces, ProfileRefusal,
    built_in_profile_folder, profile_mover, profile_refusal,
};
use serde_json::Value;

/// The cases, shared with the TypeScript package's tests.
const GOLDEN: &str =
    include_str!("../../../../../../packages/core/profile/src/golden/profile-places.json");

/// Drives are written `<drive>` in the cases, so the repo's leak guard
/// doesn't read them as a real machine's paths.
fn with_drive(text: &str) -> String {
    text.replace("<drive>", "D:")
}

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str() {
        Some("windows") => Platform::Windows,
        Some("macos") => Platform::Macos,
        Some("linux") => Platform::Linux,
        other => panic!("unknown platform {other:?}"),
    }
}

fn mover_of(case: &Value) -> Option<ProfileMover> {
    match case["movedBy"].as_str() {
        None => None,
        Some("HALONIC_HOME") => Some(ProfileMover::HalonicHome),
        Some("XDG_DATA_HOME") => Some(ProfileMover::XdgDataHome),
        Some("LOCALAPPDATA") => Some(ProfileMover::LocalAppData),
        Some(other) => panic!("unknown variable {other:?}"),
    }
}

fn golden(list: &str) -> Vec<Value> {
    let cases: Value = serde_json::from_str(GOLDEN).unwrap();
    cases[list].as_array().cloned().unwrap_or_default()
}

#[test]
fn profile_place_built_in_folder_and_mover_match_every_golden_case() {
    let cases = golden("environments");
    assert!(cases.len() >= 10, "every case is read");
    for case in &cases {
        let name = case["name"].as_str().unwrap_or_default();
        let variable = |name: &str| case["variables"][name].as_str().map(with_drive);
        let environment = ProfileEnvironment {
            platform: platform_of(case),
            home_folder: with_drive(case["homeFolder"].as_str().unwrap_or_default()),
            halonic_home: variable("HALONIC_HOME"),
            local_app_data: variable("LOCALAPPDATA"),
            xdg_data_home: variable("XDG_DATA_HOME"),
        };
        let built_in =
            built_in_profile_folder(&environment).unwrap_or_else(|error| panic!("{name}: {error}"));
        let expected = with_drive(case["builtIn"].as_str().unwrap_or_default());
        assert_eq!(built_in.root, expected, "{name}");
        assert_eq!(profile_mover(&environment), mover_of(case), "{name}");
    }
}

#[test]
fn profile_place_refusal_matches_every_golden_case() {
    let cases = golden("places");
    assert!(cases.len() >= 17, "every case is read");
    for case in &cases {
        let name = case["name"].as_str().unwrap_or_default();
        let text = |key: &str| with_drive(case[key].as_str().unwrap_or_default());
        let (workspace, profile, built_in) = (text("workspace"), text("profile"), text("builtIn"));
        let refusal = profile_refusal(&ProfilePlaces {
            platform: platform_of(case),
            workspace: &workspace,
            profile: &profile,
            built_in: &built_in,
            moved_by: mover_of(case),
        });
        let code = refusal.map(|refusal| match refusal {
            ProfileRefusal::ProfileInWorkspace(mover) => {
                assert_eq!(Some(mover), mover_of(case), "{name}: names the variable");
                "profile-in-workspace"
            }
            ProfileRefusal::WorkspaceInProfile => "workspace-in-profile",
        });
        assert_eq!(code, case["refusal"].as_str(), "{name}");
    }
}
