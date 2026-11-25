---
"@halonicjs/app-studio": patch
---

`halonic build paperclip-plugin` now writes the snapshot's SHA-256 into the release file as `snapshotSha256` and prints it as Snapshot SHA-256, so you can fill in the plugin's Pinned snapshot SHA-256 setting without unpacking the plugin file.
