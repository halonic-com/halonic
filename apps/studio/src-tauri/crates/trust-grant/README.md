# halonic-trust-grant

Which folder a trust grant may open in the Studio shell, and the question the shell asks first (HAL-2612, plan approved by Liam on HAL-2652). Plain Rust with no Tauri types; the shell's `pick_folder` and `trust_*` commands wire it to the profile, the opened folders and the native dialogs.

- **Only the person opens a folder.** `TrustState::pick` opens the folder picked in the dialog. `TrustState::grant` saves a record and opens its folder only when it is inside a picked folder, or when the person says yes to the question. A folder a grant opened doesn't count as picked.
- **Locations must already be canonical,** in the plain form the CLI keys its records by (`plain_path` in `halonic-git-guard`: no `\\?\` prefix on Windows). Anything else, such as `..`, a link or a trailing separator, is refused as `invalid_record` and never rewritten, so the record's key and the opened folder are the same path and a revoke closes what the grant opened. Picked folders are compared by path part, so `work-evil` isn't inside `work`.
- **One dialog at a time.** A grant or a pick that would show a second dialog is refused as `busy`.
- **Revoking closes the folder** before deleting the record, so git refuses it at once.
- **The question** (wording decided with Sofia on HAL-2653) shows the canonical path with control and text-direction characters written out as `\u{…}`, and a long path shortened in the middle.

`TrustRefusal` serialises to the shape `isTrustRefusal` in `packages/adapters/fs-tauri` reads. The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `trust_grants_`.
