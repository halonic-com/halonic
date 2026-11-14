# Decision: `harness-bridge.github-read` says how much of GitHub's answer is read and what a failing store shows

- Requirement: `harness-bridge.github-read` (`packages/adapters/harness-bridge/requirements/github-read.md`)
- Task: HAL-3104, follow-ups from the reviews of #2660
- Approval: Liam approves this change in his re-review on HAL-9330 (the comment of 14 Nov, 17:30 UTC)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5ARdt1iEEq+geD13eagwmc/aGN2gv8cwZNFAOPJ/tA0mE8tX/sIq/W/r1X9UPKbXl5TS1scEF3EbawHLl4cADw==

## What changes

The requirement grows; nothing it promised before is taken away.

- A secret store that fails now gives an error result with the store's own message. The `Secrets` port
  promises that no error from `get` holds the secret's value, so the message is safe to show.
- The bridge reads no more of GitHub's answer than the limit. A result over it is cut and says so; a JSON
  answer over it gives an error result, because a cut answer can't be read as JSON.
- Lists say `truncated` when the answer was cut.

## Why

The reviews of #2660 found that a large answer was read whole and that a failing store hid why. The first
fix capped JSON answers at the result limit, which broke ordinary pull requests: GitHub's raw answer for
48 files is about 147 KB, far above the trimmed result. JSON answers now have their own larger cap, so the
result limit still bounds what the model sees.

## Tests

No test was weakened. New tests cover a store that fails, a list cut by the limit, and 100 files with large
patches.

## Covers

- harness-bridge.github-read
