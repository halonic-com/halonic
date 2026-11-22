//! Whether a folder git runs in is one the person trusted, for the git
//! runner (requirement `trusted-filters` in `halonic-git-guard`).

use std::path::Path;

use halonic_git_guard::plain_path;
use halonic_trust_store::FileTrustStore;

/// Whether `folder`, a canonical path, is a folder the person trusted or is
/// inside one: `store` holds a record for it or for a folder above it, by
/// the plain location records are keyed by. Only then does the git runner
/// let the user's own filter drivers run there.
///
/// The records are read on every call, not kept: revoking trust, in the
/// Studio or with `halonic trust --remove`, counts from the next git call,
/// and a folder trusted before a restart stays trusted. A record that can't
/// be read counts as none, so a damaged record never trusts a folder.
pub fn is_trusted_folder(store: &FileTrustStore, folder: &Path) -> bool {
    folder.ancestors().any(|ancestor| {
        plain_path(ancestor)
            .into_string()
            .is_ok_and(|location| matches!(store.get(&location), Ok(Some(_))))
    })
}
