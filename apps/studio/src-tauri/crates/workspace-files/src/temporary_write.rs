//! The temporary files a write renames into place, named as
//! `temporary-write.ts` in `fs-node` names them, so the CLI and the desktop
//! app each leave the other's half-done writes out.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};

const PREFIX: &str = ".halonic-write-";
const SUFFIX: &str = ".tmp";

/// A new name for a temporary file next to the file it replaces:
/// `.halonic-write-<uuid>.tmp`, with a version 4 UUID.
///
/// The name only has to differ from every other: the file is created with
/// `create_new`, so a name already taken fails rather than writing through
/// what is there. Each `RandomState` has its own keys, seeded from the
/// operating system's randomness, so no crate is needed for this.
pub(crate) fn temporary_write_name() -> String {
    static COUNT: AtomicU64 = AtomicU64::new(0);
    let count = COUNT.fetch_add(1, Ordering::Relaxed);
    let half = |part: u8| {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(count);
        hasher.write_u8(part);
        hasher.finish().to_be_bytes()
    };
    let mut bytes = [0_u8; 16];
    bytes[..8].copy_from_slice(&half(0));
    bytes[8..].copy_from_slice(&half(1));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{PREFIX}{}-{}-{}-{}-{}{SUFFIX}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}

/// Whether a file name is a temporary write's, as `/^\.halonic-write-[0-9a-f-]+\.tmp$/u`
/// matches in `fs-node`.
pub(crate) fn is_temporary_write(name: &str) -> bool {
    name.strip_prefix(PREFIX)
        .and_then(|rest| rest.strip_suffix(SUFFIX))
        .is_some_and(|id| {
            !id.is_empty()
                && id.bytes().all(|byte| {
                    byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte) || byte == b'-'
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_name_is_one_the_list_leaves_out() {
        let first = temporary_write_name();
        let second = temporary_write_name();
        assert_ne!(first, second);
        assert!(is_temporary_write(&first), "{first}");
        assert_eq!(first.len(), PREFIX.len() + 36 + SUFFIX.len(), "{first}");
        assert_eq!(&first[PREFIX.len() + 14..PREFIX.len() + 15], "4", "{first}");
    }

    #[test]
    fn only_the_names_fs_node_writes_are_temporary() {
        assert!(is_temporary_write(
            ".halonic-write-0b5c6f4e-2a1d-4c3b-9e8f-7a6b5c4d3e2f.tmp"
        ));
        for name in [
            ".halonic-write-.tmp",
            ".halonic-write-ABC.tmp",
            ".halonic-write-abc.tmp.yaml",
            "halonic-write-abc.tmp",
            ".halonic-write-abc_d.tmp",
        ] {
            assert!(!is_temporary_write(name), "{name}");
        }
    }
}
