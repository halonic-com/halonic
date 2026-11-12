# Decision: check:enqueue passes the pull request to the requirement guard

- Task: HAL-7185
- Approval: Liam approves this note in review on HAL-7185
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:W9RDlAXpuPpfUw+MGlKlo0lDn1fAwDEZACqH3TK5n5DCUds715AF44J4owW7USdJ5kM2ExiTbHWXYJCjImXTCQ==

## What changes

`pnpm check:enqueue` (`tooling/check/src/cli/enqueue.ts`) now looks up the branch's open pull request into `main` with one `gh pr view` call and passes its repo, number and head, with the fetched `origin/main` as the base, to the requirement guard (`--repo`, `--pr`, `--head-sha`, `--base-sha`), as CI does. The same call gives the title for the squash subject check, which used its own `gh` call before. Without a pull request, or without `gh`, the guard runs as before and says so. When the local branch isn't what GitHub has, it says the pushed head is checked.

## Why

Without the pull request the guard can't verify any signature, so a pull request whose decision note was already signed still failed locally with "approval isn't verified" (seen on #2041, HAL-6701). The guard itself doesn't change: it fails closed exactly as before.

## Cost

None. The `gh pr view` call was already made for the title.

## Tests

No test was skipped or weakened. `enqueue.ts` is a command line script without tests, as before; checked by running `pnpm check:enqueue` on this branch's pull request.

## Covers

- tooling/check/
