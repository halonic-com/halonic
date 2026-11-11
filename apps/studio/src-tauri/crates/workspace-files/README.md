# halonic-workspace-files

The workspace's files for the Studio shell's `fs_*` commands (HAL-5761), which the desktop `DefinitionStore` in `packages/adapters/fs-tauri` is built over (HAL-3335). It keeps the files as `FolderDefinitionStore` in `fs-node` does, so the desktop app and the CLI can work on one folder. It has no Tauri types; `src/files.rs` in the shell turns its calls into commands.

The page that calls the commands isn't trusted: the served Studio runs in it. So every rule is checked here, not only in TypeScript.

- **Paths:** `check_public_workspace_path` and the rest of `workspace_path.rs` port `checkPublicWorkspacePath`, `isPrivateWorkspacePath` and `segmentAsOpened` from `@halonicjs/ports`: no absolute path, `.`, `..`, empty segment, backslash or NUL; no `.git`, `.studio` or `.env*`, also as HFS+ or case folding would open them; no NTFS `:` stream or `~<digit>` short name.
- **Links:** `WorkspaceFolder` looks at every segment of a path without following links and refuses a symbolic link or a junction in any of them (`private_path`). `list` leaves links out with everything under them. A folder a write creates is looked at before anything goes into it.
- **Writes:** `write` holds a turn on the file (`WriteLocks`) while it compares the file with `expected` (`"absent"` or `content_digest`, as `matchesExpected` in `@halonicjs/std`) and writes. The text goes to `.halonic-write-<uuid>.tmp` next to the file, created new, flushed to disk and renamed over the file. `list` and the watch leave those files out, the CLI's too.
- **Watch:** `Watches` looks at the files' size and modified time about once a second (`FolderSnapshot`) and sends the paths that differ. The page reads them and compares digests, as `FolderWatch` in `fs-node` does. A native watcher (the `notify` crate) would need Liam's go-ahead, so polling comes first; with a very large workspace, each look reads every folder.

Known limits, the same as `fs-node`'s: a program outside Halonic can still change a file between the check and the rename, and the watch reports that change. A link swapped into a path by another program between the check and the use isn't caught; the page itself can't make links.

One dependency, `sha2` for the digest, already in the shell's `Cargo.lock` and pinned to that version, as in `trust-store` and `profile`.

`tests/workspace_paths_golden.rs` checks every case in `packages/core/ports/src/golden/workspace-paths.json`, the same file the TypeScript package's tests read. A change to the rules changes that file, and both sides must pass it. The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, the tests of `workspace-files` start with `workspace_files_` and those of `folder-poll` with `folder_poll_`. The link tests run on Unix, where CI can make links.
