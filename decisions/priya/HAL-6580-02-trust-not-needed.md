# Decision: `halonic trust` says a workspace on the test model needs no trust

- Approval: decided by the team on HAL-6631 (item A of refusal-words, a wording decision on an approved screen, HAL-2282) and asked for by Liam on HAL-6580; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hXNqSYccn+ok4Gzf4Bliv1DQHIvbv6aeOKWd85uxuu5ayUFTYiIU/Y2JYGE08YTQKPYZmCvw2o5ERrX9ElEPAg==
- Task: HAL-6580, from Sofia's first-run walk (HAL-6538, HAL-6673 item 2)

## What changes

`halonic run` and `halonic doctor` skip trust for a workspace whose runs can
only reach the test model (`reachesOnlyTheTestModel`, HAL-1984), such as the
example Acme. `halonic trust` didn't ask that rule: on Acme it showed an empty
trust check with a fingerprint and asked to trust it, for a trust nothing
needs.

`trust` now asks the same rule first. When it holds, it prints exactly
"✓ Acme needs no trust: it reaches only the test model and starts nothing.",
shows no check and no fingerprint, asks nothing, saves no trust record and
exits 0. That holds with `--yes --fingerprint` too, whose fingerprint has
nothing to match, without a terminal, and with `--json`
(`"status": "not-needed"`). `--yes` without `--fingerprint` stays wrong
usage (exit 2), checked before the workspace is read.

- `cli.commands.trust.review-and-trust`: one sentence and one example for
  such a workspace. Nothing it said before changes.

This replaces the paragraph of `decisions/priya/HAL-6580-run-trust-exit.md`
that left this question to Chief's card: the team decided it on HAL-6631.

## Why

Trust guards what a workspace can start. A workspace that starts nothing has
nothing to review, and showing an empty check asks people to approve a
fingerprint that protects nothing. `run`, `doctor` and `trust` now agree.

## Covers

- cli.commands.trust.review-and-trust
