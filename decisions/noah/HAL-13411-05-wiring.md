# Decision: Check this computer says "system keychain" for an unreadable key, and the sandbox's kind for a ready sandbox

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16283
- Kind: user-visible

## What changes

Words check C691 (HAL-16270, rows 65 and 69) found two lines of `check-computer.lines` that don't match the screens around them. Nothing showed these lines before this pull request wires the dialog up.

- **Models, a key Halonic can't read:** "Anthropic: Halonic couldn't read its key from this computer's key store." becomes "Anthropic: Halonic couldn't read its key from your system keychain." with "Fix: check that your system keychain is unlocked, then check again." The Models page, where the person put the key, calls it "system keychain" ("Kept in your system keychain, never in files."), and the line had no step.
- **Sandbox, ready:** "Ready · Fenced by the system" (and "In a virtual machine", "On another computer", "No fence") becomes "Ready · Seatbelt" on macOS and "Ready · bubblewrap" on Linux, the kind `halonic doctor` prints, as first-run-progress 4.2 approved ("Ready · Seatbelt (or bubblewrap)", "CLI doctor, as written"). "Fence" is a word no screen uses, and "Ready · No fence" said two opposite things. On Windows the agent host runs on Windows itself or in Halonic's WSL distro, which the page can't tell apart, so the line says only "Ready" until the host names its own kind.

The requirement gains two examples; none is removed. The test for the ready sandbox now expects "Ready" without a kind and "Ready · Seatbelt" with one; the two key tests expect the new sentence and its fix. No test is dropped or skipped.

## Why

Team wording on an approved screen (first-run-progress 4.2 on HAL-7986, approved by the board on 19 Nov, HAL-7993), decided by the designer under HAL-2282: one word for where keys are kept, and the doctor's own words on the line the dialog promises are the doctor's.

## Covers

- check-computer.lines
