# Decision: say what failed in the New workspace dialog, and trust an empty folder

- Approval: Sofia's design check on HAL-9316 (section B3, B4 and the section C nit on trust); HAL-9384 asks for this on approved microcopy revision 96
- Kind: user-visible
- Task: HAL-9384

## What changes

`workspace.new-workspace-dialog`: a failed **Open it** says "Can't open *folder*: *reason*." and a
name problem shows under **Name**. With no parent folder the dialog shows the app's sentence under
Folder, and **Create** with a name says "Choose a folder." and focuses **Change…**.

`studio.new-workspace`: a refusal the shell doesn't name is shown as the shell gave it, not turned
into "you don't have permission". Creating into an existing *empty* folder is now trusted at once,
like a new folder, as the dialog's doc already said; a folder with files still opens untrusted.

## Why

A failed Open read like a write error, there was a dead end without a Documents folder, and a
workspace the user just made showed "Not trusted yet".

## Covers

- studio.new-workspace
- workspace.new-workspace-dialog
