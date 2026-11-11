//! The blob folder's files, as `FolderBlobStore` in `fs-node` keeps them.
//! Requirement `blob-store`.

use std::fs;
use std::path::{Path, PathBuf};

use halonic_blob_store::{BlobFolder, BlobStoreError, blob_hash, is_blob_hash};

/// The SHA-256 of `hello`, as the BlobStore contract names it.
const HELLO_HASH: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

/// A folder of its own for one test, under the system's temporary folder,
/// removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!("blob-store-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    /// The blob folder inside, which doesn't exist yet.
    fn blobs(&self) -> PathBuf {
        self.0.join("blobs")
    }

    fn store(&self) -> BlobFolder {
        BlobFolder::new(&self.blobs()).expect("the blob folder can be named")
    }

    /// A file outside the blob folder, as a link would point to.
    fn outside(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Every file and folder under `folder`, relative and sorted.
fn names_under(folder: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(folder).expect("the folder can be listed") {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type().unwrap().is_dir() {
            for inner in names_under(&entry.path()) {
                names.push(format!("{name}/{inner}"));
            }
        } else {
            names.push(name);
        }
    }
    names.sort();
    names
}

#[test]
fn blob_store_keeps_a_blob_in_its_two_character_folder() {
    let scratch = Scratch::new("layout");
    let store = scratch.store();
    assert_eq!(store.put(b"hello"), Ok(HELLO_HASH.to_owned()));
    assert_eq!(names_under(&scratch.blobs()), [format!("2c/{HELLO_HASH}")]);
    let file = scratch.blobs().join("2c").join(HELLO_HASH);
    assert_eq!(fs::read(file).unwrap(), b"hello");
    assert_eq!(store.get(HELLO_HASH), Ok(Some(b"hello".to_vec())));
}

#[test]
fn blob_store_reads_a_blob_the_cli_wrote() {
    let scratch = Scratch::new("cli");
    let folder = scratch.blobs().join("2c");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join(HELLO_HASH), b"hello").unwrap();
    assert_eq!(scratch.store().get(HELLO_HASH), Ok(Some(b"hello".to_vec())));
}

#[test]
fn blob_store_stores_empty_bytes_and_answers_none_for_a_missing_blob() {
    let scratch = Scratch::new("empty");
    let store = scratch.store();
    assert_eq!(store.get(HELLO_HASH), Ok(None));
    let empty = store.put(b"").unwrap();
    assert_eq!(empty, blob_hash(b""));
    assert_eq!(store.get(&empty), Ok(Some(Vec::new())));
    assert_eq!(store.get(HELLO_HASH), Ok(None));
}

#[test]
fn blob_store_writes_nothing_for_bytes_already_stored() {
    let scratch = Scratch::new("again");
    let store = scratch.store();
    store.put(b"hello").unwrap();
    let file = scratch.blobs().join("2c").join(HELLO_HASH);
    let before = fs::metadata(&file).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    assert_eq!(store.put(b"hello"), Ok(HELLO_HASH.to_owned()));
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), before);
    assert_eq!(names_under(&scratch.blobs()), [format!("2c/{HELLO_HASH}")]);
}

#[test]
fn blob_store_refuses_a_hash_that_isnt_one_before_any_path() {
    let scratch = Scratch::new("hashes");
    fs::write(scratch.outside("secret"), b"secret").unwrap();
    let store = scratch.store();
    let hashes = [
        String::new(),
        "../secret".to_owned(),
        HELLO_HASH.to_uppercase(),
        HELLO_HASH[1..].to_owned(),
        format!("{HELLO_HASH}0"),
        format!("../{}", &HELLO_HASH[3..]),
    ];
    for hash in &hashes {
        assert!(!is_blob_hash(hash), "{hash:?}");
        assert_eq!(
            store.get(hash),
            Err(BlobStoreError::InvalidHash),
            "{hash:?}"
        );
    }
    assert!(is_blob_hash(HELLO_HASH));
}

#[test]
fn blob_store_refuses_a_folder_in_place_of_a_blob() {
    let scratch = Scratch::new("folder-blob");
    fs::create_dir_all(scratch.blobs().join("2c").join(HELLO_HASH)).unwrap();
    let refused = scratch.store().get(HELLO_HASH).unwrap_err();
    assert_eq!(refused.kind(), "linked_blob");
}

#[test]
fn blob_store_refuses_a_file_in_place_of_a_blobs_folder() {
    let scratch = Scratch::new("file-folder");
    fs::create_dir_all(scratch.blobs()).unwrap();
    fs::write(scratch.blobs().join("2c"), b"not a folder").unwrap();
    let store = scratch.store();
    assert_eq!(store.put(b"hello").unwrap_err().kind(), "linked_blob");
    assert_eq!(store.get(HELLO_HASH).unwrap_err().kind(), "linked_blob");
}

#[cfg(unix)]
mod unix {
    use std::fs;
    use std::os::unix::fs::{PermissionsExt, symlink};

    use halonic_blob_store::BlobStoreError;

    use super::{HELLO_HASH, Scratch, names_under};

    fn mode(path: &std::path::Path) -> u32 {
        fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn blob_store_keeps_folders_and_files_private() {
        let scratch = Scratch::new("modes");
        scratch.store().put(b"hello").unwrap();
        assert_eq!(mode(&scratch.blobs()), 0o700);
        assert_eq!(mode(&scratch.blobs().join("2c")), 0o700);
        assert_eq!(mode(&scratch.blobs().join("2c").join(HELLO_HASH)), 0o600);
    }

    #[test]
    fn blob_store_refuses_a_linked_blob_and_replaces_it_on_put() {
        let scratch = Scratch::new("link");
        let outside = scratch.outside("elsewhere");
        fs::write(&outside, b"elsewhere").unwrap();
        let folder = scratch.blobs().join("2c");
        fs::create_dir_all(&folder).unwrap();
        symlink(&outside, folder.join(HELLO_HASH)).unwrap();
        let store = scratch.store();

        let refused = store.get(HELLO_HASH).unwrap_err();
        assert_eq!(
            refused,
            BlobStoreError::LinkedBlob {
                file: store.root().join("2c").join(HELLO_HASH)
            }
        );
        assert_eq!(store.put(b"hello"), Ok(HELLO_HASH.to_owned()));
        assert_eq!(fs::read(&outside).unwrap(), b"elsewhere");
        assert_eq!(store.get(HELLO_HASH), Ok(Some(b"hello".to_vec())));
    }

    #[test]
    fn blob_store_refuses_a_hard_linked_blob_and_replaces_it_on_put() {
        let scratch = Scratch::new("hard-link");
        let outside = scratch.outside("elsewhere");
        fs::write(&outside, b"hello").unwrap();
        let folder = scratch.blobs().join("2c");
        fs::create_dir_all(&folder).unwrap();
        fs::hard_link(&outside, folder.join(HELLO_HASH)).unwrap();
        let store = scratch.store();

        assert_eq!(store.get(HELLO_HASH).unwrap_err().kind(), "linked_blob");
        store.put(b"hello").unwrap();
        // The blob has a name of its own now; the file outside keeps its bytes.
        assert_eq!(store.get(HELLO_HASH), Ok(Some(b"hello".to_vec())));
        assert_eq!(fs::read(&outside).unwrap(), b"hello");
    }

    #[test]
    fn blob_store_refuses_a_linked_blobs_folder() {
        let scratch = Scratch::new("linked-folder");
        let outside = scratch.outside("elsewhere");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join(HELLO_HASH), b"hello").unwrap();
        fs::create_dir_all(scratch.blobs()).unwrap();
        symlink(&outside, scratch.blobs().join("2c")).unwrap();
        let store = scratch.store();

        let refused = store.put(b"hello").unwrap_err();
        assert_eq!(
            refused,
            BlobStoreError::LinkedFolder {
                folder: store.root().join("2c")
            }
        );
        assert_eq!(store.get(HELLO_HASH), Err(refused));
        assert_eq!(names_under(&outside), [HELLO_HASH]);
    }
}
