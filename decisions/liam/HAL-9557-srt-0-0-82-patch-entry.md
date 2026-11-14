# Decision: allow the Halonic patch for sandbox-runtime 0.0.82

- Approval: HAL-9557. Liam approves this note as the reviewer of the sandbox-runtime move.
- Kind: internal
- Task: HAL-9557

## What changes

- `patches-allowed.json` gets an entry for `@anthropic-ai/sandbox-runtime@0.0.82`, with the file `patches/@anthropic-ai__sandbox-runtime@0.0.82.patch` and its SHA-256.
- The patch is the 0.0.81 patch cut again for 0.0.82: the same changes (`denyMachLookup` on macOS and the Windows loopback probe), with new line offsets. The reason and `remove-when` stay the same.
- The 0.0.81 entry stays until the pull request that moves the pin removes it.

## Why

CI reads the allowed patches from the base commit, so the entry has to merge before the pull request that moves the pin to 0.0.82 (docs/guides/dependencies.md). Until then the entry has no patch, which the check reports only as a warning.

## Covers

- tooling/check/
