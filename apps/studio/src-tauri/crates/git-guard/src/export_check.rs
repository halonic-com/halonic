//! What an export takes (requirement `git-export`): an address and a
//! reference git can't read as anything else, and what git said without
//! the address.

use crate::error::GitError;

/// A full commit id: 40 hex digits, or 64 with SHA-256.
pub(crate) fn is_full_commit_id(text: &str) -> bool {
    matches!(text.len(), 40 | 64)
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// A branch, tag or commit name a caller may give: no option, no revision
/// syntax, nothing git would read as a range or a path.
pub(crate) fn is_plain_reference(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '/' | '-'))
        && !name.contains("..")
        && !name.contains("//")
        && !name.ends_with(['.', '/'])
}

/// Refuses a reference that isn't a plain branch, tag or commit id.
pub(crate) fn check_reference(reference: &str) -> Result<(), GitError> {
    if reference == "HEAD" || is_plain_reference(reference) {
        Ok(())
    } else {
        Err(GitError::ReferenceNotAllowed)
    }
}

fn refused_address(reason: &'static str) -> GitError {
    GitError::AddressNotAllowed { reason }
}

/// Refuses an address that is not an `https://` or `ssh://` one, that
/// starts with `-` (git would read it as an option), that names a
/// transport such as `ext::` or a local path, or that carries a password.
/// The reason never repeats the address, which may hold a secret.
pub(crate) fn check_address(address: &str) -> Result<(), GitError> {
    if address.starts_with('-') {
        return Err(refused_address(
            "it starts with -, which git reads as an option",
        ));
    }
    if address
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || c == '\\')
    {
        return Err(refused_address(
            "it has a space, a control character or a backslash in it",
        ));
    }
    let Some((scheme, rest)) = address.split_once("://") else {
        return Err(refused_address(
            "only https:// and ssh:// addresses are allowed",
        ));
    };
    if !scheme.eq_ignore_ascii_case("https") && !scheme.eq_ignore_ascii_case("ssh") {
        return Err(refused_address(
            "only https:// and ssh:// addresses are allowed",
        ));
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    // A percent escape could spell a user or host git reads otherwise.
    if authority.contains('%') {
        return Err(refused_address("its host or user has a % escape in it"));
    }
    let (user, host_and_port) = match authority.rfind('@') {
        Some(at) => (Some(&authority[..at]), &authority[at + 1..]),
        None => (None, authority),
    };
    if let Some(user) = user {
        if user.contains(':') {
            return Err(refused_address(
                "it has a password in it; use a key or a token instead",
            ));
        }
        if user.starts_with('-') {
            return Err(refused_address(
                "its user starts with -, which ssh reads as an option",
            ));
        }
    }
    let host = if host_and_port.starts_with('[') {
        host_and_port
            .find(']')
            .map_or("", |end| &host_and_port[..=end])
    } else {
        host_and_port.split(':').next().unwrap_or_default()
    };
    if host.is_empty() || host.starts_with('-') {
        return Err(refused_address("its host is not valid"));
    }
    Ok(())
}

/// What git said, trimmed and without the address, or the user part of it,
/// which may be a token: git echoes the address in many of its errors.
pub(crate) fn redact(message: &str, address: &str) -> String {
    let mut message = message.trim().to_owned();
    message = message.replace(address, "the address");
    let authority = address.split_once("://").map_or("", |(_, rest)| {
        rest.split(['/', '?', '#']).next().unwrap_or_default()
    });
    if let Some((user, _)) = authority.rsplit_once('@')
        // `git@` is the name of the account, not a secret, and would
        // be replaced in every word that holds it.
        && user != "git"
        && !user.is_empty()
    {
        message = message.replace(user, "the user");
    }
    message
}

#[cfg(test)]
#[path = "export_check_tests.rs"]
mod tests;
