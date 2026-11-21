# Decision: doctor checks the key a harness agent's run gets, on the Secrets line

- Task: HAL-15086
- Approval: Liam approves this note in his review of this pull request on HAL-15086. A team decision with no board card (HAL-2282 rule): the Secrets line's own words, no new wording.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:68VfJtRn+DoZL8oaP5n52IWv52CFaGtfiWCLisTyweUPB2mw+eXaCcILOhI2xhnxs6dLUAFLSoj4ZjtthHbXDA==

## What changes

`halonic doctor` now checks the key `run` would give a sandboxed harness agent, when the Models
line doesn't check it. The case is Nina's C536 G1 (HAL-15070): a root agent of Claude Code
without a `model`, and one keyed Anthropic provider that no alias uses. Since #4407 (HAL-14661)
the Harnesses line rightly stops asking about that agent's sign-in, because `run` gives it the
provider's key. But no line checked that key, so doctor said nothing while the run would stop
with a missing key.

Doctor keeps every key `run`'s key services pick for a harness agent in any hub, and adds each
one the Models line doesn't check to the Secrets line, used by its provider:
"✕ Secrets     anthropic-key isn't set (provider claude) · halonic secret set anthropic-key".
A key the Models line already checks isn't added, so no secret is named twice.

The requirement `cli.doctor-secrets` gets one sentence and one example for this. No requirement
was retired, and no test was weakened or skipped.

## Why

Nina offered three options: (a) check the picked key, (b) keep the sign-in question when the
picked key isn't saved, (c) leave it. (b) gives the wrong fix: `run` doesn't fall back to the
sign-in when the key is missing, it stops (`MissingKeyError`), so signing in wouldn't help. (c)
leaves doctor silent before a run that will fail. (a) names the real fix. The Secrets line
already exists for "a secret a run needs that the Models line doesn't check", with words the team
approved, so it needs no new wording. The Models line names aliases, and an agent without a
`model` has none to name.

## Covers

- cli.doctor-secrets
