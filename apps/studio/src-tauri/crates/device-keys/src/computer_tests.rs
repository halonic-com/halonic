use crate::computer::{ComputerId, MAX_COMPUTER_ID_LENGTH};
use crate::error::DeviceKeyError;

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
