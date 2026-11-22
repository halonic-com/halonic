# Decision: halonic routines says a routine is paused until the workspace is trusted, as the Studio does

- Task: HAL-15525
- Approval: HAL-15525; Liam reviews this pull request and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kYeYGHJgNMcjVQ9+NXYLtVzqnRtWufo7vSApALB36zsEgvbY62tYDQ80AIj3YQsE91qKjtjfLGk+LRKmOViOAg==

## What changes

`halonic routines` now reads whether the workspace is trusted on this computer, by the rule
`halonic routines watch` refuses by (trusted here, or reaching only the test model), without
refusing anything. In a workspace that isn't trusted, a routine that is on says "! Paused until
trusted" in its Next column, the Studio's chip, in place of a time that would never come, and a
line before the list says why and names the command: "! Acme isn't trusted on this computer yet,
so its routines don't start · halonic trust" (or "… changed since you trusted it, …"). A routine
that is off or can't start keeps "Off" or "✕ Can't start". `--json` gains `trusted`. The list still
starts nothing, writes nothing and exits as before.

The requirement `cli.commands.routines.list` is updated to say this, and its two golden files take
the new `trusted: true` field of `--json`. Tests for the new line are added. No test was weakened
or skipped.

`halonic serve`'s trust gate now asks the same function (`workspaceTrustState`), so the two can't
drift; its answers are unchanged and its tests pass as they were.

## Why

Flow check C587 #3 (HAL-15498, HAL-15525): on an Acme copy that needs trust, the CLI listed
"Next 23:27" while `routines watch` would stop at once with exit 3 and the Studio's list said
"Paused until trusted". A team wording decision built on the Studio's approved chip and `run`'s
"isn't trusted on this computer yet" and "changed since you trusted it" (HAL-2282 rule).

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
