//! What the page learns: signed in, not signed in, or an error code. The page
//! owns the words.

use serde::Serialize;

/// Why a sign-in, sign-out or status call didn't end signed in or signed out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OwnerError {
    /// The origin isn't an address, or it has a path.
    NotAnAddress,
    /// The origin isn't `https://`. Checked before any lookup or call.
    NotHttps,
    /// Nothing answered in time, or the name resolves to nothing usable.
    NotAnswering,
    /// The server's certificate isn't valid for the address.
    InvalidCertificate,
    /// Something answered, but it isn't Halonic.
    NotHalonic,
    /// The server is a product's many-user server: Studio never signs in there.
    ManyUserServer,
    /// The server needs a newer Studio than this one.
    StudioTooOld,
    /// The server is older than this Studio works with.
    ServerTooOld,
    /// The server refused the password.
    WrongPassword,
    /// The server refused for now, after too many attempts.
    TooManyAttempts,
    /// The server answered the sign-in some other way.
    SignInFailed,
    /// The keychain couldn't keep, read or remove the session.
    Keychain,
}

/// One answer of the `owner_*` commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OwnerAnswer {
    SignedIn,
    NotSignedIn,
    Error { code: OwnerError },
}

impl From<OwnerError> for OwnerAnswer {
    fn from(code: OwnerError) -> Self {
        OwnerAnswer::Error { code }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn owner_sign_in_commands_answer_with_a_state_or_a_code_only() {
        let shape = |answer: OwnerAnswer| serde_json::to_value(answer).expect("serialisable");
        assert_eq!(shape(OwnerAnswer::SignedIn), json!({"kind": "signedIn"}));
        assert_eq!(
            shape(OwnerAnswer::NotSignedIn),
            json!({"kind": "notSignedIn"})
        );
        assert_eq!(
            shape(OwnerError::InvalidCertificate.into()),
            json!({"kind": "error", "code": "invalidCertificate"})
        );
        assert_eq!(
            shape(OwnerError::ManyUserServer.into()),
            json!({"kind": "error", "code": "manyUserServer"})
        );
    }
}
