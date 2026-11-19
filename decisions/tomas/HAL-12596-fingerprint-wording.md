# Decision: a fingerprint that doesn't match no longer claims a change

- Task: HAL-12596
- Approval: HAL-12596 (Liam's task from the C44 docs check, HAL-12580 section 8; team decision under the HAL-2282 rule for small wording on an approved flow)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hImz5lBFN/bS9frpHY1sCVcE7ZpR55YivZCbWiB8UYhwe94wLrc8/vk1d2pi7Ois5yEoPksfTyz0bhKMjGFrBQ==

## What changes

- `halonic trust --yes --fingerprint <fp>` with a fingerprint that isn't the current one says "✕ That fingerprint doesn't match Acme as it is now." instead of "Couldn't trust Acme: it changed since that fingerprint was made." The same goes for `halonic trust --plugin <id>`.
- `halonic tools approve <server> <tool> --fingerprint <fp>` says "That fingerprint doesn't match lookup as it is now: <current fingerprint>." with the fix "Review it first: halonic tools review <server>".

The check still goes to stderr, nothing is saved, and the exit codes stay the same (3 for trust, 5 for tools approve). No test was weakened or skipped; the tests and the golden file name the new wording.

## Why

The CLI can't tell an old fingerprint from one the workspace never had, so it shouldn't say the workspace or tool changed.

## Covers

- cli.commands.trust.plugin
- cli.commands.trust.review-and-trust
- apps/cli/src/commands/tools/golden/approve-changed.txt
