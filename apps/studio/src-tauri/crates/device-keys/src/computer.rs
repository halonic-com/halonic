use crate::error::DeviceKeyError;

/// The longest computer id, in characters.
pub const MAX_COMPUTER_ID_LENGTH: usize = 64;

/// Which paired computer a key belongs to: the id the phone keeps for it,
/// such as the base64url id of the computer's pinned key. 1 to 64 ASCII
/// letters, digits, `-` or `_`, so it is also a safe file name: no dot, no
/// slash, and nothing a file system folds into another name except case,
/// which ids the phone makes never differ by alone.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ComputerId(String);

impl ComputerId {
    /// Checks an id against the rule.
    pub fn parse(id: &str) -> Result<Self, DeviceKeyError> {
        let allowed = |character: char| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        };
        if id.is_empty() || id.len() > MAX_COMPUTER_ID_LENGTH || !id.chars().all(allowed) {
            return Err(DeviceKeyError::InvalidComputer);
        }
        Ok(Self(id.to_owned()))
    }

    /// The id as text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
