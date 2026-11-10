# halonic-profile

Finds the profile folder exactly as `profileFolder` in `@halonicjs/profile` does, so the Studio shell and the CLI share one profile (HAL-2612). The shell uses it to find the trust folder, `ProfileFolder::trust_folder`, where both keep their trust records. It doesn't use Tauri's own app data folder, which would differ from the CLI's.

- `profile_folder(&ProfileEnvironment)`: `HALONIC_HOME` when it is set, else `%LOCALAPPDATA%\halonic` on Windows, `<home>/Library/Application Support/halonic` on macOS, `$XDG_DATA_HOME/halonic` or `<home>/.local/share/halonic` on Linux. A relative `HALONIC_HOME` or home folder is refused; a relative `LOCALAPPDATA` or `XDG_DATA_HOME` is ignored; an empty variable counts as unset.
- Paths are plain text, joined the platform's way (`native_path.rs`, a port of `native-path.ts`), so they compare with the TypeScript answers character for character. No dependencies.

`tests/golden.rs` checks every case in `packages/core/profile/src/golden/profile-folders.json`, the same file the TypeScript package's tests read. A change to the rules changes that file, and both sides must pass it. The requirement is `profile.trust-folder` in `packages/core/profile/requirements`; these tests' names start with `trust_folder_`.
