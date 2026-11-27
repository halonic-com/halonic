//! What a part's download needs from the network, without making a call:
//! the fetch seam, the allow-list every hop is asked, and the lock that
//! keeps one download per part.

use std::collections::HashSet;
use std::fmt;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

/// The most redirects a part's download follows.
pub const PART_MAX_REDIRECTS: usize = 3;

/// The only host a pin's URL may name.
const RELEASE_HOST: &str = "github.com";

/// The release paths on [`RELEASE_HOST`] a pin's URL may name.
const RELEASE_PATHS: [&str; 2] = [
    "/halonic-com/halonic/releases/download/",
    "/halonic-com/halonic-preview/releases/download/",
];

/// The only host a redirect may go to, matched exactly.
const ASSET_HOST: &str = "release-assets.githubusercontent.com";

/// The parts of a URL the allow-list decides on, as the caller's URL
/// parser gives them: this crate parses no URLs.
#[derive(Debug, Clone, Copy)]
pub struct UrlView<'a> {
    /// The scheme, such as `https`.
    pub scheme: &'a str,
    /// Whether the URL has a user name or a password.
    pub has_credentials: bool,
    /// The host, lower case.
    pub host: &'a str,
    /// The port, or the scheme's default.
    pub port: Option<u16>,
    /// The path, normalised by the parser.
    pub path: &'a str,
}

/// Whether a part's download may go to `url`, its `redirects`-th redirect
/// (0 for the pin's own URL). Every hop is `https` on port 443 with no user
/// name; the pin's URL is on `github.com` under one of the two release
/// paths, and a redirect goes only to `release-assets.githubusercontent.com`,
/// at most [`PART_MAX_REDIRECTS`] times. Nothing widens it.
///
/// # Errors
///
/// Why the hop is refused, for the log.
pub fn part_url_allowed(url: &UrlView<'_>, redirects: usize) -> Result<(), String> {
    if redirects > PART_MAX_REDIRECTS {
        return Err(format!("more than {PART_MAX_REDIRECTS} redirects."));
    }
    if url.scheme != "https" || url.port != Some(443) {
        return Err("only https on port 443.".to_owned());
    }
    if url.has_credentials {
        return Err("a user name in the URL.".to_owned());
    }
    let allowed = if redirects == 0 {
        url.host == RELEASE_HOST && on_release_path(url.path)
    } else {
        url.host == ASSET_HOST
    };
    if allowed {
        Ok(())
    } else {
        Err(format!("{} isn't a Halonic release download.", url.host))
    }
}

/// Under a release path, with no `..` segment the parser might have kept.
fn on_release_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let climbs = lower
        .split('/')
        .any(|segment| segment == ".." || segment == "%2e%2e");
    !climbs && RELEASE_PATHS.iter().any(|prefix| path.starts_with(prefix))
}

/// An open download: where its bytes start, and the bytes.
pub struct FetchBody {
    /// The byte the body starts at: the asked one when the server honoured
    /// the range, 0 when it sends the whole part.
    pub start: u64,
    /// The body; the resolver reads at most the pinned size of it.
    pub reader: Box<dyn Read + Send>,
}

/// Why a download couldn't be opened or read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FetchError {
    /// The allow-list or the proxy rules refused it; nothing was sent.
    Refused(String),
    /// The server answered something other than the part.
    Status(u16),
    /// The connection failed or broke off; a retry may help.
    Network(String),
}

impl FetchError {
    /// Whether a retry may help: a broken connection or a server error.
    #[must_use]
    pub fn retryable(&self) -> bool {
        match self {
            Self::Network(_) => true,
            Self::Status(status) => *status >= 500,
            Self::Refused(_) => false,
        }
    }
}

impl fmt::Display for FetchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Refused(reason) => write!(formatter, "refused: {reason}"),
            Self::Status(status) => write!(formatter, "the server answered {status}"),
            Self::Network(reason) => formatter.write_str(reason),
        }
    }
}

/// Opens a part's download. The shell's is its HTTP client on the update
/// proxy rules and [`part_url_allowed`]; the tests' is a fixture.
pub trait PartFetch: Sync {
    /// Opens `url` from byte `from` (a `Range` request when it isn't 0).
    ///
    /// # Errors
    ///
    /// [`FetchError`] when nothing could be opened.
    fn open(&self, url: &str, from: u64) -> Result<FetchBody, FetchError>;
}

/// The parts downloading now, so a second download of one waits for the
/// first. The shell keeps one for the app's life.
#[derive(Default)]
pub struct PartLocks {
    held: Mutex<HashSet<PathBuf>>,
    freed: Condvar,
}

impl PartLocks {
    /// Waits until no one holds `file`, then holds it until the guard drops.
    pub fn hold(&self, file: &Path) -> PartGuard<'_> {
        let mut held = self.lock();
        while held.contains(file) {
            held = self
                .freed
                .wait(held)
                .unwrap_or_else(PoisonError::into_inner);
        }
        held.insert(file.to_path_buf());
        PartGuard {
            locks: self,
            file: file.to_path_buf(),
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashSet<PathBuf>> {
        self.held.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Holds one part's download; dropping it lets the next one in.
pub struct PartGuard<'a> {
    locks: &'a PartLocks,
    file: PathBuf,
}

impl Drop for PartGuard<'_> {
    fn drop(&mut self) {
        self.locks.lock().remove(&self.file);
        self.locks.freed.notify_all();
    }
}

#[cfg(test)]
#[path = "parts_fetch_tests.rs"]
mod tests;
