//! The settings kept where Halonic runs (HAL-6261): the assistant and the
//! sandbox default, for every workspace on this computer, in one JSON file,
//! `host.json`, in the profile's `settings` folder.
//!
//! [`FileHostSettingsStore`] reads and saves that file exactly as
//! `FileHostSettingsStore` in `packages/adapters/fs-node` does, so the
//! desktop app and the CLI share it: `{"version":1,"values":{…}}`, keys
//! checked as `isHostSettingKey` checks them, at most 256 KiB of values, a
//! save through a temporary file and a rename, the file with mode `600`, and
//! a link refused on read and replaced on save. The limits and saved shapes
//! are the golden cases next to the port's contract suite
//! (`packages/testing/contracts/src/golden/host-settings-limits.json`), which
//! both sides are tested against.
//!
//! The store only keeps JSON values by key. What a setting means, and its
//! default, belong to `HostSettings` in the page. This crate holds no Tauri
//! types.

mod error;
mod rename_over;
mod saved;
mod store;
mod unlinked;

pub use error::HostSettingsError;
pub use saved::{
    MAX_BYTES, SavedChange, change_saved_host_settings, is_host_setting_key,
    read_saved_host_settings,
};
pub use store::FileHostSettingsStore;
