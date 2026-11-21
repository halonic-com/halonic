use crate::computer::{ComputerId, MAX_COMPUTER_ID_LENGTH};
use crate::error::DeviceKeyError;
use crate::key::KEY_BYTES;

#[test]
fn device_keys_take_a_computer_id_that_is_a_safe_file_name() {
    for id in ["a", "office-1", "Zq3_x-9", "AAAAAAAAAAAAAAAAAAAAAA"] {
        assert_eq!(
            ComputerId::parse(id).map(|id| id.as_str().to_owned()),
            Ok(id.to_owned())
        );
    }
    let longest = "x".repeat(MAX_COMPUTER_ID_LENGTH);
    assert!(ComputerId::parse(&longest).is_ok());
}

#[test]
fn device_keys_refuse_any_other_computer_id() {
    let too_long = "x".repeat(MAX_COMPUTER_ID_LENGTH + 1);
    for id in [
        "", "..", ".", "a.key", "a/b", "a\\b", "a b", "é", "a\0", &too_long,
    ] {
        assert_eq!(
            ComputerId::parse(id),
            Err(DeviceKeyError::InvalidComputer),
            "{id:?}"
        );
    }
}

#[test]
fn paired_computers_name_a_computer_by_its_key_in_lowercase_hex() {
    let mut host_key = [0u8; KEY_BYTES];
    host_key[0] = 0xab;
    host_key[31] = 0x0f;
    let id = ComputerId::for_host_key(&host_key);
    assert_eq!(id.as_str().len(), MAX_COMPUTER_ID_LENGTH);
    assert!(id.as_str().starts_with("ab00"));
    assert!(id.as_str().ends_with("000f"));
    assert_eq!(ComputerId::parse(id.as_str()), Ok(id));
}
