# halonic-file-identity

What names a file or folder on this computer, whatever name reached it (`file_identity`): letter case, a short 8.3 name, a `\\?\` prefix or a link. A folder deleted and made again at the same path gets a new identity, so the trust grants can tell it from the folder the person picked (HAL-6637), and the sandbox helper can tell whether it runs from its own folder.

- **Unix and Android:** the device and the inode (`metadata`).
- **Windows:** the volume serial number and the file index, from `GetFileInformationByHandle` on a handle opened with no access and `FILE_FLAG_BACKUP_SEMANTICS`, so folders open too.

## Why this crate allows `unsafe`

The standard library can't read a Windows file index yet (`windows_by_handle` is unstable), and the workspace forbids `unsafe` code. Like `process-probe` (HAL-2719), this crate turns the lint off in its own `Cargo.toml`: the one `unsafe` block has a `// SAFETY:` comment (Clippy's `undocumented_unsafe_blocks` is denied here), and the API is one safe function. `windows-sys` is pinned to the version already in `Cargo.lock`, with only the features it calls turned on, so the crate adds no new code to the build.
