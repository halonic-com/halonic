# Decision: carry the workspace's signal files into the plugin's snapshot and change list

- Approval: the task HAL-18365 asks for the plugin builder to put the workspace's signal files in the build snapshot and for the release file's change list to name the signals added, removed and changed (plan HAL-17450 rev 5, "Step 2", accepted by the board on 24 Nov); a trust-root change, so Liam signs this note in review
- Kind: user-visible

The plugin build service and `halonic build paperclip-plugin` pass the workspace's signal files to `makeSnapshot`, which already checks and sorts them, and the build refuses a signal file that isn't committed, as it does a tool file. The change list gains an optional `signals` entry with the ids `added`, `removed` and `changed` (each signal compared as canonical JSON), and the release file reads and writes it, refusing more than 50 ids in a list or anything that isn't a signal id; their requirements say so. A previous build's snapshot is read with its signals checked for ids only (unique, at most 50), so the previous-build requirement names that refusal. Without a signal change the field is left out, so a workspace without signal files gets the same snapshot, release file and checksum as before. Nothing is removed from any requirement: each gains a clause and examples.

## Covers

- plugin-build.change-list
- plugin-build.release-file
- plugin-build.previous-build
