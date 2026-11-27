//! The sandbox parts (HAL-20583, design 3): the WSL image and the Linux
//! runtime, each pinned by a file beside the app, `{"version","sha256",
//! "size","url"}`. A part is used only when its bytes match its pin, so it
//! is exactly as trusted as the app beside the pin.
//!
//! [`resolve_part`] finds a part in order: beside the app (a bundled build),
//! then `<profile>/parts/<name>-<sha256>.tar.gz`, then a download into
//! `<name>-<sha256>.tmp`, renamed only once it matches the pin. Files are
//! named by SHA-256, so a resume never mixes the bytes of two pins. This
//! file makes no network call: the download goes through a [`PartFetch`],
//! which the shell backs with its HTTP client (`parts_download.rs`) and the
//! tests with a fixture. [`part_url_allowed`] is the allow-list that client
//! asks for every hop.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::wsl::{check_sha256, check_version};

#[path = "parts_fetch.rs"]
mod fetch;
pub use fetch::{
    FetchBody, FetchError, PART_MAX_REDIRECTS, PartFetch, PartGuard, PartLocks, UrlView,
    part_url_allowed,
};

/// Retries after a first download attempt that broke off.
pub const PART_RETRIES: u32 = 3;

/// The wait before the first retry; each retry after it waits twice as long.
pub const PART_FIRST_BACKOFF: Duration = Duration::from_secs(2);

/// A sandbox part, by the names its files have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PartKind {
    /// The Linux runtime the shell installs into Halonic's distro.
    Runtime,
    /// The WSL image setup imports as Halonic's distro.
    Image,
}

impl PartKind {
    /// The part's name, the start of its cached file's name.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Runtime => "halonic-runtime",
            Self::Image => "halonic-wsl",
        }
    }

    /// The pin's file name beside the app.
    #[must_use]
    pub const fn pin_file(self) -> &'static str {
        match self {
            Self::Runtime => "halonic-runtime.json",
            Self::Image => "halonic-wsl.json",
        }
    }

    /// The part's own file name beside the app, in a bundled build.
    #[must_use]
    pub const fn bundled_file(self) -> &'static str {
        match self {
            Self::Runtime => "halonic-runtime.tar.gz",
            Self::Image => "halonic-wsl.tar.gz",
        }
    }
}

/// A part's pin, as the file beside the app gives it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartPin {
    /// The part's version.
    pub version: String,
    /// The part's SHA-256, 64 lowercase hex digits.
    pub sha256: String,
    /// The part's size in bytes.
    pub size: u64,
    /// Where to download it; only where, never whether to trust it.
    pub url: String,
    /// The runtime pin only: the lowest runtime the app starts the host on.
    #[serde(default)]
    pub min_runtime: Option<String>,
}

/// Why a part couldn't be had.
#[derive(Debug)]
pub enum PartError {
    /// The pin beside the app can't be read, or isn't one.
    Pin(String),
    /// Reading or writing in `parts/` failed.
    Disk(io::Error),
    /// The download failed, after its retries where retrying helps.
    Fetch(FetchError),
    /// The downloaded bytes aren't the pinned part; they were deleted.
    Mismatch,
}

impl From<io::Error> for PartError {
    fn from(error: io::Error) -> Self {
        Self::Disk(error)
    }
}

/// Reads `kind`'s pin from the app's `folder`, each time it is used, never
/// from a copy. `None` when this build ships no pin, such as `tauri dev`.
///
/// # Errors
///
/// [`PartError::Pin`] when the pin can't be read, isn't one, or has a
/// version or SHA-256 the runtime updater would refuse.
pub fn read_pin(folder: &Path, kind: PartKind) -> Result<Option<PartPin>, PartError> {
    let file = kind.pin_file();
    let text = match fs::read_to_string(folder.join(file)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(PartError::Pin(format!("{file} can't be read: {error}."))),
    };
    let pin: PartPin = serde_json::from_str(&text)
        .map_err(|error| PartError::Pin(format!("{file} isn't a part pin: {error}.")))?;
    let checked = check_version(&pin.version).and_then(|()| check_sha256(&pin.sha256));
    checked.map_err(|error| PartError::Pin(format!("{file}: {error}")))?;
    Ok(Some(pin))
}

/// Where a downloaded part is kept: `<parts>/<name>-<sha256>.tar.gz`.
#[must_use]
pub fn cached_path(parts: &Path, kind: PartKind, pin: &PartPin) -> PathBuf {
    parts.join(format!("{}-{}.tar.gz", kind.name(), pin.sha256))
}

/// Where a part downloads until it matches: `<parts>/<name>-<sha256>.tmp`.
#[must_use]
pub fn partial_path(parts: &Path, kind: PartKind, pin: &PartPin) -> PathBuf {
    parts.join(format!("{}-{}.tmp", kind.name(), pin.sha256))
}

/// Whether the file at `path` is exactly the pinned part: its size, then
/// its SHA-256. A missing file isn't.
///
/// # Errors
///
/// The read error, other than a missing file.
pub fn matches_pin(path: &Path, pin: &PartPin) -> io::Result<bool> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    if file.metadata()?.len() != pin.size {
        return Ok(false);
    }
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher)?;
    Ok(hex(&hasher.finalize()) == pin.sha256)
}

/// Finds or downloads `kind`'s part for `pin`, and answers its path once
/// its bytes match the pin. `beside` is the app's folder, `parts` the
/// profile's `parts/` folder. Only one download runs per part at a time
/// (`locks`); a second call waits, then finds the first one's file. A
/// download that breaks off resumes from the pin's URL, up to
/// [`PART_RETRIES`] times, after `wait` (backoff).
///
/// # Errors
///
/// [`PartError::Mismatch`] when the downloaded bytes aren't the part,
/// [`PartError::Fetch`] when the download failed, [`PartError::Disk`].
pub fn resolve_part(
    beside: &Path,
    parts: &Path,
    kind: PartKind,
    pin: &PartPin,
    locks: &PartLocks,
    fetch: &dyn PartFetch,
    wait: &dyn Fn(Duration),
) -> Result<PathBuf, PartError> {
    let bundled = beside.join(kind.bundled_file());
    if matches_pin(&bundled, pin)? {
        return Ok(bundled);
    }
    let cached = cached_path(parts, kind, pin);
    let _held = locks.hold(&cached);
    if matches_pin(&cached, pin)? {
        return Ok(cached);
    }
    remove_if_present(&cached)?;
    fs::create_dir_all(parts)?;
    let partial = partial_path(parts, kind, pin);
    download_with_retries(&partial, pin, fetch, wait)?;
    if !matches_pin(&partial, pin)? {
        remove_if_present(&partial)?;
        return Err(PartError::Mismatch);
    }
    fs::rename(&partial, &cached)?;
    Ok(cached)
}

/// Deletes the downloaded copy of `kind`'s part once it is installed. A
/// part beside the app is the installer's and stays.
///
/// # Errors
///
/// The delete error, other than a file already gone.
pub fn remove_installed(parts: &Path, kind: PartKind, pin: &PartPin) -> io::Result<()> {
    remove_if_present(&cached_path(parts, kind, pin))?;
    remove_if_present(&partial_path(parts, kind, pin))
}

/// Tries the download, then retries the attempts that broke off, each
/// after twice the wait before it. A refusal or a wrong answer isn't retried.
fn download_with_retries(
    partial: &Path,
    pin: &PartPin,
    fetch: &dyn PartFetch,
    wait: &dyn Fn(Duration),
) -> Result<(), PartError> {
    let mut backoff = PART_FIRST_BACKOFF;
    let mut retries_left = PART_RETRIES;
    loop {
        match download_once(partial, pin, fetch) {
            Ok(()) => return Ok(()),
            Err(PartError::Fetch(error)) if error.retryable() && retries_left > 0 => {
                retries_left -= 1;
                wait(backoff);
                backoff = backoff.saturating_mul(2);
            }
            Err(error) => return Err(error),
        }
    }
}

/// One attempt: continues the `.tmp` from its length, always from the pin's
/// URL (a redirect's URL expires), and writes at most the pinned size.
fn download_once(partial: &Path, pin: &PartPin, fetch: &dyn PartFetch) -> Result<(), PartError> {
    let mut from = fs::metadata(partial).map_or(0, |metadata| metadata.len());
    if from > pin.size {
        remove_if_present(partial)?;
        from = 0;
    }
    if from == pin.size {
        return Ok(());
    }
    let body = fetch.open(&pin.url, from).map_err(PartError::Fetch)?;
    // A server that ignores the range sends the whole part again.
    let start = if body.start == from { from } else { 0 };
    if body.start != from && body.start != 0 {
        return Err(PartError::Fetch(FetchError::Network(format!(
            "the server answered from byte {} for byte {from}.",
            body.start
        ))));
    }
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(start == 0)
        .append(start != 0)
        .open(partial)?;
    let remaining = pin.size - start;
    let written = io::copy(&mut body.reader.take(remaining), &mut file).map_err(fetch_read)?;
    file.flush()?;
    if written < remaining {
        return Err(PartError::Fetch(FetchError::Network(format!(
            "the download broke off after {} of {} bytes.",
            start + written,
            pin.size
        ))));
    }
    Ok(())
}

/// A read from the download that failed broke it off, so it is retried.
fn fetch_read(error: io::Error) -> PartError {
    PartError::Fetch(FetchError::Network(format!(
        "the download broke off: {error}"
    )))
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
#[path = "parts_tests.rs"]
mod tests;
