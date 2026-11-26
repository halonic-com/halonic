//! Reads an owner server's answer to `GET /api/hello` before any password is
//! sent: `{"product": "halonic", "version", "minAppVersion", "mode",
//! "minStudioVersion", …}` (`packages/host/server`, HAL-13265).

use halonic_connect::{Version, read_hello};
use serde_json::Value;

use crate::answer::OwnerError;

/// This Studio's version and the oldest server it works with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StudioVersions {
    pub studio: Version,
    pub oldest_server: Version,
}

/// Checks the hello answer: Halonic, `mode: owner`, a `minStudioVersion` no
/// newer than this Studio, and a server no older than
/// [`StudioVersions::oldest_server`]. A server without `mode` or
/// `minStudioVersion` came before them, so it is too old.
pub fn check_owner_hello(
    status: u16,
    body: &str,
    versions: &StudioVersions,
) -> Result<(), OwnerError> {
    let hello = read_hello(status, body).map_err(|_| OwnerError::NotHalonic)?;
    let answer: Value = serde_json::from_str(body).map_err(|_| OwnerError::NotHalonic)?;
    let text = |name: &str| answer.get(name).and_then(Value::as_str);
    match text("mode") {
        Some("owner") => {}
        Some("many") => return Err(OwnerError::ManyUserServer),
        Some(_) => return Err(OwnerError::NotHalonic),
        None => return Err(OwnerError::ServerTooOld),
    }
    let Some(min_studio) = text("minStudioVersion").and_then(Version::parse) else {
        return Err(OwnerError::ServerTooOld);
    };
    if min_studio > versions.studio {
        return Err(OwnerError::StudioTooOld);
    }
    if hello.version < versions.oldest_server {
        return Err(OwnerError::ServerTooOld);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn versions() -> StudioVersions {
        let v = |text| Version::parse(text).expect("a test version");
        StudioVersions {
            studio: v("0.2.0"),
            oldest_server: v("0.2.0"),
        }
    }

    fn hello(version: &str, mode: &str, min_studio: &str) -> String {
        format!(
            r#"{{"product":"halonic","version":"{version}","minAppVersion":"0.1.0","runExecutorVersion":2,"mode":"{mode}","minStudioVersion":"{min_studio}"}}"#
        )
    }

    fn check(body: &str) -> Result<(), OwnerError> {
        check_owner_hello(200, body, &versions())
    }

    #[test]
    fn owner_sign_in_commands_accept_an_owner_server_that_fits() {
        assert_eq!(check(&hello("0.2.0", "owner", "0.1.0")), Ok(()));
        assert_eq!(check(&hello("0.3.0", "owner", "0.2.0")), Ok(()));
    }

    #[test]
    fn owner_sign_in_commands_refuse_a_many_user_server() {
        assert_eq!(
            check(&hello("0.2.0", "many", "0.1.0")),
            Err(OwnerError::ManyUserServer)
        );
    }

    #[test]
    fn owner_sign_in_commands_compare_both_versions() {
        assert_eq!(
            check(&hello("0.3.0", "owner", "0.3.0")),
            Err(OwnerError::StudioTooOld)
        );
        assert_eq!(
            check(&hello("0.1.0", "owner", "0.1.0")),
            Err(OwnerError::ServerTooOld)
        );
        let before_mode = r#"{"product":"halonic","version":"0.2.0","minAppVersion":"0.1.0"}"#;
        assert_eq!(check(before_mode), Err(OwnerError::ServerTooOld));
    }

    #[test]
    fn owner_sign_in_commands_refuse_what_isnt_halonic() {
        let good = hello("0.2.0", "owner", "0.1.0");
        assert_eq!(
            check_owner_hello(302, &good, &versions()),
            Err(OwnerError::NotHalonic)
        );
        assert_eq!(check("<html>router</html>"), Err(OwnerError::NotHalonic));
        assert_eq!(
            check(&hello("0.2.0", "someone", "0.1.0")),
            Err(OwnerError::NotHalonic)
        );
    }
}
