//! The paired computers' store, with the fake wrapper in place of the
//! Android Keystore.

use std::fs;
use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::details::ComputerDetails;
use crate::error::DeviceKeyError;
use crate::fake::FakeWrapper;
use crate::file_store::WrappedFileStore;
use crate::key::{DeviceKeyPair, KEY_BYTES, PrivateKey};
use crate::paired::PairedComputers;
use crate::store::DeviceKeyStore;

/// A folder under the system's temporary folder, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("paired-computers-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        Self(folder)
    }

    /// The details' folder, which the store makes itself.
    fn computers(&self) -> PathBuf {
        self.0.join("paired-computers")
    }

    fn store(&self) -> PairedComputers<WrappedFileStore<FakeWrapper>> {
        let keys = WrappedFileStore::new(self.0.join("device-keys"), FakeWrapper::new());
        PairedComputers::new(self.computers(), keys)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A computer whose key has every byte set from `seed`.
fn details(seed: u8, name: &str, paired_at_ms: u64) -> ComputerDetails {
    ComputerDetails {
        name: name.to_owned(),
        endpoint: "wss://office.example:4443".to_owned(),
        host_key: [seed; KEY_BYTES],
        paired_at_ms,
    }
}

fn pair(seed: u8) -> DeviceKeyPair {
    DeviceKeyPair {
        public: [seed; KEY_BYTES],
        private: PrivateKey::new([seed ^ 0xa5; KEY_BYTES]),
    }
}

fn names(store: &PairedComputers<WrappedFileStore<FakeWrapper>>) -> Vec<Option<String>> {
    let listed = store.list().expect("the list reads");
    listed
        .into_iter()
        .map(|computer| computer.details.map(|details| details.name))
        .collect()
}

#[test]
fn paired_computers_keep_a_computer_with_its_key() {
    let scratch = Scratch::new("add");
    let store = scratch.store();
    let office = details(1, "Office", 10);

    let id = store.add(&office, &pair(1)).expect("it adds");

    assert_eq!(id, ComputerId::for_host_key(&[1; KEY_BYTES]));
    assert_eq!(store.details(&id), Ok(Some(office.clone())));
    let listed = store.list().expect("the list reads");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, id);
    assert_eq!(listed[0].details, Some(office));
    let key = store.keys().load(&id).expect("the key loads");
    assert!(key.is_some_and(|key| key.same_as(&pair(1))));
}

#[test]
fn paired_computers_list_nothing_before_the_first_pairing() {
    let scratch = Scratch::new("empty");
    assert_eq!(scratch.store().list(), Ok(Vec::new()));
    assert!(!scratch.computers().exists());
}

#[test]
fn paired_computers_pairing_again_replaces_the_computer() {
    let scratch = Scratch::new("again");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");

    store
        .add(&details(1, "Office upstairs", 20), &pair(2))
        .expect("it adds again");

    assert_eq!(names(&store), [Some("Office upstairs".to_owned())]);
    let key = store.keys().load(&id).expect("the key loads");
    assert!(key.is_some_and(|key| key.same_as(&pair(2))));
}

#[test]
fn paired_computers_list_the_oldest_pairing_first() {
    let scratch = Scratch::new("order");
    let store = scratch.store();
    store
        .add(&details(1, "Late", 30), &pair(1))
        .expect("it adds");
    store
        .add(&details(2, "Early", 10), &pair(2))
        .expect("it adds");
    store
        .add(&details(3, "Middle", 20), &pair(3))
        .expect("it adds");

    let expected = ["Early", "Middle", "Late"].map(|name| Some(name.to_owned()));
    assert_eq!(names(&store), expected);
}

#[test]
fn paired_computers_forget_removes_the_key_and_the_details_of_that_computer_only() {
    let scratch = Scratch::new("forget");
    let store = scratch.store();
    let office = store
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");
    let laptop = store
        .add(&details(2, "Laptop", 20), &pair(2))
        .expect("it adds");

    store.forget(&office).expect("it forgets");

    assert_eq!(store.details(&office), Ok(None));
    assert!(matches!(store.keys().load(&office), Ok(None)));
    assert_eq!(names(&store), [Some("Laptop".to_owned())]);
    assert!(matches!(store.keys().load(&laptop), Ok(Some(_))));
    let files: Vec<_> = fs::read_dir(scratch.computers())
        .expect("the folder is there")
        .map(|entry| {
            let name = entry.expect("an entry").file_name();
            name.to_string_lossy().into_owned()
        })
        .collect();
    assert_eq!(files, [format!("{}.computer", laptop.as_str())]);
}

#[test]
fn paired_computers_forgetting_a_computer_not_paired_succeeds() {
    let scratch = Scratch::new("forget-none");
    let store = scratch.store();
    let id = ComputerId::for_host_key(&[9; KEY_BYTES]);
    assert_eq!(store.forget(&id), Ok(()));
}

#[test]
fn paired_computers_details_moved_to_another_computer_are_unreadable_and_forgettable() {
    let scratch = Scratch::new("moved");
    let store = scratch.store();
    let office = store
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");
    let other = ComputerId::for_host_key(&[2; KEY_BYTES]);
    let file = |id: &ComputerId| {
        scratch
            .computers()
            .join(format!("{}.computer", id.as_str()))
    };
    fs::copy(file(&office), file(&other)).expect("the file copies");

    assert_eq!(store.details(&other), Err(DeviceKeyError::Unreadable));
    assert_eq!(names(&store), [Some("Office".to_owned()), None]);
    store.forget(&other).expect("it forgets");
    assert_eq!(names(&store), [Some("Office".to_owned())]);
}

#[test]
fn paired_computers_a_changed_details_file_is_unreadable() {
    let scratch = Scratch::new("changed");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");
    let file = scratch
        .computers()
        .join(format!("{}.computer", id.as_str()));
    let mut stored = fs::read(&file).expect("the file reads");
    stored.push(0);
    fs::write(&file, &stored).expect("the file writes");

    assert_eq!(store.details(&id), Err(DeviceKeyError::Unreadable));
    stored.truncate(stored.len() - 3);
    fs::write(&file, &stored).expect("the file writes");
    assert_eq!(store.details(&id), Err(DeviceKeyError::Unreadable));
}

#[test]
fn paired_computers_list_only_details_files() {
    let scratch = Scratch::new("other-files");
    let store = scratch.store();
    store
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");
    for name in [".123-0.tmp", "notes.txt", "a.b.computer", ".computer"] {
        fs::write(scratch.computers().join(name), b"HPC1").expect("the file writes");
    }

    assert_eq!(names(&store), [Some("Office".to_owned())]);
}

#[test]
fn paired_computers_forget_the_key_when_the_details_cannot_be_written() {
    let scratch = Scratch::new("no-details");
    let store = scratch.store();
    let id = ComputerId::for_host_key(&[1; KEY_BYTES]);
    let file = scratch
        .computers()
        .join(format!("{}.computer", id.as_str()));
    fs::create_dir_all(file.join("in-the-way")).expect("the folder is made");

    let added = store.add(&details(1, "Office", 10), &pair(1));

    assert!(matches!(added, Err(DeviceKeyError::Storage { .. })));
    assert!(matches!(store.keys().load(&id), Ok(None)));
}

#[test]
fn paired_computers_refuse_details_too_long_to_keep_and_save_no_key() {
    let scratch = Scratch::new("too-long");
    let store = scratch.store();
    let long = details(1, &"x".repeat(usize::from(u16::MAX) + 1), 10);

    assert_eq!(
        store.add(&long, &pair(1)).map(|_| ()),
        Err(DeviceKeyError::InvalidComputer)
    );
    let id = ComputerId::for_host_key(&[1; KEY_BYTES]);
    assert!(matches!(store.keys().load(&id), Ok(None)));
}

#[test]
fn paired_computers_details_read_back_as_written() {
    let office = details(4, "Büro ☕", u64::MAX);
    let stored = office.to_stored_form().expect("it fits");
    assert!(stored.starts_with(b"HPC1"));
    assert_eq!(ComputerDetails::from_stored_form(&stored), Some(office));
    assert_eq!(ComputerDetails::from_stored_form(b"HDK1"), None);
    assert_eq!(ComputerDetails::from_stored_form(&[]), None);
}

#[cfg(unix)]
#[test]
fn paired_computers_details_are_readable_by_the_app_only() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("private");
    let id = scratch
        .store()
        .add(&details(1, "Office", 10), &pair(1))
        .expect("it adds");

    let mode = |path: PathBuf| {
        fs::metadata(path)
            .expect("it is there")
            .permissions()
            .mode()
            & 0o777
    };
    assert_eq!(mode(scratch.computers()), 0o700);
    let file = scratch
        .computers()
        .join(format!("{}.computer", id.as_str()));
    assert_eq!(mode(file), 0o600);
}
