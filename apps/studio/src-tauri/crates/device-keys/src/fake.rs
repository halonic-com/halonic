use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::DeviceKeyError;
use crate::wrapper::KeyWrapper;

/// A [`KeyWrapper`] for tests. It is **not encryption**: it hides nothing
/// from anyone who reads this file. It only behaves like a real wrapper:
/// each seal is different, and opening fails for changed bytes, another
/// context, or after [`FakeWrapper::lose_key`].
///
/// Sealed bytes: an 8-byte counter, an 8-byte FNV-1a check over the key,
/// the counter, the context and the plain bytes, then the plain bytes mixed
/// with the counter.
#[derive(Debug)]
pub struct FakeWrapper {
    key: AtomicU64,
    counter: AtomicU64,
}

impl Default for FakeWrapper {
    fn default() -> Self {
        Self {
            key: AtomicU64::new(1),
            counter: AtomicU64::new(0),
        }
    }
}

impl FakeWrapper {
    /// A wrapper with its first key.
    pub fn new() -> Self {
        Self::default()
    }

    /// Acts as if the platform key were deleted and made again, as when the
    /// Android Keystore drops it: nothing sealed before opens any more.
    pub fn lose_key(&self) {
        self.key.fetch_add(1, Ordering::Relaxed);
    }

    fn check(&self, counter: &[u8], context: &[u8], plain: &[u8]) -> [u8; 8] {
        let key = self.key.load(Ordering::Relaxed).to_be_bytes();
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in [&key[..], counter, context, plain].concat() {
            hash = (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3);
        }
        hash.to_be_bytes()
    }
}

/// Mixes bytes with the counter; mixing twice gives the bytes back.
fn mix(bytes: &[u8], counter: &[u8]) -> Vec<u8> {
    let pad = |index: usize| counter[index % counter.len()] ^ (index as u8);
    bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ pad(index))
        .collect()
}

impl KeyWrapper for FakeWrapper {
    fn seal(&self, plain: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError> {
        let counter = self.counter.fetch_add(1, Ordering::Relaxed).to_be_bytes();
        let check = self.check(&counter, context, plain);
        Ok([&counter[..], &check, &mix(plain, &counter)].concat())
    }

    fn open(&self, sealed: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError> {
        if sealed.len() < 16 {
            return Err(DeviceKeyError::Unreadable);
        }
        let (counter, rest) = sealed.split_at(8);
        let (check, mixed) = rest.split_at(8);
        let plain = mix(mixed, counter);
        if self.check(counter, context, &plain) != check {
            return Err(DeviceKeyError::Unreadable);
        }
        Ok(plain)
    }
}
