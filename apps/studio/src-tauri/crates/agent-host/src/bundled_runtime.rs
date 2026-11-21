//! The runtime Studio ships for Halonic's distro (HAL-14644): the archive
//! `infra/wsl-image/runtime-archive.sh` packs, and its manifest
//! `{"version","sha256","size"}`, beside the app as the installer's
//! resources. The shell installs it when the distro's `current` runtime is
//! another version or none, before it starts the host there.
//!
//! The manifest pins the archive: [`crate::install_runtime_within`] checks
//! its SHA-256 on Windows before a byte goes in, and the updater checks it
//! again as root.

use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;

use crate::wsl::{WslError, check_sha256, check_version, install_runtime_within};

/// The runtime archive's file name beside the app.
pub const RUNTIME_ARCHIVE: &str = "halonic-runtime.tar.gz";

/// The runtime manifest's file name beside the app.
pub const RUNTIME_MANIFEST: &str = "halonic-runtime.json";

/// The runtime beside the app: its version, its archive's SHA-256 and the
/// archive's path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundledRuntime {
    /// The runtime's version, its folder name in `/opt/halonic`.
    pub version: String,
    /// The archive's SHA-256, 64 lowercase hex digits.
    pub sha256: String,
    /// The archive beside the manifest.
    pub archive: PathBuf,
}

/// The fields of the manifest the shell uses; `size` is for people.
#[derive(Deserialize)]
struct Manifest {
    version: String,
    sha256: String,
}

/// The runtime beside the app in `folder`, or `None` when this build ships
/// none: a build without the installer's resources, such as `tauri dev`.
///
/// # Errors
///
/// [`WslError::Archive`] when the manifest can't be read or isn't one, and
/// [`WslError::BadArgument`] for a version or SHA-256 the updater would refuse.
pub fn bundled_runtime(folder: &Path) -> Result<Option<BundledRuntime>, WslError> {
    let text = match std::fs::read_to_string(folder.join(RUNTIME_MANIFEST)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(WslError::Archive(format!(
                "{RUNTIME_MANIFEST} can't be read: {error}."
            )));
        }
    };
    let manifest: Manifest = serde_json::from_str(&text).map_err(|error| {
        WslError::Archive(format!(
            "{RUNTIME_MANIFEST} isn't a runtime manifest: {error}."
        ))
    })?;
    check_version(&manifest.version)?;
    check_sha256(&manifest.sha256)?;
    Ok(Some(BundledRuntime {
        version: manifest.version,
        sha256: manifest.sha256,
        archive: folder.join(RUNTIME_ARCHIVE),
    }))
}

/// What [`update_runtime`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeUpdate {
    /// The distro's current runtime already was this one; nothing ran.
    AlreadyCurrent,
    /// The updater installed it and made it current.
    Installed,
}

/// Makes `bundled` the current runtime of the distro behind `wsl`: nothing
/// when `current`, the version the updater's `status` named, already is it,
/// otherwise the updater's install step, stopped after `limit`.
///
/// # Errors
///
/// As [`crate::install_runtime_within`].
pub fn update_runtime(
    wsl: &Path,
    bundled: &BundledRuntime,
    current: Option<&str>,
    limit: Duration,
) -> Result<RuntimeUpdate, WslError> {
    if current == Some(bundled.version.as_str()) {
        return Ok(RuntimeUpdate::AlreadyCurrent);
    }
    install_runtime_within(
        wsl,
        &bundled.version,
        &bundled.archive,
        &bundled.sha256,
        limit,
    )
    .map(|()| RuntimeUpdate::Installed)
}

#[cfg(test)]
#[path = "bundled_runtime_tests.rs"]
mod tests;
