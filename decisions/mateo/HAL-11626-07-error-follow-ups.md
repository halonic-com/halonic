# Decision: Copy details confirms in place in a dialog, a failed sandbox check in the warning Callout, and one after-colon rule for plugins

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11626 (C446-1 and C446-2 of Noah's design check on HAL-14656; Liam's cleanup asked for on the task; Liam approves this note in review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JEIwwBNVRyN6sGlM7s3/GS9wsrSdGlwH1EOjQDZYgJDUcVubN3ltsDAAOLgSy3TQbtdmXdhXxBpQaf5fiTQ/DQ==

- `kit.callout-done-label` (new): a Callout action with a `doneLabel` reads it for 2 seconds once its promise settles with anything but `false`, and says it through the modal's polite region in a Dialog or FormSheet. The Remove trust dialog's **Copy details** uses it, so it reads **Copied** in place instead of a toast that waits until the dialog closes (C446-1). `workspace.trusted-sources`' test checks it; its text is unchanged.
- `settings.agent-sandbox-state`: a check that couldn't run because of an internal error puts "Couldn't check the sandbox: …" in the same warning Callout with **Copy details** that a failed setup or removal uses, instead of a plain line and a ghost button (C446-2). While a setup or removal Callout shows, the line stays under the chip with Copy details next to Check again.
- `plugins.plugin-trust-check`, `plugins.plugin-review`, `plugins.plugin-updates` and `plugins.plugin-trust-yes`: "Couldn't save trust: …" and "Couldn't update: …" read the host's reason with the shell's `reasonAfterColon`, as the plugin page's other lines already do, so a common first word is in lower case ("Couldn't save trust: the store is locked.") and a name keeps its capital ("Windows denied access"). The examples change to match.

The `engineReasonFor` and `isUnexplained` copies in the Workflows list and the Runs load failure now call the shell's helpers, with the same behaviour. No test was weakened: the tests gain cases for the in-place confirmation and the Callout, and the changed examples are the new lower-case reasons.

## Covers

- kit.callout-done-label
- workspace.trusted-sources
- settings.agent-sandbox-state
- plugins.plugin-trust-check
- plugins.plugin-review
- plugins.plugin-updates
- plugins.plugin-trust-yes
