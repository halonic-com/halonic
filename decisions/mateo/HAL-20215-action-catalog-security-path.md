# Decision: the action catalog is a security path for the Merger's sign-off gate

- Task: HAL-20215
- Approval: Liam approves this note in review on HAL-20215
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kDKNBshOnmveIabBqD7gRqB7inLJ7qCWbPcIHGc9/fTQbdlEfvCLX1RGjD1RetfnVqJ0CE2LPXSfH+cdIQ0dBQ==

## What changes

`paperclip.merge-control-security-signoff` adds `packages/core/action-catalog/` to the folders that make a pull request a security one, and gains an example for it. `securityFolders` in `tooling/paperclip/src/merge-control/security-signoff.ts` lists the folder. Nothing else in the rule changes; the `security` label trigger stays (the label now exists on the repo).

## Why

Since #6707 the action catalog sets the shell's compiled route list: which GitHub calls go out with the user's token, each call's risk (whether the native dialog shows) and the web origins. A change there needs Julian's security sign-off, and the gate didn't ask for it (Julian's finding on HAL-17518).

## Covers

- paperclip.merge-control-security-signoff
