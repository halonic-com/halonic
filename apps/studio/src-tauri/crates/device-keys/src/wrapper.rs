use crate::error::DeviceKeyError;

/// The platform half of [`crate::WrappedFileStore`]: it encrypts a key
/// pair with a key that the platform's key store holds and never lets out,
/// and decrypts it again. `context` names the computer the pair belongs
/// to; it isn't secret and isn't stored in the sealed bytes, but opening
/// must fail unless it is the context the bytes were sealed with, so a
/// sealed key copied to another computer's file can't be opened.
///
/// - **Android:** an AES-256-GCM key in the Android Keystore, in StrongBox
///   when the phone has one, with a fresh IV for each seal and `context` as
///   the additional data. The shell's `device_keys` module.
/// - **iOS** (later): a P-256 key in the Secure Enclave, with
///   `SecKeyCreateEncryptedData` and its ECIES AES-GCM algorithm, `context`
///   as the shared data. Only opening needs the Secure Enclave.
///
/// Every wrapper must pass [`crate::check_wrapper_contract`].
pub trait KeyWrapper: Send + Sync {
    /// Encrypts `plain` for `context`. Sealing the same bytes twice gives
    /// different sealed bytes.
    fn seal(&self, plain: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError>;

    /// Decrypts bytes that [`Self::seal`] made for the same `context`.
    /// [`DeviceKeyError::Unreadable`] when they were changed, were sealed
    /// for another context, or the platform key that sealed them is gone or
    /// can't be used.
    fn open(&self, sealed: &[u8], context: &[u8]) -> Result<Vec<u8>, DeviceKeyError>;
}
