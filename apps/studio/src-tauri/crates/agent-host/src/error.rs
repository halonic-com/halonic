//! Why the agent host couldn't be started, in terms the shell can report
//! without the host's own output (HAL-13408).

use std::time::Duration;

/// Windows' `ERROR_VIRUS_INFECTED` and `ERROR_VIRUS_DELETED`: an antivirus
/// program refused to run the file.
#[cfg(windows)]
const VIRUS_ERRORS: [i32; 2] = [225, 226];

/// Why the system wouldn't start the host's program, read from its error so
/// the shell can tell a broken install from a blocked one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartCause {
    /// The program, or something it needs, isn't there.
    Missing,
    /// The system refused to run it: a permission, or an antivirus program.
    Blocked,
    /// Any other reason.
    Other,
}

impl StartCause {
    /// The cause of `error`, the system's answer to starting a program.
    pub fn of(error: &std::io::Error) -> Self {
        #[cfg(windows)]
        {
            if error
                .raw_os_error()
                .is_some_and(|code| VIRUS_ERRORS.contains(&code))
            {
                return Self::Blocked;
            }
        }
        match error.kind() {
            std::io::ErrorKind::NotFound => Self::Missing,
            std::io::ErrorKind::PermissionDenied => Self::Blocked,
            _ => Self::Other,
        }
    }
}

/// Why the host couldn't be started. No message contains the token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentHostError {
    /// The program couldn't be started at all, and why the system said no.
    Start(StartCause, String),
    /// It ended, or closed its output, before printing a handshake. Holds
    /// its exit code, or `None` when it was stopped by a signal or didn't
    /// exit soon after.
    Exited(Option<i32>),
    /// It printed nothing within the time allowed.
    TimedOut(Duration),
    /// It printed a line that isn't a valid handshake.
    Handshake(String),
}

impl std::fmt::Display for AgentHostError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Start(_, message) | Self::Handshake(message) => formatter.write_str(message),
            Self::Exited(Some(code)) => write!(
                formatter,
                "The agent host stopped before it served, with exit code {code}."
            ),
            Self::Exited(None) => formatter.write_str("The agent host stopped before it served."),
            Self::TimedOut(wait) => write!(
                formatter,
                "The agent host didn't serve within {} s.",
                wait.as_secs_f32()
            ),
        }
    }
}

impl std::error::Error for AgentHostError {}
