//! The phone's store of wrapped keys, with the fake wrapper in place of the
//! Android Keystore.

use std::fs;
use std::path::PathBuf;

use crate::computer::ComputerId;
use crate::contract::{check_store_contract, check_wrapper_contract};
use crate::error::DeviceKeyError;
use crate::fake::FakeWrapper;
use crate::file_store::WrappedFileStore;
use crate::key::{DeviceKeyPair, KEY_BYTES, PrivateKey};
use crate::store::DeviceKeyStore;

/// A folder under the system's temporary folder, removed when dropped.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("device-keys-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        Self(folder)
    }

    /// The store's folder, which the store makes itself.
    fn keys(&self) -> PathBuf {
        self.0.join("device-keys")
    }

    fn store(&self) -> WrappedFileStore<FakeWrapper> {
        WrappedFileStore::new(self.keys(), FakeWrapper::new())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn computer(id: &str) -> ComputerId {
    ComputerId::parse(id).expect("the id is valid")
}

fn pair(seed: u8) -> DeviceKeyPair {
    DeviceKeyPair {
        public: [seed; KEY_BYTES],
        private: PrivateKey::new([seed ^ 0xa5; KEY_BYTES]),
    }
}

fn loaded(store: &dyn DeviceKeyStore, id: &str) -> Option<DeviceKeyPair> {
    store.load(&computer(id)).expect("the key loads")
}

#[test]
fn device_keys_fake_wrapper_passes_the_wrapper_contract() {
    assert_eq!(check_wrapper_contract(&FakeWrapper::new()), Ok(()));
}

#[test]
fn device_keys_file_store_passes_the_store_contract() {
    let scratch = Scratch::new("contract");
    assert_eq!(check_store_contract(&scratch.store()), Ok(()));
}

#[test]
fn device_keys_keep_nothing_secret_in_the_clear() {
    let scratch = Scratch::new("sealed");
    let store = scratch.store();
    store.save(&computer("office"), &pair(7)).expect("it saves");

    let stored = fs::read(scratch.keys().join("office.key")).expect("the file is there");
    assert!(stored.starts_with(b"HDK1"));
    for key in [[7; KEY_BYTES], [7 ^ 0xa5; KEY_BYTES]] {
        assert!(!stored.windows(KEY_BYTES).any(|window| window == key));
    }
}

#[test]
fn device_keys_a_key_moved_to_another_computer_does_not_open() {
    let scratch = Scratch::new("moved");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    fs::copy(
        scratch.keys().join("office.key"),
        scratch.keys().join("laptop.key"),
    )
    .expect("the file copies");

    assert!(matches!(
        store.load(&computer("laptop")),
        Err(DeviceKeyError::Unreadable)
    ));
}

#[test]
fn device_keys_a_changed_file_does_not_open_and_stays() {
    let scratch = Scratch::new("changed");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    let file = scratch.keys().join("office.key");
    let mut stored = fs::read(&file).expect("the file is there");
    let last = stored.len() - 1;
    stored[last] ^= 1;
    fs::write(&file, &stored).expect("the file is changed");

    assert!(matches!(
        store.load(&computer("office")),
        Err(DeviceKeyError::Unreadable)
    ));
    assert!(
        file.exists(),
        "an unreadable key stays until it is forgotten"
    );
}

#[test]
fn device_keys_a_lost_platform_key_makes_every_key_unreadable() {
    let scratch = Scratch::new("lost");
    scratch
        .store()
        .save(&computer("office"), &pair(1))
        .expect("it saves");
    let lost = WrappedFileStore::new(scratch.keys(), {
        let wrapper = FakeWrapper::new();
        wrapper.lose_key();
        wrapper
    });

    assert!(matches!(
        lost.load(&computer("office")),
        Err(DeviceKeyError::Unreadable)
    ));
}

#[test]
fn device_keys_a_file_of_another_format_does_not_open() {
    let scratch = Scratch::new("format");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    let file = scratch.keys().join("office.key");
    let mut stored = fs::read(&file).expect("the file is there");
    stored[3] = b'2';
    fs::write(&file, &stored).expect("the file is changed");

    assert!(matches!(
        store.load(&computer("office")),
        Err(DeviceKeyError::Unreadable)
    ));
}

#[test]
fn device_keys_forget_removes_only_that_computers_file() {
    let scratch = Scratch::new("forget");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    store.save(&computer("laptop"), &pair(2)).expect("it saves");

    store.forget(&computer("office")).expect("it forgets");

    assert!(loaded(&store, "office").is_none());
    assert!(!scratch.keys().join("office.key").exists());
    let kept = loaded(&store, "laptop").expect("the other key stays");
    assert!(kept.same_as(&pair(2)));
}

#[test]
fn device_keys_save_leaves_no_temporary_file() {
    let scratch = Scratch::new("temporary");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    store
        .save(&computer("office"), &pair(2))
        .expect("it saves over");

    let names: Vec<String> = fs::read_dir(scratch.keys())
        .expect("the folder lists")
        .map(|entry| {
            entry
                .expect("an entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    assert_eq!(names, ["office.key"]);
}

#[test]
fn device_keys_a_folder_in_place_of_the_file_is_an_error() {
    let scratch = Scratch::new("folder");
    fs::create_dir_all(scratch.keys().join("office.key")).expect("the folder is made");

    assert!(matches!(
        scratch.store().load(&computer("office")),
        Err(DeviceKeyError::Storage { .. })
    ));
}

#[cfg(unix)]
#[test]
fn device_keys_are_readable_by_the_app_only() {
    use std::os::unix::fs::PermissionsExt;

    let scratch = Scratch::new("private");
    scratch
        .store()
        .save(&computer("office"), &pair(1))
        .expect("it saves");

    let mode = |path: PathBuf| {
        fs::metadata(path)
            .expect("it is there")
            .permissions()
            .mode()
            & 0o777
    };
    assert_eq!(mode(scratch.keys()), 0o700);
    assert_eq!(mode(scratch.keys().join("office.key")), 0o600);
}

#[cfg(unix)]
#[test]
fn device_keys_a_link_in_place_of_the_file_is_not_followed() {
    let scratch = Scratch::new("link");
    let store = scratch.store();
    store.save(&computer("office"), &pair(1)).expect("it saves");
    std::os::unix::fs::symlink(
        scratch.keys().join("office.key"),
        scratch.keys().join("laptop.key"),
    )
    .expect("the link is made");

    assert!(matches!(
        store.load(&computer("laptop")),
        Err(DeviceKeyError::Storage { .. })
    ));
}
