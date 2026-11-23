# Decision: an updated plugin that is off says so in `plugin list`'s words, and `runs send` names "Allow this address?"

- Task: HAL-16319
- Approval: HAL-16319 asks for these fixes (C696 findings 2 and 5 on HAL-16316); Liam reviews the pull request and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wi9cSF3eYHpkz31JBLaZK4dP261HBx4oyDZbDR4/d1kLi6sb3F+5xVljoxaLRdAFUi72oliZ/mGIGzcX1Z8NAw==

## What changes

- `cli.commands.plugin.add-update`: after `plugin add --update`, No or Enter now says "! Weather is updated but off: it's changed since you trusted it. Nothing from it runs until you trust it: halonic trust --plugin weather", and with no terminal line 1 is "Weather is updated but off: it's changed since you trusted it, and there's no terminal to ask you to trust it.". For a plugin that was never trusted, the state words are "not trusted yet". Before, both said only "updated but off", while `plugin list` said "changed since you trusted it" for the same plugin.
- `cli.commands.runs.send`: a running run whose model call waits for the answer to Studio's "Allow this address?" is refused with "it's waiting for your answer to "Allow this address?" in the step Draft a reply, and only Studio asks that." and the same fix ("See it with halonic runs show …"). Before, it said "it isn't waiting for you. It's running, in the step Draft a reply.", while `halonic runs` listed the run as "Needs you" and `runs show` said to answer in Studio.

## Why

C696 found one state named three ways after an update (finding 5), and `runs` and `runs send` contradicting each other for a run waiting on "Allow this address?" (finding 2). The list's state words are Studio's page states (T12), so the update's words follow them, not the other way round. The exit codes stay the same (3 and 5).

Finding 5 also noted that with no terminal the fingerprint shows twice: in the fix line on stderr and alone as the last stdout line. That stays: `cli.commands.plugin.add`, `cli.commands.trust.plugin`, `cli.commands.trust.review-and-trust` and `cli.commands.trust.instructions` each require both, the ready-to-copy command for a person (HAL-14262, HAL-15123) and the bare line for `tail -n1` in a script (`cli.not-trusted`).

## Tests

No test was skipped or weakened. `add-update.test.ts` checks the new words on No and with no terminal, and its exact-output tests now also expect the new "! Files changed since the copy it replaces: …" line (`cli.commands.plugin.add-update-files`). `send-address.test.ts` checks the refusal for a run waiting on "Allow this address?", and that nothing is sent; the other `runs send` refusals are unchanged.

## Covers

- cli.commands.plugin.add-update
- cli.commands.runs.send
