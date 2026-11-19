use crate::key::{DeviceKeyPair, KEY_BYTES, PrivateKey};

#[test]
fn device_keys_never_print_the_private_key() {
    let pair = DeviceKeyPair {
        public: [1; KEY_BYTES],
        private: PrivateKey::new([0x42; KEY_BYTES]),
    };

    let printed = format!("{pair:?}");
    assert!(printed.contains("PrivateKey(hidden)"));
    assert!(!printed.contains("66"), "{printed}");
}

#[test]
fn device_keys_sealed_form_reads_back_and_refuses_another_length() {
    let pair = DeviceKeyPair {
        public: [3; KEY_BYTES],
        private: PrivateKey::new([9; KEY_BYTES]),
    };
    let sealed_form = pair.to_sealed_form();

    let read = DeviceKeyPair::from_sealed_form(&sealed_form).expect("it reads back");
    assert!(read.same_as(&pair));
    assert!(DeviceKeyPair::from_sealed_form(&sealed_form[1..]).is_none());
    assert!(DeviceKeyPair::from_sealed_form(&[sealed_form.clone(), vec![0]].concat()).is_none());
}
