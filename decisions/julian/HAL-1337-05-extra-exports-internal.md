# Decision: a change to extraExports alone needs an internal note, not the user's

- Approval: Liam and Chief decided this on [HAL-3434](/HAL/issues/HAL-3434); the change is built in [HAL-1337](/HAL/issues/HAL-1337)
- Kind: user-visible

Registering a package's deliberate extra entry point in `extraExports` of `tooling/check/policy.json`
is routine, but `policy.json` sits under `tooling/check/`, so each one needed a board-signed note. Now a
change to `policy.json` that touches nothing but `extraExports` is its own path: the note lists
`tooling/check/policy.json`, and an `internal` note the CTO signs is enough. Any other change to
`policy.json`, or to another guard file in the same pull request, still counts as a change under
`tooling/check/` and needs a note for it, `user-visible` once a user key is pinned. `check.guard-own-paths` and `check.guard-notes-own-paths` say so, and
`check.guard-extra-exports` is new. This pull request changes the guard itself, so it needs the user's
approval in the form the board picks on HAL-3434.

## Covers

- tooling/check/
- check.guard-own-paths
- check.guard-notes-own-paths
