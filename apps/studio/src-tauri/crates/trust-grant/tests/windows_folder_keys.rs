//! B6 (HAL-2612, HAL-3747): on Windows the shell keys a folder as the CLI
//! does, whatever case or 8.3 short name it was given in. The cases are the
//! golden file `fixtures/windows-folder-keys.json`; `windows-folder-keys.mjs`
//! checks the same file against Node's `realpath`, the call the CLI keys its
//! records by. Requirement `trust-grants`.
//!
//! In CI, `HALONIC_FOLDER_KEYS_ROOT` names a folder on a volume with 8.3
//! names on, and every case must hold there. Without it the folders go under
//! the system's temporary folder, and the 8.3 cases are left out, with a
//! note, when that volume makes no short names.
#![cfg(windows)]

use std::fs;
use std::path::{Path, PathBuf};

use halonic_git_guard::{OpenedFolders, plain_path};
use halonic_trust_grant::TrustState;
use halonic_trust_store::FileTrustStore;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct Golden {
    folders: Vec<String>,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    name: String,
    given: String,
    key: String,
    #[serde(default)]
    short_name: bool,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("fixtures/windows-folder-keys.json"))
        .expect("the golden file is valid")
}

/// A fresh root for one test with only the golden folders in `folders`, and
/// a profile beside it, removed when the test ends.
struct Root(PathBuf);

impl Root {
    fn new(name: &str, golden: &Golden) -> Self {
        let base = std::env::var_os("HALONIC_FOLDER_KEYS_ROOT")
            .map_or_else(std::env::temp_dir, PathBuf::from);
        let root = base.join(format!("folder-keys-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        for folder in &golden.folders {
            fs::create_dir_all(root.join("folders").join(folder))
                .expect("the golden folders can be created");
        }
        Self(root)
    }

    fn folders(&self) -> PathBuf {
        self.0.join("folders")
    }

    /// The cases to check: all of them, or without the 8.3 ones when the
    /// volume makes no short names and CI didn't ask for them.
    fn cases<'a>(&self, golden: &'a Golden) -> Vec<&'a Case> {
        let short_names = golden
            .cases
            .iter()
            .filter(|case| case.short_name)
            .all(|case| self.folders().join(&case.given).is_dir());
        if !short_names {
            assert!(
                std::env::var_os("HALONIC_FOLDER_KEYS_ROOT").is_none(),
                "no 8.3 short names under {}: the volume has them off (`fsutil 8dot3name query`)",
                self.0.display()
            );
            eprintln!(
                "note: no 8.3 short names under {}, so the 8.3 cases are left out",
                self.0.display()
            );
        }
        golden
            .cases
            .iter()
            .filter(|case| short_names || !case.short_name)
            .collect()
    }
}

impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A folder's key as the shell gives it out: canonical, in plain form.
fn key_of(folder: &Path) -> String {
    let canonical = fs::canonicalize(folder).expect("the folder exists");
    plain_path(&canonical)
        .into_string()
        .expect("a Unicode path")
}

#[test]
fn trust_grants_key_a_windows_folder_alike_in_any_case_or_short_name() {
    let golden = golden();
    let root = Root::new("pick", &golden);
    let root_key = key_of(&root.folders());
    for case in root.cases(&golden) {
        let state = TrustState::default();
        let folders = OpenedFolders::new();
        let picked = state
            .pick(&folders, || Some(root.folders().join(&case.given)))
            .expect("picking a folder works");
        assert_eq!(
            picked,
            Some(format!(r"{root_key}\{}", case.key)),
            "{}",
            case.name
        );
    }
}

#[test]
fn trust_grants_refuse_a_windows_folder_in_another_case_or_short_name() {
    let golden = golden();
    let root = Root::new("grant", &golden);
    let root_key = key_of(&root.folders());
    let state = TrustState::default();
    let folders = OpenedFolders::new();
    state
        .pick(&folders, || Some(root.folders()))
        .expect("picking a folder works");
    let store = FileTrustStore::new(root.0.join("profile").join("trust"));
    let grant = |location: &str| {
        let record = json!({"location": location, "pins": {}});
        state
            .grant(&store, &folders, &record, |_| -> bool {
                panic!("the shell asked about a folder inside the picked one")
            })
            .map_err(|refusal| refusal.kind())
    };
    for case in root.cases(&golden) {
        let key = format!(r"{root_key}\{}", case.key);
        assert_eq!(grant(&key), Ok(()), "{}", case.name);
        if case.given != case.key {
            let given = format!(r"{root_key}\{}", case.given);
            assert_eq!(grant(&given), Err("invalid_record"), "{}", case.name);
        }
    }
}
