//! File identities on real folders in a scratch folder. Requirement
//! `file-identity`.

use std::fs;
use std::path::PathBuf;

use halonic_file_identity::file_identity;

/// A folder of its own for one test, under the system's temporary folder,
/// removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("file-identity-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("acme")).expect("the scratch folder can be made");
        Self(root)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn file_identity_is_the_same_for_one_folder_and_differs_for_another() {
    let scratch = Scratch::new("same");
    let acme = scratch.0.join("acme");
    let first = file_identity(&acme).expect("the folder has an identity");
    assert_eq!(file_identity(&acme).expect("again"), first);
    // Another name for the same folder.
    let dotted = scratch.0.join("acme").join("..").join("acme");
    assert_eq!(file_identity(&dotted).expect("by another name"), first);
    fs::create_dir(scratch.0.join("other")).expect("the folder can be made");
    assert_ne!(
        file_identity(&scratch.0.join("other")).expect("the other folder"),
        first
    );
}

#[test]
fn file_identity_tells_a_folder_made_again_at_the_same_path_apart() {
    let scratch = Scratch::new("made-again");
    let acme = scratch.0.join("acme");
    let before = file_identity(&acme).expect("the folder has an identity");
    // Hold the old folder elsewhere, so the new one can't reuse its index.
    fs::rename(&acme, scratch.0.join("old-acme")).expect("the folder can be moved");
    fs::create_dir(&acme).expect("the folder can be made again");
    assert_ne!(file_identity(&acme).expect("the new folder"), before);
}

#[test]
fn file_identity_fails_for_a_path_with_nothing_there() {
    let scratch = Scratch::new("missing");
    assert!(file_identity(&scratch.0.join("nowhere")).is_err());
}
