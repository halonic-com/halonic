# Decision: the Node.js guard says Sofia's one line

- Task: HAL-6560 (Sofia's first-run walk, HAL-6538 item 8)
- Approval: Sofia agreed the words on [HAL-6544](/HAL/issues/HAL-6544), Chief chose them over the earlier two-line version, Liam decided on [HAL-6560](/HAL/issues/HAL-6560) as CLI owner (small wording on an approved message, a team decision with no board card, HAL-2282 rule); Elena reviewed it on [HAL-6581](/HAL/issues/HAL-6581), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Jd44jjJB4eqcr61BpwQqCl339K5VFAnlgJgCJO+viO4Z29wumz4GUCdFOAqJEmV1cRtuNd9ayZxVWZwA0gWuDg==

## What changes

`cli.node-floor`: on a Node.js older than 26.12, the launcher prints one line,
"✕ Halonic needs Node.js 26.12 or later, but this is Node.js *version*. Install a newer one, for
example with nvm install 26.", in place of the two lines "✕ halonic needs Node.js 26.12 or newer.
You have *version*." and an indented hint. The first example now uses Node.js 18.19.1, the version
in Sofia's words.

The behaviour stays the same: the check runs before any TypeScript loads, an old Node.js exits
with 1 without a stack trace, and 26.12 or newer runs the command.

## Why

Sofia's first-run walk read the guard against the docs and asked for one line that names the
product, the version found and the fix. Her HAL-6544 answer, written against the pull request
diffs, replaced the two-line version she suggested on HAL-6538 three minutes earlier.

## Covers

- cli.node-floor
