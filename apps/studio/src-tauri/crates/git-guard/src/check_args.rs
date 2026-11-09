use crate::allow_list::{
    AllowedOption, AllowedSubcommand, Arguments, DIFF_OPTIONS, ValueRule, find_subcommand,
};
use crate::error::GitError;

/// A git call whose arguments passed the allow-list.
#[derive(Debug)]
pub struct CheckedCall {
    subcommand: &'static AllowedSubcommand,
    args: Vec<String>,
}

impl CheckedCall {
    /// The subcommand, the first argument.
    pub fn subcommand(&self) -> &'static str {
        self.subcommand.name
    }

    /// All the arguments, the subcommand first.
    pub fn args(&self) -> &[String] {
        &self.args
    }

    /// Whether the call talks to another machine (`pull`, `push`), so it
    /// gets the longer time limit.
    pub fn uses_network(&self) -> bool {
        self.subcommand.uses_network
    }

    /// Whether the call shows diffs (`diff`, `log`), so it gets
    /// `--no-ext-diff` and `--no-textconv`.
    pub fn shows_diffs(&self) -> bool {
        self.subcommand.shows_diffs
    }
}

/// Checks a git call against the allow-list (requirement `git-allow-list`).
///
/// The first argument must be an allowed subcommand, so no global option
/// such as `-c` or `--git-dir` can come first. Every option must match an
/// entry on that subcommand's list exactly: git accepts shortened long
/// options (`--upload-pac` for `--upload-pack`), so anything else is
/// refused. After `--`, every argument is a path. Revisions and paths, on
/// either side of `--`, must stay inside the repository.
pub fn check_args(args: &[String]) -> Result<CheckedCall, GitError> {
    let Some((first, rest)) = args.split_first() else {
        return Err(GitError::NoSubcommand);
    };
    let Some(subcommand) = find_subcommand(first) else {
        return Err(GitError::SubcommandNotAllowed {
            subcommand: first.clone(),
        });
    };
    let mut arguments = Vec::new();
    let mut only_paths = false;
    let mut remaining = rest.iter();
    while let Some(arg) = remaining.next() {
        if only_paths {
            arguments.push(arg.as_str());
            continue;
        }
        if arg == "--" {
            if subcommand.arguments != Arguments::RevisionsAndPaths {
                return Err(argument_not_allowed(subcommand, arg));
            }
            only_paths = true;
            continue;
        }
        if arg.starts_with('-') {
            check_option(subcommand, arg, &mut remaining)?;
            continue;
        }
        arguments.push(arg.as_str());
    }
    check_arguments(subcommand, &arguments)?;
    Ok(CheckedCall {
        subcommand,
        args: args.to_vec(),
    })
}

fn check_option<'a>(
    subcommand: &'static AllowedSubcommand,
    arg: &str,
    remaining: &mut impl Iterator<Item = &'a String>,
) -> Result<(), GitError> {
    let options = subcommand.options.iter().chain(if subcommand.shows_diffs {
        DIFF_OPTIONS
    } else {
        &[]
    });
    let (name, joined_value) = match arg.split_once('=') {
        Some((name, value)) if arg.starts_with("--") => (name, Some(value)),
        _ => (arg, None),
    };
    for option in options {
        match (option, joined_value) {
            (AllowedOption::Flag(flag), None) if *flag == name => return Ok(()),
            (AllowedOption::Joined(option_name, rule), Some(value)) if *option_name == name => {
                return check_value(subcommand, name, *rule, value);
            }
            (AllowedOption::Separate(option_name, rule), None) if *option_name == name => {
                let Some(value) = remaining.next() else {
                    return Err(GitError::MissingValue {
                        subcommand: subcommand.name.to_owned(),
                        option: name.to_owned(),
                    });
                };
                return check_value(subcommand, name, *rule, value);
            }
            _ => {}
        }
    }
    Err(GitError::OptionNotAllowed {
        subcommand: subcommand.name.to_owned(),
        option: name.to_owned(),
    })
}

fn check_value(
    subcommand: &AllowedSubcommand,
    option: &str,
    rule: ValueRule,
    value: &str,
) -> Result<(), GitError> {
    let allowed = match rule {
        ValueRule::Text => true,
        ValueRule::Number => !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()),
        ValueRule::OneOf(words) => words.contains(&value),
        ValueRule::BranchName => is_branch_name(value),
    };
    if allowed {
        return Ok(());
    }
    Err(GitError::ValueNotAllowed {
        subcommand: subcommand.name.to_owned(),
        option: option.to_owned(),
    })
}

fn check_arguments(subcommand: &AllowedSubcommand, arguments: &[&str]) -> Result<(), GitError> {
    match subcommand.arguments {
        Arguments::RevisionsAndPaths => {
            match arguments
                .iter()
                .find(|argument| !is_inside_repository(argument))
            {
                Some(argument) => Err(argument_not_allowed(subcommand, argument)),
                None => Ok(()),
            }
        }
        Arguments::None => match arguments.first() {
            Some(argument) => Err(argument_not_allowed(subcommand, argument)),
            None => Ok(()),
        },
        Arguments::RemoteAndRefs => check_remote_and_refs(subcommand, arguments),
        Arguments::RemoteCommand => check_remote(subcommand, arguments),
    }
}

/// `pull` and `push`: an optional remote name, then refspecs. A URL in
/// place of the remote name would skip the remote's checked URL, so names
/// only.
fn check_remote_and_refs(
    subcommand: &AllowedSubcommand,
    arguments: &[&str],
) -> Result<(), GitError> {
    let Some((remote, refspecs)) = arguments.split_first() else {
        return Ok(());
    };
    if !is_remote_name(remote) {
        return Err(argument_not_allowed(subcommand, remote));
    }
    match refspecs.iter().find(|refspec| !is_refspec(refspec)) {
        Some(refspec) => Err(argument_not_allowed(subcommand, refspec)),
        None => Ok(()),
    }
}

/// `remote`: list, or one of its forms with names and, for `add` and
/// `set-url`, one URL. This is the only place a URL may enter.
fn check_remote(subcommand: &AllowedSubcommand, arguments: &[&str]) -> Result<(), GitError> {
    let shape_is_allowed = match arguments {
        [] => true,
        ["add" | "set-url", name, url] => is_remote_name(name) && is_remote_url(url),
        ["remove" | "get-url", name] => is_remote_name(name),
        ["rename", old_name, new_name] => is_remote_name(old_name) && is_remote_name(new_name),
        _ => false,
    };
    if shape_is_allowed {
        return Ok(());
    }
    Err(argument_not_allowed(subcommand, &arguments.join(" ")))
}

fn argument_not_allowed(subcommand: &AllowedSubcommand, argument: &str) -> GitError {
    GitError::ArgumentNotAllowed {
        subcommand: subcommand.name.to_owned(),
        argument: argument.to_owned(),
    }
}

/// Stricter than git's own rules, which it then also applies.
fn is_branch_name(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with(['-', '.', '/'])
        && !value.contains("..")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._/-".contains(&byte))
}

/// A revision or path that cannot reach outside the repository. `diff`
/// switches to `--no-index` by itself when a path lies outside, which would
/// print any file on the machine, so absolute paths (`/`, `\`, `C:`,
/// `\\server`) and `..` components are refused.
fn is_inside_repository(value: &str) -> bool {
    let has_drive = matches!(value.as_bytes(), [letter, b':', ..] if letter.is_ascii_alphabetic());
    !value.starts_with(['/', '\\'])
        && !has_drive
        && !value.split(['/', '\\']).any(|component| component == "..")
}

/// A leading `.` is refused because git reads `.`, `..` and `.git` as local
/// paths, not remote names.
fn is_remote_name(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with(['-', '.'])
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

/// A refspec such as `main`, `HEAD:main` or `+feature:feature`. The
/// characters exclude `\` and whitespace, and `::` and `://` are refused, so
/// it can never be read as a URL.
fn is_refspec(value: &str) -> bool {
    let name = value.strip_prefix('+').unwrap_or(value);
    !name.is_empty()
        && !name.starts_with('-')
        && !name.contains("::")
        && !name.contains("//")
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._/-:^~@{}".contains(&byte))
}

/// Only `https://`, `ssh://` and the short ssh form `user@host:path`. That
/// rules out `ext::`, `file://`, local paths and other transports before git
/// sees them; `protocol.allow` refuses them again when git connects.
fn is_remote_url(value: &str) -> bool {
    let has_no_odd_characters = !value.is_empty()
        && !value.starts_with('-')
        && !value.contains("::")
        && value.bytes().all(|byte| byte.is_ascii_graphic());
    if !has_no_odd_characters {
        return false;
    }
    for scheme in ["https://", "ssh://"] {
        if let Some(rest) = value.strip_prefix(scheme) {
            return is_authority(rest.split('/').next().unwrap_or_default());
        }
    }
    is_short_ssh_url(value)
}

/// The `user@host:port` part of a URL. ssh reads a host or user that starts
/// with `-` as an option (`-oProxyCommand=`), so that is refused. git decodes
/// `%2D` to `-` before it hands the host to ssh, so `%` is refused as well.
fn is_authority(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('%')
        && value
            .split('@')
            .all(|part| !part.is_empty() && !part.starts_with('-'))
}

fn is_short_ssh_url(value: &str) -> bool {
    let Some((user_and_host, path)) = value.split_once(':') else {
        return false;
    };
    let Some((user, host)) = user_and_host.split_once('@') else {
        return false;
    };
    let is_plain = |part: &str| {
        !part.is_empty()
            && !part.starts_with('-')
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    };
    is_plain(user) && is_plain(host) && !path.is_empty() && !path.contains("//")
}

#[cfg(test)]
#[path = "check_args_tests.rs"]
mod tests;
