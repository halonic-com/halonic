# Decision: Studio checks the sandbox helper's publisher before it starts it with runas

- Approval: HAL-14958 (Julian's security review of #4298 on HAL-14841)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gWVJSoRMLzJKtZBoB0FDWrUFiX3qmFVY0rr0QePArL3JNwEIwpUGL9Qc4kDP5mbnprziA86VIp5pMCAhiiQzCA==

`sandbox_elevate` (#4298) started the `halonic-sandbox-elevate.exe` beside the app with `runas` without checking who signed it. Studio installs per user, so any program of the user's can write to that folder and put another program in the helper's place. Windows' prompt would still name that program's publisher, but a person who has seen "Halonic" there before may not read it again.

**What the shell does now.** It opens the helper for reading, shared for reading and running only, before anything else. A signed release then reads the publisher through that open handle with the helper's own check (`WinVerifyTrust`, no revocation check, the certificate's display name, HAL-7385 S-4), moved unchanged into a small shared crate, `halonic-publisher`, so the helper and the shell can't read a publisher differently. The publisher it must match is the one built into the release (`HALONIC_SANDBOX_SIGNER`, which the release already sets for the whole app build). Any other publisher, no signature, or a signature Windows doesn't trust answers `failed` with the reason, and Windows isn't asked, so no prompt shows. Otherwise the shell starts the file at its real path (`GetFinalPathNameByHandleW`) and lets go of the handle once Windows has started it.

**The race between check and start.** While the handle is open, Windows refuses to write, rename or delete the file, and to rename a folder above it (the new Windows test proves all four on CI). Starting by the real path closes a junction in the app folder's path that could be pointed elsewhere after the check. What is left, accepted:

1. **A swap by an administrator or by the kernel**, for example a backup tool that ignores sharing. Anything with that power doesn't need the helper.
2. **Windows' own reading for the prompt.** Windows reads the file again by name to build the prompt and start the process, and we can't hand it our handle. With the file locked and the path free of links, that read reaches the file we checked.
3. **Dev and CI builds, and an unsigned release such as 0.1.0**, have no publisher built in, so they hold the file but check nothing; their prompt says "Unknown publisher" anyway. This matches the helper, which leaves no copy of itself in those builds.

**The installer (#4275) is not changed here.** #4275 is still a draft, so this pull request can't build on it without a stack. A publisher check from NSIS isn't cheap either: the 32-bit installer would need `WinVerifyTrust` and the certificate calls through `System::Call`, with their structures laid out by hand. The installer itself is signed and writes the helper from its own payload just before starting it, so its window is much smaller than Studio's. The cheap half, holding the file open with share-read only while it starts, goes into #4275 itself (HAL-14812).

The CI change runs the shell's new test that reads a real signed file's publisher through its handle in the step that already does so for the helper, and skips it in the `runas` step that has no signed file. Nothing is skipped or weakened.

## Covers

- .github/
