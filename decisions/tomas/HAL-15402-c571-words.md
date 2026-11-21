# Decision: secret picks in brackets, an empty value says empty, http:// for this computer

- Task: HAL-15402
- Approval: words check C571 (HAL-15387), rows 11, 62 and 63, a team decision on details of approved screens and output with no board card (HAL-2282 rule); Liam reviews it and signs this note
- Kind: user-visible

## What changes

- **The trust check's secret picks (CLI and Studio).** A local integration's connector lists one
  entry per workspace secret, with the names the integration's sheet reads it as in brackets:
  "sync-key and my-notes-key (as notes-key)", and "my-notes-key (as notes-key and sync-key)" when
  one workspace secret fills two sheet secrets. The name stays bare when both names are the same,
  and those come first, as Mara's C569 (HAL-15412, #4662) already made them; this keeps that order
  and adds the brackets. Before, "my-notes-key as notes-key and sync-key" read both ways. Same
  meaning as Mara's words on HAL-14737, only the brackets are new.
- **An empty value.** A key with nothing after it (YAML's `null`) where a number, `true` or
  `false`, or text goes now says "temperature is empty: write a number.", "… is empty: write true
  or false." or "… is empty: write a value.", instead of "… needs a number, not nothing."
- **http:// for this computer.** An address without a scheme whose host is `localhost`,
  `127.0.0.1` or `[::1]` gets "baseUrl needs http://, such as http://127.0.0.1:11434/v1."; every
  other host keeps https://.

The requirements `cli.trust-check`, `studio.workspace-trust-review` and `schema-kit.plain-words`
are updated to say this, with an example each for the new cases. The tests that named the old
words now name the new ones; tests for the new cases are added. No test was weakened or skipped.

## Why

C571 found the "and" ambiguous in exactly the case `cli.doctor-secrets`' example has (one secret
for two sheet names), "not nothing" doesn't tell a person what to write, and local model servers
(Ollama, LM Studio) answer only on plain http, so the https:// suggestion fails for them.

## Covers

- cli.trust-check
- studio.workspace-trust-review
- schema-kit.plain-words
- apps/cli/src/output/trust-check-integrations.test.ts
- apps/studio/src/studio/trust-review.test.ts
