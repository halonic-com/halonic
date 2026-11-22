//! Whether a folder git runs in is one the person trusted, read from the
//! trust records (requirement `trusted-filters` in `halonic-git-guard`).

use std::fs;
use std::path::PathBuf;

use halonic_git_guard::plain_path;
use halonic_trust_grant::is_trusted_folder;
use halonic_trust_store::FileTrustStore;
use serde_json::json;

/// `work/acme/notes`, `work/acme-other` and a profile under the system's
/// temporary folder, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("trusted-folders-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        for folder in ["work/acme/notes", "work/acme-other", "profile"] {
            fs::create_dir_all(root.join(folder)).expect("the scratch folders can be created");
        }
        Self(fs::canonicalize(root).expect("the scratch folder exists"))
    }

    fn path(&self, folder: &str) -> PathBuf {
        self.0.join(folder)
    }

    fn location(&self, folder: &str) -> String {
        plain_path(&self.path(folder))
            .into_string()
            .expect("a Unicode path")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn trusted_filters_count_a_folder_with_a_trust_record_or_inside_one() {
    let scratch = Scratch::new("record");
    let store = FileTrustStore::new(scratch.path("profile/trust"));
    let acme = scratch.path("work/acme");
    assert!(!is_trusted_folder(&store, &acme));

    let record = json!({"location": scratch.location("work/acme"), "pins": {}});
    store.grant(&record).expect("the record is saved");
    assert!(is_trusted_folder(&store, &acme));
    assert!(is_trusted_folder(&store, &scratch.path("work/acme/notes")));
    // By path part: `acme-other` isn't inside `acme`, nor is the folder above.
    assert!(!is_trusted_folder(&store, &scratch.path("work/acme-other")));
    assert!(!is_trusted_folder(&store, &scratch.path("work")));

    // Revoking counts at once, with no state kept in between.
    store
        .revoke(&scratch.location("work/acme"))
        .expect("the record is deleted");
    assert!(!is_trusted_folder(&store, &acme));
}

#[test]
fn trusted_filters_count_no_folder_when_the_records_cant_be_read() {
    let scratch = Scratch::new("unreadable");
    // The records folder is a file: no record can be read.
    fs::write(scratch.path("profile/trust"), "not a folder").expect("the file writes");
    let store = FileTrustStore::new(scratch.path("profile/trust"));
    assert!(!is_trusted_folder(&store, &scratch.path("work/acme")));
}
