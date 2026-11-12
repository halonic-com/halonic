//! Reads environment variables as the person's terminal sees them
//! (HAL-5545). A Studio started from Finder, the Dock or a desktop launcher
//! doesn't get the variables a shell rc file sets, such as `HALONIC_HOME` in
//! `.zshrc`, so on its own it would keep trust records and runs in another
//! profile than the CLI's, with no error.
//!
//! [`login_variables`] starts the person's login shell once, interactive,
//! as a terminal would, and reads the variables it ends up with. Plain
//! library code, free of Tauri types, so it builds and tests anywhere; the
//! shell decides when to ask (`src/profile.rs`).

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

/// The line the shell prints before and after `env`, so whatever the rc
/// files print themselves is left out.
const MARKER: &str = "__halonic_login_shell_environment__";

/// Set for the login shell, so an rc file can skip work that only makes
/// sense in a real terminal, such as starting tmux.
pub const RESOLVING_VARIABLE: &str = "HALONIC_RESOLVING_ENVIRONMENT";

/// How often a running shell is checked while the reader waits.
const POLL: Duration = Duration::from_millis(10);

/// Why the login shell's variables couldn't be read.
#[derive(Debug)]
pub enum LoginShellError {
    /// The shell couldn't be started.
    Start(std::io::Error),
    /// The shell didn't finish in time and was stopped.
    TimedOut,
    /// The shell finished without printing its environment between the
    /// markers, for example because an rc file ended it early.
    NoEnvironment,
}

impl std::fmt::Display for LoginShellError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoginShellError::Start(error) => {
                write!(formatter, "the login shell didn't start: {error}")
            }
            LoginShellError::TimedOut => write!(formatter, "the login shell didn't finish in time"),
            LoginShellError::NoEnvironment => {
                write!(formatter, "the login shell didn't print its environment")
            }
        }
    }
}

impl std::error::Error for LoginShellError {}

/// The values of `names` in the login shell `shell`, started interactive
/// and as a login shell, so it reads the same rc files a terminal does. A
/// name the shell doesn't set is left out. The shell gets no input and is
/// stopped after `timeout`.
///
/// `csh` and `tcsh` take `-l` only as their sole flag, so they are started
/// with `-i` alone, as VS Code does; they still read `.cshrc`.
pub fn login_variables(
    shell: &Path,
    names: &[&str],
    timeout: Duration,
) -> Result<BTreeMap<String, OsString>, LoginShellError> {
    // `/usr/bin/env` by path, so a shell's own `env` can't print anything
    // else. `;` and `echo` work in sh, bash, zsh, fish and csh. nushell may
    // not print the first marker, as it shows only a script's last value;
    // that gives `NoEnvironment`, and the app keeps its own variables.
    let script = format!("echo {MARKER}; /usr/bin/env; echo {MARKER}");
    let mut command = Command::new(shell);
    own_session(&mut command);
    if is_csh(shell) {
        command.arg("-i");
    } else {
        command.args(["-i", "-l"]);
    }
    let mut child = command
        .arg("-c")
        .arg(script)
        .env(RESOLVING_VARIABLE, "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(LoginShellError::Start)?;

    // Read on another thread, so a large environment can't fill the pipe
    // while this one waits. Chunks come as they are read: a program the rc
    // file starts in the background may hold the pipe open long after the
    // shell has printed the environment.
    let mut stdout = child.stdout.take().expect("stdout is piped");
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut chunk = [0; 8192];
        while let Ok(read @ 1..) = stdout.read(&mut chunk) {
            if sender.send(chunk[..read].to_vec()).is_err() {
                break;
            }
        }
    });

    let deadline = Instant::now() + timeout;
    let mut output = Vec::new();
    let mut open = true;
    loop {
        while let Some(chunk) = next_chunk(&receiver, &mut open) {
            output.extend(chunk);
        }
        if let Some(found) = variables_in(&output, names) {
            stop(&mut child);
            return Ok(found);
        }
        if !open && matches!(child.try_wait(), Ok(Some(_))) {
            return Err(LoginShellError::NoEnvironment);
        }
        if Instant::now() >= deadline {
            stop_group(&child);
            stop(&mut child);
            return Err(LoginShellError::TimedOut);
        }
        thread::sleep(POLL);
    }
}

/// The next chunk the reader has sent, or `None` when there is none yet.
/// Sets `open` to false once the reader has finished.
fn next_chunk(receiver: &mpsc::Receiver<Vec<u8>>, open: &mut bool) -> Option<Vec<u8>> {
    match receiver.try_recv() {
        Ok(chunk) => Some(chunk),
        Err(mpsc::TryRecvError::Empty) => None,
        Err(mpsc::TryRecvError::Disconnected) => {
            *open = false;
            None
        }
    }
}

/// Stops the shell if it still runs, and reaps it. What the rc files
/// started is left running: a shell that answered may have started an
/// agent the person wants, such as `ssh-agent`.
fn stop(child: &mut Child) {
    if matches!(child.try_wait(), Ok(None)) {
        let _ = child.kill();
    }
    let _ = child.wait();
}

/// On Unix, the shell leads a session of its own, and so a process group
/// with the same id as its process, so a shell that hangs can be stopped
/// with everything its rc files started.
///
/// A session, not just a group (HAL-6597): when Studio has a terminal
/// (`pnpm tauri dev`, or started from a shell), an interactive bash or zsh
/// in a group of its own sees it isn't the terminal's foreground and stops
/// itself (`SIGTTIN`), so it never answers. A new session has no terminal.
#[cfg(unix)]
fn own_session(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: the closure runs in the child between `fork` and `exec`, where
    // only async-signal-safe calls are allowed. It makes one, `setsid`, and
    // reads `errno`; it allocates nothing and takes no lock.
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

/// Stops the shell's whole process group, for a shell that didn't answer in
/// time; otherwise a program its rc files started (`sleep`, a prompt that
/// waits) would keep running and hold the reader thread. The shell hasn't
/// been reaped yet, so the id is still its group's. As in `git-guard`, the
/// group is signalled through `/bin/sh`'s own `kill`, which keeps the
/// crate's unsafe code to the one `setsid` call.
#[cfg(unix)]
fn stop_group(child: &Child) {
    let _ = Command::new("/bin/sh")
        .args([
            "-c",
            "kill -s KILL -- \"-$1\"",
            "sh",
            &child.id().to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Elsewhere the shell is only asked on macOS and Linux, so there is no
/// session.
#[cfg(not(unix))]
fn own_session(_command: &mut Command) {}

#[cfg(not(unix))]
fn stop_group(_child: &Child) {}

/// The values of `names` in `env` output between the first two marker
/// lines, or `None` when there aren't two. The shell's exit status isn't
/// looked at: an rc file whose last command fails still prints the
/// environment.
fn variables_in(output: &[u8], names: &[&str]) -> Option<BTreeMap<String, OsString>> {
    let mut lines = output.split(|byte| *byte == b'\n');
    lines.by_ref().find(|line| *line == MARKER.as_bytes())?;
    let mut found = BTreeMap::new();
    for line in lines {
        if line == MARKER.as_bytes() {
            return Some(found);
        }
        for name in names {
            if let Some(value) = line
                .strip_prefix(name.as_bytes())
                .and_then(|rest| rest.strip_prefix(b"="))
            {
                found.insert((*name).to_owned(), os_string(value));
            }
        }
    }
    None
}

#[cfg(unix)]
fn os_string(bytes: &[u8]) -> OsString {
    use std::os::unix::ffi::OsStringExt;
    OsString::from_vec(bytes.to_vec())
}

#[cfg(not(unix))]
fn os_string(bytes: &[u8]) -> OsString {
    OsString::from(String::from_utf8_lossy(bytes).into_owned())
}

fn is_csh(shell: &Path) -> bool {
    matches!(
        shell.file_name().and_then(|name| name.to_str()),
        Some("csh" | "tcsh")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn output(lines: &[&str]) -> Vec<u8> {
        lines.join("\n").into_bytes()
    }

    #[test]
    fn login_shell_reads_only_between_the_markers() {
        let printed = output(&[
            "HALONIC_HOME=/printed/by/rc",
            MARKER,
            "PATH=/usr/bin",
            "HALONIC_HOME=/srv/halonic",
            MARKER,
            "HALONIC_HOME=/printed/after",
        ]);
        let found = variables_in(&printed, &["HALONIC_HOME", "XDG_DATA_HOME"]).expect("markers");
        assert_eq!(found.len(), 1);
        assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/halonic"));
    }

    #[test]
    fn login_shell_keeps_an_empty_value_and_a_value_with_an_equals_sign() {
        let printed = output(&[MARKER, "XDG_DATA_HOME=", "HALONIC_HOME=/srv/a=b", MARKER]);
        let found = variables_in(&printed, &["HALONIC_HOME", "XDG_DATA_HOME"]).expect("markers");
        assert_eq!(found["XDG_DATA_HOME"], OsString::new());
        assert_eq!(found["HALONIC_HOME"], OsString::from("/srv/a=b"));
    }

    #[test]
    fn login_shell_doesnt_take_a_longer_name_for_a_shorter_one() {
        let printed = output(&[MARKER, "HALONIC_HOME_OLD=/old", MARKER]);
        let found = variables_in(&printed, &["HALONIC_HOME"]).expect("markers");
        assert!(found.is_empty());
    }

    #[test]
    fn login_shell_without_both_markers_has_no_environment() {
        assert!(variables_in(&output(&["HALONIC_HOME=/srv"]), &["HALONIC_HOME"]).is_none());
        assert!(variables_in(&output(&[MARKER, "HALONIC_HOME=/srv"]), &["HALONIC_HOME"]).is_none());
    }

    #[test]
    fn login_shell_starts_csh_without_the_login_flag() {
        assert!(is_csh(Path::new("/bin/tcsh")));
        assert!(is_csh(Path::new("/bin/csh")));
        assert!(!is_csh(Path::new("/bin/zsh")));
    }
}
