//! Overwriting a token or a device code with zeros once it is no longer
//! needed, so it doesn't linger in freed memory (architecture note on
//! HAL-17491, 6.7). Only the crate's own copies can be wiped: the copies the
//! HTTP client makes while sending are beyond its reach.

/// Overwrites `bytes` with zeros.
pub(crate) fn wipe_bytes(bytes: &mut [u8]) {
    bytes.fill(0);
    // Keeps the zeros from being optimised away as a dead write.
    std::hint::black_box(bytes);
}

/// Overwrites `text` with zeros in place, keeping its length.
pub(crate) fn wipe_text(text: &mut String) {
    let mut bytes = std::mem::take(text).into_bytes();
    wipe_bytes(&mut bytes);
    // Zeros are valid UTF-8, so the same buffer goes back.
    *text = String::from_utf8(bytes).unwrap_or_default();
}

/// Text that held a token or a device code: its bytes are overwritten with
/// zeros when it is dropped.
#[derive(Default)]
pub(crate) struct Wiped(pub(crate) Vec<u8>);

impl Drop for Wiped {
    fn drop(&mut self) {
        wipe_bytes(&mut self.0);
    }
}

impl Wiped {
    pub(crate) fn text(text: String) -> Self {
        Self(text.into_bytes())
    }

    pub(crate) fn as_str(&self) -> &str {
        std::str::from_utf8(&self.0).unwrap_or_default()
    }
}
