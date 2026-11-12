# Decision: a sandboxed program may start in a read-only folder

- Task: HAL-6884 (workspace `stdio` connectors start in the sandbox, HAL-2310 part 3, D45)
- Approval: option A, agreed with Mateo (`sandbox-srt` owner) on [HAL-6884](/HAL/issues/HAL-6884) with his four conditions; Liam approves this note in review
- Kind: internal

## What changes

`SandboxCommand.cwd` may now lie inside a path of the profile's `readOnlyPaths`, not only inside the working folder. Both requirements that said "inside the working folder" now point to the new `system-node.start-folder` check, which `sandbox-srt` and `sandbox-host` share:

- the start folder is checked where it really is, through symbolic links, and the program starts in that real folder;
- a path of `deniedPaths` still wins (unless that part is in `reopenedPaths`), and so do the session's own private folders (`sandbox-srt`'s settings and canary folder and the launcher's temp folder);
- any other folder is refused before anything starts, as before.

Writes still go only to the working and temp folders. Nothing that was refused before is allowed now, except a start in a read-only path.

## Why

A workspace connector must start where its script and `node_modules` are, while it writes only to its own fresh working folder (D45). Copying the script (option B) breaks relative imports; rewriting arguments (option C) means guessing which are paths. Mateo checked srt 0.0.81: it writes nothing in the start folder, so a read-only start folder works under Seatbelt, bubblewrap and on Windows, where `readOnlyPaths` already become read grants. srt's nested write denies (such as `sub/.claude/`) follow the start folder, so the port doc says to start outside the working folder only when that working folder is thrown away at close, as a connector's is.

## Tests

- `packages/adapters/system-node/src/start-folder.test.ts`: allowed and refused folders, links into a denied folder or out of every allowed path, folders that don't exist yet, reopened paths.
- `packages/adapters/sandbox-srt/src/srt-session-start-folder.test.ts`: start in a read-only path; refusal of a denied folder (also through a link), of the session's private folder and of the journal folder.
- `packages/adapters/sandbox-srt/fence/srt-fence.test.ts` and `srt-fence.windows.test.ts`: in the real fence, a program started in a read-only folder reads there and is refused a write there.
- `packages/adapters/sandbox-host/src/host-sandbox.test.ts`: start in a read-only path, refusal of a denied one.

No example or test was removed or weakened.

## Covers

- sandbox-host.start
- sandbox-srt.session
- .github/
