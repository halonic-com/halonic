# studio.src-tauri.crates.keychain.desktop-keychain

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508

When the shell runs on macOS, Windows or Linux, it shall keep each secret in the platform's keychain (the macOS Keychain, the Windows Credential Manager or the Secret Service) as one entry under the service `halonic` and the secret's canonical name, and shall never keep it in an in-memory store. If the shell runs on any other target, then every keychain call shall fail as `unavailable`. If a stored value can't be read as text, then the shell shall delete it and report `unreadable`. No error shall hold a value.

## Examples

- Given the name `Acme-Key` on Linux,
  when its keychain entry is made,
  then the entry is a Secret Service item with service `halonic` and user `acme_key`.
- Given any desktop build,
  when a keychain entry is made,
  then it is the platform's credential type, not keyring's mock.
- Given the Windows Credential Manager,
  when `secret_set` stores 1,281 bytes,
  then the result is `invalid_value`.
- Given keyring reports a value that isn't UTF-8,
  when the error is turned into a kind,
  then it is `unreadable` and its message doesn't hold the bytes.
