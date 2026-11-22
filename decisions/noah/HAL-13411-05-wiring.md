# Decision: Check this computer says "system keychain" for an unreadable key, and the sandbox's kind for a ready sandbox

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16283
- Kind: user-visible

## What changes

Words check C691 (HAL-16270, rows 65 and 69) found two lines of `check-computer.lines` that don't match the screens around them. Nothing showed these lines before this pull request wires the dialog up.

- **Models, a key Halonic can't read:** "Anthropic: Halonic couldn't read its key from this computer's key store." becomes "Anthropic: Halonic couldn't read its key from your system keychain." with "Fix: check that your system keychain is unlocked, then check again." The Models page, where the person put the key, calls it "system keychain" ("Kept in your system keychain, never in files."), and the line had no step.
- **Sandbox, ready:** "Ready · Fenced by the system" (and "In a virtual machine", "On another computer", "No fence") becomes "Ready · Seatbelt" on macOS, "Ready · bubblewrap" on Linux and inside Halonic's WSL distro, and "Ready · Sandbox for Windows" for srt's Windows mode: the kind `halonic doctor` prints, as first-run-progress 4.2 approved ("Ready · Seatbelt (or bubblewrap)", "CLI doctor, as written"). "Fence" is a word no screen uses, and "Ready · No fence" said two opposite things. The agent host names the kind on its Sandbox line (`agent-host.doctor-sandbox-kind`, HAL-16290), because on Windows only the host knows whether it runs on Windows itself or in Halonic's WSL distro; when it names none, the line says only "Ready". "Sandbox for Windows" is the name Settings › Agent sandbox already gives srt's Windows mode, so a person meets one name.

The requirement gains two examples; none is removed. The test for the ready sandbox now expects "Ready" without a kind and "Ready · Seatbelt", "Ready · bubblewrap" and "Ready · Sandbox for Windows" with one; the two key tests expect the new sentence and its fix. No test is dropped or skipped.

`agent-host-client.doctor` also checks a ready Sandbox line's `sandboxKind` against the kinds the host names, as it checks the ids and actions, so the page never words a kind it doesn't know. The requirement gains that sentence and two examples; none is removed, and its tests only gain a kind and a case.

`studio.check-computer.source` (merged with #5294) gains one sentence: a ready Sandbox line keeps the kind of sandbox the agent host names on it, which only the host knows on Windows. That is what lets the line above say "Ready · Seatbelt". The requirement gains one example for it; none is removed, and its tests only gain a kind on the ready Sandbox line.

`tooling/check/policy.json` gains one `extraExports` entry, `./workspace` for `@halonicjs/adapter-doctor-node`, so Studio reads a workspace's providers and aliases with the same code as `halonic doctor` instead of a second copy that could drift (Liam's choice on HAL-13411, 22 Nov). That entry loads only `doctor-workspace.ts` and `workspace-problems.ts`, and nothing it loads imports `node:`, so it is safe in the webview. Nothing else in `policy.json` changes.

## Why

Team wording on an approved screen (first-run-progress 4.2 on HAL-7986, approved by the board on 19 Nov, HAL-7993), decided by the designer under HAL-2282: one word for where keys are kept, and the doctor's own words on the line the dialog promises are the doctor's.

## Covers

- agent-host-client.doctor
- check-computer.lines
- studio.check-computer.source
- tooling/check/policy.json
