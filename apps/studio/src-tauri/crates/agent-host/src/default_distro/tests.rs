//! Requirement `default-distro`: the default read from the `*` marker only.

use std::path::Path;
use std::time::Duration;

use super::{default_in_listing, halonic_is_default};
use crate::wsl::{WslError, listing_text};

/// What `wsl.exe` prints when piped: UTF-16 little-endian with a byte order mark.
fn utf16(text: &str) -> Vec<u8> {
    let mut bytes = vec![0xff, 0xfe];
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

const ENGLISH_HALONIC: &str = "  NAME       STATE           VERSION\r\n\
    * halonic    Running         2\r\n  \
    Ubuntu     Stopped         2\r\n";

#[test]
fn default_distro_is_read_from_the_star_in_english() {
    assert_eq!(default_in_listing(ENGLISH_HALONIC), Some(true));
    let ubuntu =
        "  NAME      STATE     VERSION\n* Ubuntu    Running   2\n  halonic   Stopped   2\n";
    assert_eq!(default_in_listing(ubuntu), Some(false));
}

#[test]
fn default_distro_is_read_on_a_translated_windows() {
    let german = "  NAME       STATUS            VERSION\r\n\
        * halonic    Wird ausgeführt   2\r\n  \
        Ubuntu     Beendet           2\r\n";
    assert_eq!(
        default_in_listing(&listing_text(&utf16(german))),
        Some(true)
    );
    let french = "  NOM        ÉTAT                    VERSION\r\n\
        * Ubuntu     En cours d'exécution    2\r\n  \
        halonic    Arrêté                  2\r\n";
    assert_eq!(
        default_in_listing(&listing_text(&utf16(french))),
        Some(false)
    );
}

#[test]
fn default_distro_compares_the_whole_name() {
    let similar = "  NAME          STATE     VERSION\n* halonic-old   Stopped   2\n  halonic       Running   2\n";
    assert_eq!(default_in_listing(similar), Some(false));
}

#[test]
fn default_distro_is_unknown_without_a_star() {
    assert_eq!(
        default_in_listing("  NAME   STATE   VERSION\n  halonic   Stopped   2\n"),
        None
    );
    assert_eq!(default_in_listing(""), None);
}

/// A stand-in for `wsl.exe`: an executable shell script running `body`,
/// removed when dropped.
#[cfg(unix)]
struct StandIn(std::path::PathBuf);

#[cfg(unix)]
impl StandIn {
    fn new(body: &str) -> Self {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let number = NEXT.fetch_add(1, Ordering::Relaxed);
        let name = format!("halonic-default-distro-{}-{number}", std::process::id());
        let path = std::env::temp_dir().join(name);
        halonic_stand_in::write_executable(&path, &format!("#!/bin/sh\n{body}\n"));
        Self(path)
    }
}

#[cfg(unix)]
impl Drop for StandIn {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(unix)]
#[test]
fn default_distro_runs_wsl_list_verbose_and_reads_its_utf16() {
    // printf with octal escapes: "* halonic 2" in UTF-16LE after a header line.
    let listing: String = utf16("  NAME  STATE  VERSION\r\n* halonic  Running  2\r\n")
        .iter()
        .map(|byte| format!("\\{byte:03o}"))
        .collect();
    let wsl = StandIn::new(&format!(
        "[ \"$*\" = '--list --verbose' ] || exit 9\n[ -z \"${{WSLENV+set}}\" ] || exit 8\nprintf '{listing}'"
    ));
    let answer = halonic_is_default(&wsl.0, Duration::from_secs(30));
    assert_eq!(answer, Ok(Some(true)));
}

#[cfg(unix)]
#[test]
fn default_distro_gives_up_after_the_limit_or_on_an_error() {
    let stuck = StandIn::new("sleep 30");
    let started = std::time::Instant::now();
    let answer = halonic_is_default(&stuck.0, Duration::from_millis(200));
    assert_eq!(answer, Err(WslError::TimedOut));
    assert!(started.elapsed() < Duration::from_secs(10));

    let failing = StandIn::new("exit 1");
    let answer = halonic_is_default(&failing.0, Duration::from_secs(30));
    assert_eq!(answer, Err(WslError::Failed(Some(1))));
}

#[test]
fn default_distro_fails_when_wsl_exe_cant_start() {
    let missing = Path::new("/nonexistent/wsl.exe");
    let answer = halonic_is_default(missing, Duration::from_secs(5));
    assert!(matches!(answer, Err(WslError::Start(_))));
}
