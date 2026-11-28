//! The only calls the Paperclip admin key may make (architecture note on
//! HAL-17491, row C1; plan OK on HAL-21110). Paperclip has no route that sets
//! a secret in one call, so `paperclip.set-secret` is an operation written
//! here in the shell, not a route from the catalog. Every call it makes is
//! one of [`PaperclipCall`], and [`is_allowed`] checks the call once more
//! just before it is sent: no call lists secret values, reads one secret,
//! deletes one, or rotates a secret other than the one the lookup found.

use url::Url;

/// One call the admin key may make, for one company.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaperclipCall {
    /// `GET /api/cli-auth/me`: which companies the key reaches.
    WhoAmI,
    /// `GET /api/companies/{company}`: the company's prefix, to match the
    /// one the preview showed.
    Company,
    /// `GET /api/companies/{company}/secrets/catalog`: each secret's id,
    /// name, key and status, never a value.
    Catalog,
    /// `POST /api/companies/{company}/secrets`: a new secret with its value.
    Create,
    /// `POST /api/secrets/{secret}/rotate`: a new value for the secret the
    /// catalog lookup found.
    Rotate { secret: String },
}

impl PaperclipCall {
    /// The call's method.
    pub fn method(&self) -> &'static str {
        match self {
            Self::WhoAmI | Self::Company | Self::Catalog => "GET",
            Self::Create | Self::Rotate { .. } => "POST",
        }
    }

    /// The call's path for `company`, whose id [`is_paperclip_id`] has
    /// checked, as the rotated secret's id is.
    pub fn path(&self, company: &str) -> String {
        match self {
            Self::WhoAmI => "/api/cli-auth/me".to_owned(),
            Self::Company => format!("/api/companies/{company}"),
            Self::Catalog => format!("/api/companies/{company}/secrets/catalog"),
            Self::Create => format!("/api/companies/{company}/secrets"),
            Self::Rotate { secret } => format!("/api/secrets/{secret}/rotate"),
        }
    }

    /// The call's address on `origin`.
    pub fn address(&self, origin: &str, company: &str) -> Option<Url> {
        Url::parse(origin).ok()?.join(&self.path(company)).ok()
    }
}

/// Whether `method` and `path` are one of the admin key's calls for
/// `company`, where a rotate may only name `rotating`, the secret the
/// catalog lookup found. Anything else, a list or read of secrets, a delete,
/// a query, or a rotate of another secret, is refused.
pub fn is_allowed(method: &str, path: &str, company: &str, rotating: Option<&str>) -> bool {
    let mut allowed = vec![
        PaperclipCall::WhoAmI,
        PaperclipCall::Company,
        PaperclipCall::Catalog,
        PaperclipCall::Create,
    ];
    if let Some(secret) = rotating {
        allowed.push(PaperclipCall::Rotate {
            secret: secret.to_owned(),
        });
    }
    is_paperclip_id(company)
        && rotating.is_none_or(is_paperclip_id)
        && allowed
            .iter()
            .any(|call| call.method() == method && call.path(company) == path)
}

/// Whether `text` can be a Paperclip id in a path: letters, digits and `-`,
/// at most 64 characters.
pub fn is_paperclip_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// A JSON object of text fields, written into one buffer sized so it never
/// grows: a value such as a secret leaves no other copy in this crate. The
/// outgoing call wipes the buffer once it is sent.
pub(crate) fn json_body(fields: &[(&str, &str)]) -> Vec<u8> {
    // A character takes at most 6 bytes in JSON (`\u001f`).
    let room: usize = fields
        .iter()
        .map(|(name, value)| 6 * (name.len() + value.len()) + 8)
        .sum();
    let mut out = Vec::with_capacity(room + 2);
    out.push(b'{');
    for (index, (name, value)) in fields.iter().enumerate() {
        if index > 0 {
            out.push(b',');
        }
        // Writing a `&str` into a `Vec` can't fail.
        let _ = serde_json::to_writer(&mut out, name);
        out.push(b':');
        let _ = serde_json::to_writer(&mut out, value);
    }
    out.push(b'}');
    out
}
