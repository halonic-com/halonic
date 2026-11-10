//! The golden cases `workspaceFolders` in `@halonicjs/profile` is checked
//! against (`packages/core/profile/src/golden/workspace-folders.json`), so
//! the shell and the CLI keep one workspace's runs in one folder.
//! Requirement `profile.workspace-folders`; these tests' names start with
//! `workspace_folders_`.

use halonic_profile::{Platform, ProfileFolder, WorkspaceError};
use serde_json::Value;

/// The cases, shared with the TypeScript package's tests.
const GOLDEN: &str =
    include_str!("../../../../../../packages/core/profile/src/golden/workspace-folders.json");

/// Drives are written `<drive>` in the cases, so the repo's leak guard
/// doesn't read them as a real machine's paths.
fn with_drive(text: &str) -> String {
    text.replace("<drive>", "D:")
}

fn golden() -> Value {
    serde_json::from_str(GOLDEN).unwrap()
}

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str() {
        Some("windows") => Platform::Windows,
        Some("macos") => Platform::Macos,
        Some("linux") => Platform::Linux,
        other => panic!("unknown platform {other:?}"),
    }
}

/// A text the case lists, with `<drive>` read as `D:`; `None` for `null`.
fn text(case: &Value, key: &str) -> Option<String> {
    case[key].as_str().map(with_drive)
}

#[test]
fn workspace_folders_match_every_golden_case() {
    let golden = golden();
    let cases = golden["workspaces"].as_array().unwrap();
    assert!(cases.len() >= 24, "every case is read");
    for case in cases {
        let name = case["name"].as_str().unwrap_or_default();
        let profile = ProfileFolder {
            platform: platform_of(case),
            root: text(case, "profile").unwrap(),
        };
        let workspace = text(case, "workspace").unwrap();
        let found = profile.workspace_folders(&workspace);
        let Some(expected) = text(case, "folder") else {
            assert_eq!(
                found,
                Err(WorkspaceError::WorkspaceNotAbsolute { value: workspace }),
                "{name}: should be refused"
            );
            continue;
        };
        let folders = found.unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(folders.folder, expected, "{name}");
        assert_eq!(folders.runs_folder(None).ok(), text(case, "runs"), "{name}");
        let staging = folders.runs_folder(Some("staging")).ok();
        assert_eq!(staging, text(case, "stagingRuns"), "{name}");
    }
}

#[test]
fn workspace_folders_take_the_deployment_ids_deployments_yaml_takes() {
    let golden = golden();
    let ids = |list: &str| -> Vec<String> {
        let values = golden["deploymentIds"][list].as_array().unwrap();
        values
            .iter()
            .map(|id| id.as_str().unwrap().to_owned())
            .collect()
    };
    let profile = ProfileFolder {
        platform: Platform::Linux,
        root: "/srv/acme/.local/share/halonic".to_owned(),
    };
    let folders = profile.workspace_folders("/srv/acme/workspace").unwrap();

    for id in ids("accepted") {
        let runs = folders.runs_folder(Some(&id));
        let expected = format!("{}/deployments/{id}/runs", folders.folder);
        assert_eq!(runs, Ok(expected), "{id:?} is accepted");
    }
    for id in ids("refused") {
        let refused = folders.runs_folder(Some(&id)).unwrap_err();
        assert_eq!(
            refused,
            WorkspaceError::NotADeploymentId { value: id.clone() },
            "{id:?} is refused"
        );
        assert!(refused.to_string().starts_with("not a deployment id"));
    }
}

#[test]
fn workspace_folders_name_why_a_workspace_is_refused() {
    let profile = ProfileFolder {
        platform: Platform::Linux,
        root: "/srv/acme/.local/share/halonic".to_owned(),
    };
    let refused = profile.workspace_folders("acme").unwrap_err();
    let message = refused.to_string();
    assert!(
        message.contains("workspace path must be absolute"),
        "{message}"
    );
}
