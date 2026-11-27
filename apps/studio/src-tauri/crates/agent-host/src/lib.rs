//! Starts the agent host (`apps/agent-host`) for the Studio shell. The host
//! runs the sandbox, the bridge and the harnesses, which need Node, and
//! serves them on loopback. The shell starts it with the profile folder,
//! reads the one handshake line it prints (`{"url","token"}`) and keeps its
//! standard input open: the host stops when that closes, so it never outlives
//! the shell. In Halonic's WSL distro the host listens on no port; a relay
//! on loopback passes the shell's connections to it over its standard input
//! and output instead (`relay.rs`). Either way the shell may also answer the
//! host's requests for its own secrets (`host_secrets.rs`). Nothing here
//! knows Tauri, so it builds and tests anywhere.

mod bundled_runtime;
mod console_window;
mod default_distro;
pub mod engine_command;
mod error;
mod handshake;
#[cfg(test)]
mod held_backend;
mod host_secrets;
mod loopback_secrets;
mod opened_workspaces;
mod paperclip_keep;
mod paperclip_routes;
mod relay;
mod route_kinds;
mod routes;
mod runtime_status;
mod security_updates;
mod stderr_log;
mod stream_lines;
mod wsl;
mod wsl_setup;

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

pub use bundled_runtime::{
    BundledRuntime, RUNTIME_ARCHIVE, RUNTIME_MANIFEST, RuntimeUpdate, bundled_runtime,
    update_runtime,
};
use console_window::{new_command, without_console_window};
pub use default_distro::halonic_is_default;
pub use error::{AgentHostError, StartCause};
use halonic_secrets::SecretBackend;
use handshake::{FirstLine, read_first_line};
pub use handshake::{Handshake, read_handshake};
use loopback_secrets::LoopbackSecrets;
pub use paperclip_keep::{
    HostCallFailed, KeepTurns, SignInHost, forget_paperclip_key, keep_poll_answer, page_answer,
    page_cancel_answer,
};
pub use paperclip_routes::{SIGN_IN_CANCEL, SIGN_IN_CONFIRM};
use relay::Relay;
pub use route_kinds::{Answer, Method, Route};
pub use routes::find_route;
pub use runtime_status::{current_runtime, runtime_installed};
pub use security_updates::{OVERDUE_AFTER_DAYS, SecurityUpdates, security_updates};
pub use stderr_log::log_stderr;
pub use stream_lines::{LineSplitter, LineTooLong};
pub use wsl::{
    DISTRO, DISTRO_HOST, DISTRO_PROFILE_FOLDER, DISTRO_USER, RUNTIME_UPDATER, RuntimeStep,
    SettingCopy, WslError, copy_sandbox_setting, distro_host_command, distro_installed_within,
    file_sha256, install_runtime, install_runtime_within, run_runtime_step,
    run_runtime_step_within, runtime_command, setting_copy_command, wsl_exe,
};
pub use wsl_setup::{
    WSL_IMAGE, WslSetupEnd, WslSetupRun, WslSetupRuns, read_wsl_setup_end, resume_command,
    wsl_setup_command,
};

/// The host's executable name, without the `.exe` Windows adds.
pub const EXECUTABLE_NAME: &str = "halonic-agent-host";

/// The most a host serving over standard input and output may print before
/// its handshake line: `wsl.exe`'s own messages, such as an update notice.
const BEFORE_HANDSHAKE_LIMIT: u64 = 64 * 1024;

/// How often [`AgentHost::stop`] checks whether the host has exited.
const EXIT_POLL: Duration = Duration::from_millis(25);

/// The argument that tells the host the shell answers for its own secrets
/// on connection id 0, so it keeps them in the OS keychain (requirement
/// `agent-host.keychain-secrets`). The shell adds it only when it does.
const KEYCHAIN_RELAY_ARG: &str = "--keychain-relay";

/// How long dropping an [`AgentHost`] waits for it to exit on its own.
const DROP_GRACE: Duration = Duration::from_secs(5);

/// How long a host that closed its output before its handshake is given to
/// exit, so its exit code can be read.
const EXIT_CODE_WAIT: Duration = Duration::from_secs(2);

/// How [`AgentHost::stop`] ended the host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stopped {
    /// It exited on its own once its input closed.
    Exited,
    /// It was still running after the grace period, so it was killed.
    Killed,
}

/// Where the host's executable is: next to the program that starts it.
///
/// # Errors
///
/// [`AgentHostError::Start`] when `program` has no folder.
pub fn executable_beside(program: &Path) -> Result<PathBuf, AgentHostError> {
    let folder = program.parent().ok_or_else(|| {
        AgentHostError::Start(
            StartCause::Missing,
            "The agent host can't be found: the app has no folder.".to_owned(),
        )
    })?;
    Ok(folder.join(format!("{EXECUTABLE_NAME}{}", std::env::consts::EXE_SUFFIX)))
}

/// The command that serves the host for one profile folder. While it holds
/// the profile's lock, the host forgets the kept Windows grants inside each
/// of `sweep_roots` that crashed sessions left (HAL-6256).
pub fn host_command(executable: &Path, profile_folder: &Path, sweep_roots: &[PathBuf]) -> Command {
    let mut command = new_command(executable);
    command.arg("--profile-folder").arg(profile_folder);
    for root in sweep_roots {
        command.arg("--sweep-root").arg(root);
    }
    command
}

/// A running host, with its standard input held open. Dropping it closes
/// the input and waits a few seconds for the host to close its sessions and
/// exit, then kills it.
pub struct AgentHost {
    child: Child,
    stdin: Option<ChildStdin>,
    /// The relay a host serving over its standard input and output has;
    /// the relay holds that input then.
    relay: Option<Relay>,
    /// The secrets channel of a host serving on loopback, when the shell
    /// answers for its secrets; the channel holds its input then.
    secrets: Option<LoopbackSecrets>,
    handshake: Handshake,
    /// The folders already named to the host (`opened_workspaces.rs`).
    named: Vec<PathBuf>,
}

impl AgentHost {
    /// Starts `command` and waits up to `wait` for its handshake line. Its
    /// output after that line is read and dropped, so a host that prints
    /// more never blocks on a full pipe. Its errors go to the shell's own;
    /// on Windows a GUI shell has none, so they are lost there. On Windows
    /// the host starts without a console window.
    ///
    /// # Errors
    ///
    /// When the program can't start, ends early, prints no line within
    /// `wait` or prints a line that isn't a valid handshake. The program is
    /// killed in each case after it started.
    pub fn start(command: Command, wait: Duration) -> Result<Self, AgentHostError> {
        Self::start_answering_secrets(command, wait, None)
    }

    /// As [`AgentHost::start`]; with `secrets`, the host is told so
    /// (`--keychain-relay`), and its output after the handshake line carries
    /// its secret requests, answered from `secrets`, the keychain on desktop
    /// (requirement `host-secrets-channel`).
    ///
    /// # Errors
    ///
    /// As [`AgentHost::start`].
    pub fn start_answering_secrets(
        mut command: Command,
        wait: Duration,
        secrets: Option<Arc<dyn SecretBackend>>,
    ) -> Result<Self, AgentHostError> {
        if secrets.is_some() {
            command.arg(KEYCHAIN_RELAY_ARG);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        without_console_window(&mut command);
        let mut child = command.spawn().map_err(|error| {
            AgentHostError::Start(
                StartCause::of(&error),
                format!("The agent host could not start: {error}."),
            )
        })?;
        log_stderr(&mut child, "agent host");
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            kill(&mut child);
            return Err(AgentHostError::Exited(None));
        };
        let handshake = match read_first_line(stdout).recv_timeout(wait) {
            Ok((FirstLine::Text(line), rest)) => read_handshake(&line).map(|shake| (shake, rest)),
            Ok((FirstLine::NotText, _)) => Err(handshake::refused("it isn't UTF-8 text")),
            Ok((FirstLine::Ended, _)) => Err(AgentHostError::Exited(exit_code(&mut child))),
            Err(_) => Err(AgentHostError::TimedOut(wait)),
        };
        let (handshake, rest) = match handshake {
            Ok(read) => read,
            Err(error) => {
                kill(&mut child);
                return Err(error);
            }
        };
        let (stdin, secrets) = match secrets {
            Some(backend) => (None, Some(LoopbackSecrets::serve(stdin, rest, backend))),
            None => {
                drain(rest);
                (Some(stdin), None)
            }
        };
        Ok(Self {
            child,
            stdin,
            relay: None,
            secrets,
            handshake,
            named: Vec::new(),
        })
    }

    /// Starts a host that serves over its standard input and output
    /// (`--stdio`), as in Halonic's WSL distro, and a relay on `127.0.0.1`
    /// that passes the shell's connections to it. The relay listens first;
    /// `command` gets its port and makes the command, such as
    /// [`distro_host_command`]. Lines before the handshake that aren't JSON,
    /// such as `wsl.exe`'s own messages, are skipped. The handshake's `url`
    /// is the relay's, so the shell calls the host as it would on loopback.
    ///
    /// # Errors
    ///
    /// As [`AgentHost::start`], and when the relay can't listen or the host
    /// prints more than 64 KiB before its handshake.
    pub fn start_relayed(
        command: impl FnOnce(u16) -> Command,
        wait: Duration,
    ) -> Result<Self, AgentHostError> {
        Self::start_relayed_answering_secrets(command, wait, None)
    }

    /// As [`AgentHost::start_relayed`]; with `secrets`, the host is told so
    /// (`--keychain-relay`), and the relay also answers its requests for its
    /// own secrets, from the keychain on desktop (requirement
    /// `host-secrets-channel`).
    ///
    /// # Errors
    ///
    /// As [`AgentHost::start_relayed`].
    pub fn start_relayed_answering_secrets(
        command: impl FnOnce(u16) -> Command,
        wait: Duration,
        secrets: Option<Arc<dyn SecretBackend>>,
    ) -> Result<Self, AgentHostError> {
        let mut relay = Relay::bind().map_err(|error| {
            AgentHostError::Start(
                StartCause::of(&error),
                format!("The agent host's relay could not listen: {error}."),
            )
        })?;
        let mut command = command(relay.port());
        if let Some(secrets) = secrets {
            relay.answer_host_secrets(secrets);
            command.arg(KEYCHAIN_RELAY_ARG);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        without_console_window(&mut command);
        let mut child = command.spawn().map_err(|error| {
            AgentHostError::Start(
                StartCause::of(&error),
                format!("The agent host could not start: {error}."),
            )
        })?;
        log_stderr(&mut child, "agent host");
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            kill(&mut child);
            return Err(AgentHostError::Exited(None));
        };
        let answer = match read_relayed_handshake_line(stdout, relay.port()).recv_timeout(wait) {
            Ok(Err(AgentHostError::Exited(_))) => {
                Err(AgentHostError::Exited(exit_code(&mut child)))
            }
            Ok(answer) => answer,
            Err(_) => Err(AgentHostError::TimedOut(wait)),
        };
        match answer {
            Ok((handshake, output)) => {
                relay.serve(stdin, output, handshake.token());
                Ok(Self {
                    child,
                    stdin: None,
                    relay: Some(relay),
                    secrets: None,
                    handshake,
                    named: Vec::new(),
                })
            }
            Err(error) => {
                kill(&mut child);
                Err(error)
            }
        }
    }

    /// Where the host serves and its token.
    pub fn handshake(&self) -> &Handshake {
        &self.handshake
    }

    /// True once the host has exited, or its relay or secrets channel
    /// stopped (it read nothing for too long, or the host broke the
    /// framing): nothing reaches the host then, so the shell starts a new one.
    pub fn has_exited(&mut self) -> bool {
        self.relay.as_ref().is_some_and(Relay::is_stopped)
            || self
                .secrets
                .as_ref()
                .is_some_and(LoopbackSecrets::is_stopped)
            || !matches!(self.child.try_wait(), Ok(None))
    }

    /// Closes the host's input and waits up to `grace` for it to exit on its
    /// own, closing its sessions first; kills it after that.
    pub fn stop(mut self, grace: Duration) -> Stopped {
        self.stop_within(grace)
    }

    fn stop_within(&mut self, grace: Duration) -> Stopped {
        drop(self.stdin.take());
        if let Some(relay) = self.relay.take() {
            relay.stop();
        }
        if let Some(secrets) = self.secrets.take() {
            secrets.stop();
        }
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            if self.has_exited() {
                return Stopped::Exited;
            }
            std::thread::sleep(EXIT_POLL);
        }
        if self.has_exited() {
            return Stopped::Exited;
        }
        kill(&mut self.child);
        Stopped::Killed
    }
}

impl Drop for AgentHost {
    fn drop(&mut self) {
        self.stop_within(DROP_GRACE);
    }
}

impl std::fmt::Debug for AgentHost {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AgentHost")
            .field("pid", &self.child.id())
            .field("handshake", &self.handshake)
            .finish_non_exhaustive()
    }
}

/// Reads and drops `output` on a thread of its own until the host closes
/// it, so a host that prints more never blocks on a full pipe.
fn drain(mut output: impl Read + Send + 'static) {
    std::thread::spawn(move || {
        let _ = std::io::copy(&mut output, &mut std::io::sink());
    });
}

/// The handshake of a host serving over its standard input and output, and
/// the rest of its output, which carries frames from there on.
type RelayedHandshake = Result<(Handshake, BufReader<ChildStdout>), AgentHostError>;

/// Reads lines of `output` on a thread of its own until one is the
/// handshake, skipping lines that aren't JSON.
fn read_relayed_handshake_line(
    output: ChildStdout,
    relay_port: u16,
) -> mpsc::Receiver<RelayedHandshake> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        let mut left = BEFORE_HANDSHAKE_LIMIT;
        let answer = loop {
            if left == 0 {
                break Err(handshake::refused(
                    "the host printed more than 64 KiB before it",
                ));
            }
            let mut line = Vec::new();
            let read = reader.by_ref().take(left).read_until(b'\n', &mut line);
            let length = match read {
                // The shell reads the exit code once the host has ended.
                Ok(0) | Err(_) => break Err(AgentHostError::Exited(None)),
                Ok(length) => length,
            };
            left -= length as u64;
            if !line.ends_with(b"\n") {
                break Err(handshake::refused(
                    "the host printed more than 64 KiB before it",
                ));
            }
            match handshake::read_relayed_handshake(&line, relay_port) {
                Ok(Some(handshake)) => break Ok(handshake),
                Ok(None) => {}
                Err(error) => break Err(error),
            }
        };
        // The shell may have stopped waiting; then the host is killed.
        let _ = sender.send(answer.map(|handshake| (handshake, reader)));
    });
    receiver
}

/// The exit code of a host that closed its output before its handshake,
/// once it has exited: `None` when a signal stopped it, or it still runs
/// after [`EXIT_CODE_WAIT`]. The caller kills it then.
fn exit_code(child: &mut Child) -> Option<i32> {
    let deadline = Instant::now() + EXIT_CODE_WAIT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.code(),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(EXIT_POLL),
            _ => return None,
        }
    }
}

fn kill(child: &mut Child) {
    // It may have exited already; either way it is waited for, so it
    // leaves no zombie behind.
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]
mod tests;
