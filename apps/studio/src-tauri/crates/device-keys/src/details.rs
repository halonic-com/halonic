//! What the phone keeps about a paired computer besides its key, and the
//! file format it is kept in. Nothing here is secret: the computer's name,
//! the endpoints the phone reached it through, its public key and a few
//! times. The store keeps it next to the sealed key.

use crate::computer::ComputerId;
use crate::key::KEY_BYTES;

/// The first bytes of every details file: the format's version.
const DETAILS_MAGIC: &[u8] = b"HPC1";

/// The most endpoints kept for one computer; the oldest go first.
pub const MAX_ENDPOINTS: usize = 8;

/// Where the phone stands with a computer it has paired with (design
/// decision 7 on HAL-12206).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Standing {
    /// The phone's key is kept and the computer's key is pinned.
    Paired { host_key: [u8; KEY_BYTES] },
    /// The computer answered with another key than the pinned one ("Can't
    /// confirm your computer"). Nothing is cleared: the key stays, and so
    /// does the pin, until the person pairs again or forgets the computer.
    CantConfirm { host_key: [u8; KEY_BYTES] },
    /// The computer proved who it is, then said the phone isn't paired
    /// ("Removed from this computer"). The phone's key and the pin are
    /// gone; the name and endpoints stay, for Pair again and Forget.
    Removed,
}

impl Standing {
    /// The pinned key; `None` once Removed.
    pub fn host_key(&self) -> Option<&[u8; KEY_BYTES]> {
        match self {
            Standing::Paired { host_key } | Standing::CantConfirm { host_key } => Some(host_key),
            Standing::Removed => None,
        }
    }
}

/// A paired computer's details.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComputerDetails {
    /// The name the computer gave in pairing message 2.
    pub name: String,
    /// The endpoints the phone paired through, the latest first, at most
    /// [`MAX_ENDPOINTS`]; the computer picker offers them for a typed code.
    pub endpoints: Vec<String>,
    pub standing: Standing,
    /// When the latest pairing ended, in milliseconds since the Unix epoch.
    pub paired_at_ms: u64,
    /// When the phone was last connected to it, for the "as of" line.
    pub last_connected_at_ms: Option<u64>,
}

/// The standing's tag in the stored form.
const PAIRED: u8 = 0;
const CANT_CONFIRM: u8 = 1;
const REMOVED: u8 = 2;

impl ComputerDetails {
    /// The details as they are stored for `id`: `HPC1`, the id, the
    /// standing's tag (0 paired, 1 can't confirm, 2 removed) followed by the
    /// pinned key unless removed, the pairing time as 8 bytes big-endian,
    /// a 0 or a 1 followed by the last connection's time, the name, then
    /// the number of endpoints in 1 byte and each endpoint. Texts are their
    /// length in 2 bytes big-endian and their UTF-8 bytes. `None` when a
    /// text is longer than 2 bytes can say or there are too many endpoints.
    pub(crate) fn to_stored_form(&self, id: &ComputerId) -> Option<Vec<u8>> {
        if self.endpoints.len() > MAX_ENDPOINTS {
            return None;
        }
        let mut stored = DETAILS_MAGIC.to_vec();
        push_text(&mut stored, id.as_str())?;
        match self.standing {
            Standing::Paired { host_key } => {
                stored.push(PAIRED);
                stored.extend_from_slice(&host_key);
            }
            Standing::CantConfirm { host_key } => {
                stored.push(CANT_CONFIRM);
                stored.extend_from_slice(&host_key);
            }
            Standing::Removed => stored.push(REMOVED),
        }
        stored.extend_from_slice(&self.paired_at_ms.to_be_bytes());
        match self.last_connected_at_ms {
            Some(at) => {
                stored.push(1);
                stored.extend_from_slice(&at.to_be_bytes());
            }
            None => stored.push(0),
        }
        push_text(&mut stored, &self.name)?;
        stored.push(u8::try_from(self.endpoints.len()).ok()?);
        for endpoint in &self.endpoints {
            push_text(&mut stored, endpoint)?;
        }
        Some(stored)
    }

    /// Reads [`Self::to_stored_form`] back, with the id it was stored for;
    /// `None` for anything else, bytes left over included.
    pub(crate) fn from_stored_form(bytes: &[u8]) -> Option<(ComputerId, Self)> {
        let mut reader = Reader(bytes.strip_prefix(DETAILS_MAGIC)?);
        let id = ComputerId::parse(&reader.text()?).ok()?;
        let standing = match reader.byte()? {
            PAIRED => Standing::Paired {
                host_key: reader.key()?,
            },
            CANT_CONFIRM => Standing::CantConfirm {
                host_key: reader.key()?,
            },
            REMOVED => Standing::Removed,
            _ => return None,
        };
        let paired_at_ms = reader.time()?;
        let last_connected_at_ms = match reader.byte()? {
            0 => None,
            1 => Some(reader.time()?),
            _ => return None,
        };
        let name = reader.text()?;
        let count = usize::from(reader.byte()?);
        if count > MAX_ENDPOINTS {
            return None;
        }
        let endpoints = (0..count)
            .map(|_| reader.text())
            .collect::<Option<Vec<_>>>()?;
        let details = Self {
            name,
            endpoints,
            standing,
            paired_at_ms,
            last_connected_at_ms,
        };
        reader.0.is_empty().then_some((id, details))
    }
}

fn push_text(stored: &mut Vec<u8>, text: &str) -> Option<()> {
    let length = u16::try_from(text.len()).ok()?;
    stored.extend_from_slice(&length.to_be_bytes());
    stored.extend_from_slice(text.as_bytes());
    Some(())
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

    fn byte(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }

    fn key(&mut self) -> Option<[u8; KEY_BYTES]> {
        self.take(KEY_BYTES)?.try_into().ok()
    }

    fn time(&mut self) -> Option<u64> {
        Some(u64::from_be_bytes(self.take(8)?.try_into().ok()?))
    }

    fn text(&mut self) -> Option<String> {
        let length = u16::from_be_bytes(self.take(2)?.try_into().ok()?);
        let bytes = self.take(usize::from(length))?;
        String::from_utf8(bytes.to_vec()).ok()
    }
}
