//! The paired computers' store, with the fake wrapper in place of the
//! Android Keystore.

use std::fs;
use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::details::{ComputerDetails, MAX_ENDPOINTS, Standing};
use crate::error::DeviceKeyError;
use crate::fake::FakeWrapper;
use crate::file_store::WrappedFileStore;
use crate::key::{DeviceKeyPair, KEY_BYTES, PrivateKey};
use crate::paired::{NewPairing, PairedComputers};
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

const ENDPOINT: &str = "wss://office.example:4443";

/// A pairing with a computer whose key has every byte set from `seed`.
fn details(seed: u8, name: &str, paired_at_ms: u64) -> NewPairing {
    NewPairing {
        name: name.to_owned(),
        endpoint: ENDPOINT.to_owned(),
        host_key: [seed; KEY_BYTES],
        paired_at_ms,
    }
}

/// The details `add` keeps for a first pairing.
fn kept(pairing: &NewPairing) -> ComputerDetails {
    ComputerDetails {
        name: pairing.name.clone(),
        endpoints: vec![pairing.endpoint.clone()],
        standing: Standing::Paired {
            host_key: pairing.host_key,
        },
        paired_at_ms: pairing.paired_at_ms,
        last_connected_at_ms: None,
    }
}

fn standing(
    store: &PairedComputers<WrappedFileStore<FakeWrapper>>,
    id: &ComputerId,
) -> Option<Standing> {
    let details = store.details(id).expect("the details read");
    details.map(|details| details.standing)
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

    let id = store.add(&office, &pair(1), None).expect("it adds");

    assert_eq!(id, ComputerId::for_host_key(&[1; KEY_BYTES]));
    assert_eq!(store.details(&id), Ok(Some(kept(&office))));
    let listed = store.list().expect("the list reads");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, id);
    assert_eq!(listed[0].details, Some(kept(&office)));
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
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");

    store
        .add(&details(1, "Office upstairs", 20), &pair(2), None)
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
        .add(&details(1, "Late", 30), &pair(1), None)
        .expect("it adds");
    store
        .add(&details(2, "Early", 10), &pair(2), None)
        .expect("it adds");
    store
        .add(&details(3, "Middle", 20), &pair(3), None)
        .expect("it adds");

    let expected = ["Early", "Middle", "Late"].map(|name| Some(name.to_owned()));
    assert_eq!(names(&store), expected);
}

#[test]
fn paired_computers_forget_removes_the_key_and_the_details_of_that_computer_only() {
    let scratch = Scratch::new("forget");
    let store = scratch.store();
    let office = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    let laptop = store
        .add(&details(2, "Laptop", 20), &pair(2), None)
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
        .add(&details(1, "Office", 10), &pair(1), None)
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
        .add(&details(1, "Office", 10), &pair(1), None)
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
        .add(&details(1, "Office", 10), &pair(1), None)
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

    let added = store.add(&details(1, "Office", 10), &pair(1), None);

    assert!(matches!(added, Err(DeviceKeyError::Storage { .. })));
    assert!(matches!(store.keys().load(&id), Ok(None)));
}

#[test]
fn paired_computers_refuse_details_too_long_to_keep_and_save_no_key() {
    let scratch = Scratch::new("too-long");
    let store = scratch.store();
    let long = details(1, &"x".repeat(usize::from(u16::MAX) + 1), 10);

    assert_eq!(
        store.add(&long, &pair(1), None).map(|_| ()),
        Err(DeviceKeyError::InvalidComputer)
    );
    let id = ComputerId::for_host_key(&[1; KEY_BYTES]);
    assert!(matches!(store.keys().load(&id), Ok(None)));
}

#[test]
fn paired_computers_details_read_back_as_written() {
    let id = ComputerId::parse("office-1").expect("an id");
    let mut office = kept(&details(4, "Büro ☕", u64::MAX));
    office.endpoints.push("tcp://192.168.1.20:4443".to_owned());
    for standing in [
        Standing::CantConfirm {
            host_key: [4; KEY_BYTES],
        },
        Standing::Removed,
    ] {
        office.standing = standing;
        office.last_connected_at_ms = Some(7);
        let stored = office.to_stored_form(&id).expect("it fits");
        assert!(stored.starts_with(b"HPC1"));
        let read = ComputerDetails::from_stored_form(&stored);
        assert_eq!(read, Some((id.clone(), office.clone())));
    }
    assert_eq!(ComputerDetails::from_stored_form(b"HDK1"), None);
    assert_eq!(ComputerDetails::from_stored_form(&[]), None);
    office.endpoints = vec![ENDPOINT.to_owned(); MAX_ENDPOINTS + 1];
    assert_eq!(office.to_stored_form(&id), None);
}

#[test]
fn paired_computers_removed_wipes_the_key_and_keeps_the_entry_until_forgotten() {
    let scratch = Scratch::new("removed");
    let store = scratch.store();
    let office = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    let laptop = store
        .add(&details(2, "Laptop", 20), &pair(2), None)
        .expect("it adds");

    store.mark_removed(&office).expect("it marks");

    assert!(matches!(store.keys().load(&office), Ok(None)));
    assert_eq!(standing(&store, &office), Some(Standing::Removed));
    let kept = store.details(&office).expect("it reads").expect("listed");
    assert_eq!(kept.name, "Office");
    assert_eq!(kept.endpoints, [ENDPOINT]);
    assert!(matches!(store.keys().load(&laptop), Ok(Some(_))));
    assert_eq!(
        names(&store),
        [Some("Office".to_owned()), Some("Laptop".to_owned())]
    );

    store.forget(&office).expect("it forgets");
    assert_eq!(names(&store), [Some("Laptop".to_owned())]);
}

#[test]
fn paired_computers_cant_confirm_clears_nothing_and_a_connection_ends_it() {
    let scratch = Scratch::new("cant-confirm");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    let host_key = [1; KEY_BYTES];

    store.mark_cant_confirm(&id).expect("it marks");

    assert_eq!(
        standing(&store, &id),
        Some(Standing::CantConfirm { host_key })
    );
    assert!(matches!(store.keys().load(&id), Ok(Some(_))));

    store.mark_connected(&id, 50).expect("it marks");

    let details = store.details(&id).expect("it reads").expect("listed");
    assert_eq!(details.standing, Standing::Paired { host_key });
    assert_eq!(details.last_connected_at_ms, Some(50));
}

#[test]
fn paired_computers_a_removed_computer_stays_removed_until_paired_again() {
    let scratch = Scratch::new("removed-stays");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    store.mark_removed(&id).expect("it marks");

    store.mark_connected(&id, 50).expect("it marks");
    store.mark_cant_confirm(&id).expect("it marks");

    assert_eq!(standing(&store, &id), Some(Standing::Removed));
    let unlisted = ComputerId::for_host_key(&[9; KEY_BYTES]);
    store.mark_connected(&unlisted, 50).expect("it marks");
    store.mark_removed(&unlisted).expect("it marks");
    assert_eq!(store.details(&unlisted), Ok(None));
}

#[test]
fn paired_computers_pair_again_keeps_the_id_with_a_new_key() {
    let scratch = Scratch::new("pair-again");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    store.mark_removed(&id).expect("it marks");
    let mut again = details(5, "Office", 30);
    again.endpoint = "tcp://192.168.1.20:4443".to_owned();

    let paired = store.add(&again, &pair(5), Some(&id)).expect("it adds");

    assert_eq!(paired, id);
    let details = store.details(&id).expect("it reads").expect("listed");
    assert_eq!(
        details.standing,
        Standing::Paired {
            host_key: [5; KEY_BYTES]
        }
    );
    assert_eq!(details.endpoints, ["tcp://192.168.1.20:4443", ENDPOINT]);
    assert_eq!(details.paired_at_ms, 30);
    let key = store.keys().load(&id).expect("the key loads");
    assert!(key.is_some_and(|key| key.same_as(&pair(5))));
    assert_eq!(names(&store), [Some("Office".to_owned())]);
}

#[test]
fn paired_computers_pairing_with_a_pinned_key_keeps_that_computers_id() {
    let scratch = Scratch::new("pinned");
    let store = scratch.store();
    let id = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    store
        .add(&details(5, "Office", 20), &pair(5), Some(&id))
        .expect("it adds again");

    let paired = store
        .add(&details(5, "Office", 30), &pair(6), None)
        .expect("it adds");

    assert_eq!(paired, id);
    assert_eq!(names(&store), [Some("Office".to_owned())]);
}

#[test]
fn paired_computers_pair_again_forgets_a_twin_that_pins_the_same_key() {
    let scratch = Scratch::new("twin");
    let store = scratch.store();
    let office = store
        .add(&details(1, "Office", 10), &pair(1), None)
        .expect("it adds");
    let twin = store
        .add(&details(5, "Office (new)", 20), &pair(5), None)
        .expect("it adds");

    store
        .add(&details(5, "Office", 30), &pair(6), Some(&office))
        .expect("it adds again");

    assert_eq!(names(&store), [Some("Office".to_owned())]);
    assert_eq!(store.details(&twin), Ok(None));
    assert!(matches!(store.keys().load(&twin), Ok(None)));
}

#[test]
fn paired_computers_pair_again_on_a_computer_not_listed_adds_it_anew() {
    let scratch = Scratch::new("again-unlisted");
    let store = scratch.store();
    let gone = ComputerId::parse("gone").expect("an id");

    let paired = store
        .add(&details(1, "Office", 10), &pair(1), Some(&gone))
        .expect("it adds");

    assert_eq!(paired, ComputerId::for_host_key(&[1; KEY_BYTES]));
}

#[test]
fn paired_computers_keep_at_most_the_latest_endpoints() {
    let scratch = Scratch::new("endpoints");
    let store = scratch.store();
    let mut pairing = details(1, "Office", 10);
    let mut id = None;
    for port in 0..=MAX_ENDPOINTS {
        pairing.endpoint = format!("tcp://192.168.1.20:{}", 4000 + port);
        id = Some(store.add(&pairing, &pair(1), None).expect("it adds"));
    }
    pairing.endpoint = "tcp://192.168.1.20:4003".to_owned();
    let id = store.add(&pairing, &pair(1), id.as_ref()).expect("it adds");

    let endpoints = store
        .details(&id)
        .expect("it reads")
        .expect("listed")
        .endpoints;
    assert_eq!(endpoints.len(), MAX_ENDPOINTS);
    assert_eq!(endpoints[0], "tcp://192.168.1.20:4003");
    assert_eq!(
        endpoints[1],
        format!("tcp://192.168.1.20:{}", 4000 + MAX_ENDPOINTS)
    );
    assert!(!endpoints.contains(&"tcp://192.168.1.20:4000".to_owned()));
}

#[cfg(unix)]
#[test]
fn paired_computers_details_are_readable_by_the_app_only() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("private");
    let id = scratch
        .store()
        .add(&details(1, "Office", 10), &pair(1), None)
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
