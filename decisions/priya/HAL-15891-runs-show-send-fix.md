# Decision: `runs show` names how to switch sending on under a refused send

- Approval: /HAL/issues/HAL-15891 (from Iris's flow check C646 on HAL-15887)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yxRfeXCs7MH6kEKiIAoO/cmaGqyHP32PvCgQIi5JDQvCIoQe/H4yVya6nQ3kn4d7vUbmVlOV5TnWdtywuy90Aw==
- Task: HAL-15891

## What changes

`halonic runs show` said "! The call to send_mail was refused: sending is off for mail, so nothing was sent." and stopped there, while the model's refusal of the same call already names the fix ("to switch it on, run halonic google allow-sending mail on", HAL-15772 part 2). The person reading the run now gets the same fix, on an indented line under it:

- cli.runs-show-sending-off: for a Google connector of the workspace's own files, "  To switch it on, run halonic google allow-sending mail on", with the user's own `--dir` after `allow-sending` when they gave one; for any other connector, "  The halonic command can't switch sending on for it yet." Two examples are added for these, and the first example names the line. This is team wording, as HAL-2282 allows, and follows the shape of the fix lines under a connector that didn't start (`show-connectors.ts`).

The check for which connectors the command can switch on moves to `isGoogleConnector` in `connector-file.ts`, next to `isIntegrationConnector`, so the model's refusal (`run-sending.ts`) and `runs show` use the same rule.

## Why

C646: the line told the person why nothing was sent but not what to do, though the CLI has had the command since #4871.

## What doesn't change

Which sends are refused, the `tool.refused` event, the model's refusal text and the line's own words stay as they are. A run with no `sending-off` refusal still gets no such line.

## Tests

No test was weakened. `show-refused.test.ts` adds the fix line to the existing example's expected output (with a Google `mail` connector written for it) and two new tests, for `--dir` and for a stdio connector. `run-sending.test.ts` passes unchanged.

## Covers

- cli.runs-show-sending-off
- apps/cli/src/commands/runs/show-refused.test.ts
