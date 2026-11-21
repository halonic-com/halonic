# halonic-publisher

Who signed a file, as Windows' administrator prompt shows the publisher, and the publisher a signed release is built for (`SIGNER`, from `HALONIC_SANDBOX_SIGNER`, HAL-1197). The sandbox helper checks the copy of itself it leaves for Installed apps with it (HAL-7385, S-4), and the Studio shell checks the helper with it before it starts it with `runas` (HAL-14958). One check, so the two never read a publisher differently.

- **`signer(path)`:** `WinVerifyTrust` with `WINTRUST_ACTION_GENERIC_VERIFY_V2`, no UI and no revocation check (an elevated process shouldn't go online, and a check without a network can hang). The chain must still lead to a root Windows trusts for code signing. When Windows trusts it, the signing certificate's simple display name (`CertGetNameStringW`), which is the publisher the UAC prompt shows; `None` otherwise.
- **`signer_of_open(path, file)`:** the same, with Windows reading the bytes through the open `file` instead of by the name, so what is checked is what that handle holds, even if something else has the name by then.
- **`SIGNER`:** the publisher built in. Dev and CI builds and an unsigned release have none.

## Why this crate allows `unsafe`

`WinVerifyTrust` and the certificate calls have no safe wrapper in the standard library, and the workspace forbids `unsafe` code. As in `sandbox-elevate`, where this code came from, the crate turns the lint off in its own `Cargo.toml`; every `unsafe` block has a `// SAFETY:` comment (`undocumented_unsafe_blocks` is denied), and the API is two safe functions. `windows-sys` is pinned to the version already in `Cargo.lock`, with only the features it calls turned on.

Its real-Windows test runs in the helper's (`sandbox-elevate/tests/windows.rs`) and the shell's (`elevate-start`) tests, which CI runs against PowerShell's own signed program.
