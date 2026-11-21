//! What a connection notes in the paired-computer list, against the key it
//! used: a connection from before a Pair again changes nothing (Julian on
//! HAL-15463).

use std::fs;
use std::path::PathBuf;

use halonic_device_keys::{
    ComputerId, DeviceKeyPair, DeviceKeyStore, FakeWrapper, NewPairing, PairedComputers,
    PrivateKey, Standing, WrappedFileStore,
};
use halonic_tunnel::PhoneStatus;

use crate::connect::note;

const HOST_KEY: [u8; 32] = [7; 32];
const EARLIER_KEY: [u8; 32] = [1; 32];
const NEW_KEY: [u8; 32] = [2; 32];

/// A list in a scratch folder, removed when dropped.
struct List {
    computers: PairedComputers<WrappedFileStore<FakeWrapper>>,
    folder: PathBuf,
}

impl List {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("phone-tunnel-note-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        let keys = WrappedFileStore::new(folder.join("device-keys"), FakeWrapper::new());
        let computers = PairedComputers::new(folder.join("paired-computers"), keys);
        Self { computers, folder }
    }

    /// Pairs, or pairs `again`, with the phone's public key `public`.
    fn pair(&self, public: [u8; 32], again: Option<&ComputerId>) -> ComputerId {
        let pairing = NewPairing {
            name: "Desk".to_owned(),
            endpoint: "tcp://192.168.1.20:4100".to_owned(),
            host_key: HOST_KEY,
            paired_at_ms: 1,
        };
        let pair = DeviceKeyPair {
            public,
            private: PrivateKey::new([9; 32]),
        };
        self.computers.add(&pairing, &pair, again).unwrap()
    }

    fn kept_key(&self, id: &ComputerId) -> Option<[u8; 32]> {
        let pair = self.computers.keys().load(id).unwrap();
        pair.map(|pair| pair.public)
    }

    fn standing(&self, id: &ComputerId) -> Standing {
        self.computers
            .details(id)
            .unwrap()
            .expect("listed")
            .standing
    }
}

impl Drop for List {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}

#[test]
fn phone_tunnel_connections_leave_a_new_pairing_s_key_to_an_earlier_removed() {
    let list = List::new("removed");
    let id = list.pair(EARLIER_KEY, None);
    list.pair(NEW_KEY, Some(&id));

    // The earlier connection heard `not-paired` before Pair again ended it,
    // and its wipe ran after the new key was saved.
    note(&list.computers, &id, &EARLIER_KEY, PhoneStatus::Removed, 2).unwrap();

    assert_eq!(list.kept_key(&id), Some(NEW_KEY));
    assert_eq!(list.standing(&id), Standing::Paired { host_key: HOST_KEY });
}

#[test]
fn phone_tunnel_connections_leave_a_new_pairing_to_an_earlier_can_t_confirm() {
    let list = List::new("cant-confirm");
    let id = list.pair(EARLIER_KEY, None);
    list.pair(NEW_KEY, Some(&id));

    note(
        &list.computers,
        &id,
        &EARLIER_KEY,
        PhoneStatus::CantConfirm,
        2,
    )
    .unwrap();
    note(
        &list.computers,
        &id,
        &EARLIER_KEY,
        PhoneStatus::Connected,
        2,
    )
    .unwrap();

    assert_eq!(list.standing(&id), Standing::Paired { host_key: HOST_KEY });
    let details = list.computers.details(&id).unwrap().expect("listed");
    assert_eq!(details.last_connected_at_ms, None);
}

#[test]
fn phone_tunnel_connections_wipe_the_key_the_connection_used_on_removed() {
    let list = List::new("current");
    let id = list.pair(NEW_KEY, None);

    note(&list.computers, &id, &NEW_KEY, PhoneStatus::Removed, 2).unwrap();

    assert_eq!(list.kept_key(&id), None);
    assert_eq!(list.standing(&id), Standing::Removed);
}

#[test]
fn phone_tunnel_connections_note_nothing_for_a_forgotten_computer() {
    let list = List::new("forgotten");
    let id = list.pair(NEW_KEY, None);
    list.computers.forget(&id).unwrap();

    note(&list.computers, &id, &NEW_KEY, PhoneStatus::Removed, 2).unwrap();
    note(&list.computers, &id, &NEW_KEY, PhoneStatus::Connected, 2).unwrap();

    assert!(list.computers.details(&id).unwrap().is_none());
}
