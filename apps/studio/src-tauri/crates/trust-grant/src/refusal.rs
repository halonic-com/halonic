use halonic_trust_store::TrustError;
use serde::Serialize;

/// Why a trust command was refused: a stable `kind`, one of
/// `trustRefusalKinds` in `packages/adapters/fs-tauri`, and a message for
/// the log. An `unreadable` refusal also names the record's location, when
/// the store can tell it, and its file. A `name_invalid` refusal also gives
/// the stable `reason` the name was refused for.
#[derive(Debug, Serialize)]
pub struct TrustRefusal {
    kind: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
}

impl TrustRefusal {
    /// A refusal of the given kind, with a message for the log.
    pub fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            location: None,
            file: None,
            reason: None,
        }
    }

    /// A refusal that also says why, in a stable word the page can turn
    /// into a sentence.
    pub fn because(kind: &'static str, reason: &'static str, message: impl Into<String>) -> Self {
        Self {
            reason: Some(reason),
            ..Self::new(kind, message)
        }
    }

    /// An `io` refusal: reading or writing the profile, or the shell
    /// itself, failed.
    pub fn io(error: impl std::fmt::Display) -> Self {
        TrustRefusal::new("io", error.to_string())
    }

    /// The refusal's kind, as the page reads it.
    pub fn kind(&self) -> &'static str {
        self.kind
    }

    /// The stable reason of a refusal that gives one.
    pub fn reason(&self) -> Option<&'static str> {
        self.reason
    }
}

impl From<TrustError> for TrustRefusal {
    fn from(error: TrustError) -> Self {
        let mut refusal = TrustRefusal::new(error.kind(), error.to_string());
        if let TrustError::Unreadable { location, file } = error {
            refusal.location = location;
            refusal.file = Some(file.display().to_string());
        }
        refusal
    }
}
