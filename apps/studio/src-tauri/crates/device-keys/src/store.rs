use crate::computer::ComputerId;
use crate::error::DeviceKeyError;
use crate::key::DeviceKeyPair;

/// The port the phone keeps its key for each paired computer behind
/// (build plan decision 10). The phone transport makes the pair with
/// `snow` when it pairs, saves it here, and loads it for every reconnect.
///
/// The phone forgets a computer's key when the person forgets that
/// computer, and when the computer, having proved who it is, says the
/// phone isn't paired any more (Removed). A changed host key ("Can't
/// confirm your computer") forgets nothing (ADR, decision 16).
pub trait DeviceKeyStore: Send + Sync {
    /// The computer's key pair, or `None` when none is stored.
    /// [`DeviceKeyError::Unreadable`] when one is stored but can't be
    /// opened; it stays stored until it is replaced or forgotten.
    fn load(&self, computer: &ComputerId) -> Result<Option<DeviceKeyPair>, DeviceKeyError>;

    /// Stores the computer's key pair, replacing any pair already there.
    fn save(&self, computer: &ComputerId, pair: &DeviceKeyPair) -> Result<(), DeviceKeyError>;

    /// Removes the computer's key pair, and nothing else. Forgetting a
    /// computer with no key succeeds.
    fn forget(&self, computer: &ComputerId) -> Result<(), DeviceKeyError>;
}
