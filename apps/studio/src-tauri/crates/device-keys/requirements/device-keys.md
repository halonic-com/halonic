# studio.src-tauri.crates.device-keys.device-keys

- Status: draft
- Since: 0.1.0
- Source: HAL-12245, HAL-12232 (build plan decision 10)

The phone shall keep its X25519 key pair for each paired computer only sealed by a key that the platform's key store holds and never lets out (on Android an AES-256-GCM key in the Android Keystore, in StrongBox when the phone has one), in one file per computer in the app's private data, bound to that computer, so that no secret is in the clear at rest. When the phone saves a pair, then it shall replace the computer's pair whole. When the person forgets a computer, or the computer says after proving who it is that the phone isn't paired (Removed), then the phone shall delete that computer's pair and no other. If a stored pair doesn't open, because its file was changed or copied from another computer's or the platform key is gone or can't be used, then the phone shall report it as unreadable and keep it until it is replaced or forgotten. Only the shell shall seal or open a key; no page shall be granted the commands.

## Examples

- Given a pair saved for one computer,
  when its file is read,
  then it starts with `HDK1` and holds neither the private key nor the public key in the clear.
- Given a pair saved for `office`,
  when its file is copied to `laptop.key` and the phone loads `laptop`,
  then the result is unreadable.
- Given pairs saved for `office` and `laptop`,
  when the person forgets `office`,
  then `office` has no pair and `laptop` still loads its own.
- Given a pair saved for `office`,
  when the Keystore key that sealed it is gone or can't be used,
  then loading `office` is unreadable and the file stays.
- Given the connect page or the served Studio,
  when it calls `plugin:device-keys|sealDeviceKey` or `plugin:device-keys|openDeviceKey`,
  then the shell refuses it.
