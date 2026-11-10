//! Closing an opened folder, as revoking its trust does (HAL-2612).
//! Requirement `closed-folders`.

mod support;

use halonic_git_guard::{GitError, OpenedFolders};
use support::{Sandbox, TemporaryFolder};

#[test]
fn closed_folders_refuses_git_after_a_folder_is_closed() {
    let sandbox = Sandbox::new();
    sandbox.init_repository();
    assert!(sandbox.git("status").is_ok());

    sandbox.folders.close(&sandbox.acme);
    assert_eq!(sandbox.git("status"), Err(GitError::FolderNotOpened));
}

#[test]
fn closed_folders_closes_only_the_exact_folder() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let beta = temporary.folder("beta");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");
    folders.open(&beta).expect("beta opens");

    // Given another way, it is still the same folder once canonicalised.
    folders.close(&acme.join("..").join("acme"));
    assert_eq!(folders.check(&acme), Err(GitError::FolderNotOpened));
    assert!(folders.check(&beta).is_ok());

    // Closing a folder that isn't open changes nothing.
    folders.close(&acme);
    folders.close(&temporary.folder("never"));
    assert!(folders.check(&beta).is_ok());
}

#[test]
fn closed_folders_keeps_a_folder_open_above_it() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let notes = temporary.folder("acme/notes");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");
    folders.open(&notes).expect("notes opens");

    folders.close(&notes);
    assert!(folders.check(&notes).is_ok(), "acme still holds notes");
    folders.close(&acme);
    assert_eq!(folders.check(&notes), Err(GitError::FolderNotOpened));
}

#[test]
fn closed_folders_closes_a_deleted_folder_by_its_recorded_path() {
    let temporary = TemporaryFolder::new();
    let acme = temporary.folder("acme");
    let recorded = std::fs::canonicalize(&acme).expect("acme canonicalises");
    let folders = OpenedFolders::new();
    folders.open(&acme).expect("acme opens");

    std::fs::remove_dir(&acme).expect("acme is deleted");
    folders.close(&recorded);
    std::fs::create_dir(&acme).expect("acme is made again");
    assert_eq!(folders.check(&acme), Err(GitError::FolderNotOpened));
}
