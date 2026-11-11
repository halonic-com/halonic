//! The golden path cases `@halonicjs/ports` is checked against
//! (`packages/core/ports/src/golden/workspace-paths.json`), so the shell
//! refuses exactly the paths every TypeScript store refuses. Requirement
//! `workspace-files`; these tests' names start with `workspace_files_`.

use halonic_workspace_files::{
    FileError, check_public_workspace_path, check_workspace_path, is_private_workspace_path,
    segment_as_opened,
};
use serde_json::Value;

/// The cases, shared with the TypeScript package's tests.
const GOLDEN: &str =
    include_str!("../../../../../../packages/core/ports/src/golden/workspace-paths.json");

fn golden(list: &str) -> Vec<Value> {
    let cases: Value = serde_json::from_str(GOLDEN).expect("the golden file is JSON");
    cases[list].as_array().cloned().expect("a list of cases")
}

#[test]
fn workspace_files_give_every_golden_path_its_verdict() {
    let cases = golden("paths");
    assert!(cases.len() >= 30, "every case is read");
    for case in &cases {
        let path = case["path"].as_str().expect("a path");
        let verdict = case["verdict"].as_str().expect("a verdict");
        let public = check_public_workspace_path(path);
        match verdict {
            "public" => {
                assert_eq!(public, Ok(()), "{path:?}");
                assert!(!is_private_workspace_path(path), "{path:?}");
            }
            "private" => {
                assert_eq!(check_workspace_path(path), Ok(()), "{path:?}");
                assert!(
                    matches!(public, Err(FileError::PrivatePath { .. })),
                    "{path:?}: {public:?}"
                );
            }
            "unsafe" => {
                assert!(
                    matches!(
                        check_workspace_path(path),
                        Err(FileError::UnsafePath { .. })
                    ),
                    "{path:?}"
                );
                assert_eq!(
                    public.map_err(|error| error.kind()),
                    Err("unsafe_path"),
                    "{path:?}"
                );
            }
            other => panic!("unknown verdict {other:?} for {path:?}"),
        }
    }
}

#[test]
fn workspace_files_give_every_golden_segment_as_opened() {
    for case in golden("segments") {
        let segment = case["segment"].as_str().expect("a segment");
        let opened = case["opened"].as_str().expect("the segment as opened");
        assert_eq!(segment_as_opened(segment), opened, "{segment:?}");
    }
}
