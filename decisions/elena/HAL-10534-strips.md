# Decision: the Files host holds files that changed outside Halonic

- Approval: HAL-10832
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9vkhAStexm505g22/xjYML7337Q7cpmW5kWGJ0h6ILl7utcgwF1YaZ+s1mZe6+2xeGIC9hPLKqGH6rkTCJFtDQ==

## What changes

`studio.workspace-files-host`: the host now watches the folder, takes outside changes in through the
workspace's files, and holds a file with unsaved changes, marking it in the tree and offering both
texts for Compare. Before, outside changes were not marked ("not marked yet"). No example was removed
or weakened; four examples are added. This follows Liam's answer on HAL-10832: use the store's
existing watch, and build Compare from the approved flow and microcopy.

## Why

Without this, the app learned of an outside change only when a save failed.

## Covers

- studio.workspace-files-host
