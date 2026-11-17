# Decision: a stored key can carry the origins it may go to

- Approval: plan (a) of step B was approved on HAL-11874 (Paperclip task); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-11871

## What changes

`secrets-file.store` lets a stored key carry a list of allowed origins (one to eight), saved in the same secrets-file entry as the key. `cli.workspace-provider-key-trust` gains one shared check before each keyed model call: a key with a list goes only to an origin on it, and any other origin is refused with `key-origin-not-allowed`, naming the provider and origin but never the key or a path. Nothing was removed or weakened: a listed origin that isn't the provider type's own still needs a trusted workspace, and a key without a list keeps step A's rules unchanged.

## Why

Step A trusts a workspace as a whole. A key that is meant for one provider should not be sendable to another address by a workspace setting, so the key itself records where it may go (design on HAL-11343, step B).

## Decided by the team

- A damaged or unreadable secrets file fails the call, and an empty list is never returned, so neither falls back to the weaker rule.
- A keyed call now fails with the secrets file's own error when that file is damaged or readable by others, even for a key from an environment variable. This is the fail-closed behaviour and a small change from before.

## Covers

- cli.workspace-provider-key-trust
- secrets-file.store
