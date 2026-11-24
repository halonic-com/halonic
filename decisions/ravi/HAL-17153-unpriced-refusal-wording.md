# Decision: the unpriced-model refusal starts with the agent and says the limit can't count its calls

- Task: HAL-17153, from words check C782 rows 14 and 15 (HAL-17146) on #5518 (HAL-16880)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17153 (a team decision on approved wording, HAL-2282; the reviewer compares the PR with the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G99pkyd4pe8MA+QWsSqjyM7KVGIyKZnZqd/ALykk3XWyFqVpAgmaiLRJygwbOdsmt59X0kWVarzpyupqoqboBg==

## What changes

- `workspace.many-users-unpriced-model` (edited): only the wording of its message. The error sits on
  the agent's file, so the sentence now starts with the agent, and it says what goes wrong: the
  deployment's cost limit can't count the agent's calls. The two examples quote the new sentences:
  - "Agent "writer" calls model "cheap", which has no price or falls back to a model without one,
    so deployment "web", where many people sign in, can't count its calls against its cost limit.
    Use a model alias with a price, and give each of its fallbacks a price too."
  - "Agent "writer" names no model, so claude-code picks one Halonic has no price for, and
    deployment "web", where many people sign in, can't count its calls against its cost limit. Set
    model to an alias with a price."
- Which agents get the error, its code and where it sits don't change. The tests expect the new
  sentences; no test is removed and none makes fewer `expect` calls.
- The unreleased changeset ends with "…, so the limit can count every call."

## Why

"Its calls would count no cost" didn't tell people what goes wrong, and the old sentence was about
50 words.

## Covers

- workspace.many-users-unpriced-model
