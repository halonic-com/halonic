//! What the phone keeps about a paired computer besides its key, and the
//! file format it is kept in. Nothing here is secret: the computer's name,
//! the endpoint the phone paired through and the computer's public key. The
//! store keeps it next to the sealed key and forgets both together.

use crate::key::KEY_BYTES;

/// The first bytes of every details file: the format's version.
const DETAILS_MAGIC: &[u8] = b"HPC1";

/// A paired computer's details, as pairing ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComputerDetails {
    /// The name the computer gave in pairing message 2.
    pub name: String,
    /// The endpoint the phone paired through, as the pairing gave it.
    pub endpoint: String,
    /// The computer's static key, pinned when the computer said `paired`.
    pub host_key: [u8; KEY_BYTES],
    /// When the pairing ended, in milliseconds since the Unix epoch.
    pub paired_at_ms: u64,
}

impl ComputerDetails {
    /// The details as they are stored: `HPC1`, the host key, the time as
    /// 8 bytes big-endian, then the name and the endpoint, each as its
    /// length in 2 bytes big-endian and its UTF-8 bytes. `None` when the
    /// name or the endpoint is longer than 2 bytes can say.
    pub(crate) fn to_stored_form(&self) -> Option<Vec<u8>> {
        let name = text_with_length(&self.name)?;
        let endpoint = text_with_length(&self.endpoint)?;
        let parts: [&[u8]; 5] = [
            DETAILS_MAGIC,
            &self.host_key,
            &self.paired_at_ms.to_be_bytes(),
            &name,
            &endpoint,
        ];
        Some(parts.concat())
    }

    /// Reads [`Self::to_stored_form`] back; `None` for anything else,
    /// bytes left over included.
    pub(crate) fn from_stored_form(bytes: &[u8]) -> Option<Self> {
        let mut reader = Reader(bytes.strip_prefix(DETAILS_MAGIC)?);
        let details = Self {
            host_key: reader.take(KEY_BYTES)?.try_into().ok()?,
            paired_at_ms: u64::from_be_bytes(reader.take(8)?.try_into().ok()?),
            name: reader.text()?,
            endpoint: reader.text()?,
        };
        reader.0.is_empty().then_some(details)
    }
}

fn text_with_length(text: &str) -> Option<Vec<u8>> {
    let length = u16::try_from(text.len()).ok()?;
    let parts: [&[u8]; 2] = [&length.to_be_bytes(), text.as_bytes()];
    Some(parts.concat())
}

/// The bytes not read yet.
struct Reader<'a>(&'a [u8]);

impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Option<&'a [u8]> {
        if self.0.len() < count {
            return None;
        }
        let (taken, rest) = self.0.split_at(count);
        self.0 = rest;
        Some(taken)
    }

    fn text(&mut self) -> Option<String> {
        let length = u16::from_be_bytes(self.take(2)?.try_into().ok()?);
        let bytes = self.take(usize::from(length))?;
        String::from_utf8(bytes.to_vec()).ok()
    }
}
