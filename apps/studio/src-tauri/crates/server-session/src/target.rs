//! The user's server and the task id, checked as `validateServerTarget` and
//! `serverSessionTaskPattern` in `packages/core/action-steppers` check them,
//! against the same shared cases. The shell repeats the check because it
//! trusts nothing from the page.

use serde_json::Value;

/// The longest host name, as in DNS.
const MAX_HOST_LENGTH: usize = 253;

/// The longest label of a host name, as in DNS.
const MAX_LABEL_LENGTH: usize = 63;

/// The longest user name after its first character.
const MAX_USER_TAIL: usize = 31;

/// The most digits after `HAL-`.
const MAX_TASK_DIGITS: usize = 7;

/// The user's own server, read by the shell from the profile's settings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerTarget {
    host: String,
    user: String,
    port: Option<u16>,
}

impl ServerTarget {
    /// The host: a DNS name, an ssh alias or an IPv4 address.
    pub fn host(&self) -> &str {
        &self.host
    }

    /// The user name on the server.
    pub fn user(&self) -> &str {
        &self.user
    }

    /// The ssh port, when it isn't 22.
    pub fn port(&self) -> Option<u16> {
        self.port
    }
}

/// Why the settings are refused. The reason never repeats the value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetRefusal {
    /// The host isn't a host name, an ssh alias or an IPv4 address.
    Host,
    /// The user isn't a lower-case user name.
    User,
    /// The port isn't a whole number from 1 to 65535.
    Port,
}

impl TargetRefusal {
    /// The reason, in the words `validateServerTarget` uses.
    pub fn reason(self) -> &'static str {
        match self {
            Self::Host => "the server must be a host name, an ssh alias or an IPv4 address",
            Self::User => "the user must be a lower-case user name, such as ops",
            Self::Port => "the port must be a whole number from 1 to 65535",
        }
    }
}

/// One label of a host: a letter or digit, then letters, digits and `-`.
fn is_host_label(label: &str) -> bool {
    let mut characters = label.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    label.len() <= MAX_LABEL_LENGTH
        && first.is_ascii_alphanumeric()
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '-')
}

/// Whether `host` can be a host: labels joined by `.`, so it never starts
/// with `-` and never holds `@`, `:`, a space or a shell character.
pub fn is_host(host: &str) -> bool {
    host.len() <= MAX_HOST_LENGTH && host.split('.').all(is_host_label)
}

/// Whether `user` matches `^[a-z_][a-z0-9_-]{0,31}$`.
pub fn is_user(user: &str) -> bool {
    let mut characters = user.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    let tail = || characters.clone();
    (first.is_ascii_lowercase() || first == '_')
        && tail().count() <= MAX_USER_TAIL
        && tail().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '_'
                || character == '-'
        })
}

/// Whether `task` matches `^HAL-[0-9]{1,7}$`, so it can name files on both
/// computers and never holds a path or a shell character.
pub fn is_task_id(task: &str) -> bool {
    task.strip_prefix("HAL-").is_some_and(|digits| {
        (1..=MAX_TASK_DIGITS).contains(&digits.len())
            && digits.bytes().all(|byte| byte.is_ascii_digit())
    })
}

/// A port: absent, `null`, or a JSON whole number from 1 to 65535.
fn check_port(port: Option<&Value>) -> Result<Option<u16>, TargetRefusal> {
    match port {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_u64()
            .and_then(|number| u16::try_from(number).ok())
            .filter(|number| *number >= 1)
            .map(Some)
            .ok_or(TargetRefusal::Port),
    }
}

/// Checks the saved settings before anything is built from them.
///
/// # Errors
///
/// Which setting is refused: the host, the user or the port, in that order.
pub fn validate_target(
    host: Option<&Value>,
    user: Option<&Value>,
    port: Option<&Value>,
) -> Result<ServerTarget, TargetRefusal> {
    let host = host
        .and_then(Value::as_str)
        .filter(|host| is_host(host))
        .ok_or(TargetRefusal::Host)?;
    let user = user
        .and_then(Value::as_str)
        .filter(|user| is_user(user))
        .ok_or(TargetRefusal::User)?;
    let port = check_port(port)?;
    Ok(ServerTarget {
        host: host.to_owned(),
        user: user.to_owned(),
        port,
    })
}
