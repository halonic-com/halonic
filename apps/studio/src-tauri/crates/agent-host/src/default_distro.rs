//! Whether Halonic's distro is the person's default WSL distro (security
//! review W6, HAL-5407; HAL-12445). Then a plain `wsl` opens it, and Docker
//! Desktop's "integrate with my default WSL distro" puts its socket in it.
//! Only Windows can tell: interop is off in the distro, so the shell reads
//! it each time it starts the host there.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use crate::console_window::new_command;
use crate::wsl::{DISTRO, Input, WslError, listing_text, run_within_bytes};

/// Whether [`DISTRO`] is WSL's default distro, read from `wsl.exe --list
/// --verbose` within `limit`. `None` when the list marks no default.
///
/// # Errors
///
/// When `wsl.exe` can't start, ends with an error, or takes longer than
/// `limit` ([`WslError::TimedOut`]).
pub fn halonic_is_default(wsl: &Path, limit: Duration) -> Result<Option<bool>, WslError> {
    let mut command = new_command(wsl);
    // `WSLENV` names Windows variables that wsl.exe copies into the distro.
    command.env_remove("WSLENV").args(["--list", "--verbose"]);
    let printed = run_within_bytes(command, Input::Given(Stdio::null()), limit)?;
    Ok(default_in_listing(&listing_text(&printed)))
}

/// Whether the default in `listing`, what `wsl.exe --list --verbose`
/// printed, is [`DISTRO`]: the line whose first character other than a
/// space is `*`, compared by the name after it. Windows translates the
/// header and the state column, so only the `*` and the name are read.
/// `None` when no line has a `*`.
fn default_in_listing(listing: &str) -> Option<bool> {
    listing.lines().find_map(|line| {
        let line = line.trim_start_matches(|c: char| c == '\u{feff}' || c.is_whitespace());
        let rest = line.strip_prefix('*')?;
        Some(rest.split_whitespace().next() == Some(DISTRO))
    })
}

#[cfg(test)]
mod tests;
