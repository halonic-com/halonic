# Decision: `halonic run` refuses an agent in a harness before the trust check

- Approval: asked for by Liam on [HAL-6580](/HAL/issues/HAL-6580) ("refuse before the run starts, exit 9"); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DhOsS09KcOP45JiFqdoyZCrOK7hdC6F2UeHEcDlq1q8vvtr/j9WWVZVFmnxOyUwlCse/ye+WhPg7NGFjd+O0BA==
- Task: HAL-6580, from Sofia's first-run walk (HAL-6538, HAL-6673 item 2)

## What changes

The engine `halonic run` opens has no harness adapter yet, so it refuses every
run with an agent in a harness (HAL-5219). It checked trust first, so on an
untrusted workspace `halonic run support-reply --harness claude-code` showed
the trust check and the fingerprint, then exited 3. A person who trusted it
then only reached the exit 9 refusal. With `--harness codex` on a fresh Acme
the trust check was empty.

`run` now refuses such a run before the trust check, with exit 9, and shows
no trust check and no fingerprint. The harness override and the sandbox are
still checked first, in that order, so a computer that can't start the
sandbox still says so first (HAL-5219). The engine is no longer opened for a
run it refuses.

- `cli.run-harness`: item 3 (trust, exit 3) now comes after item 6 while
  item 6 refuses every harness program. The example "Given `--harness
  claude-code` and Acme isn't trusted, then it exits 3" is replaced by two
  that exit 9: one with a sandbox that starts, one in a container.
- `cli.run-sandbox-gate`: one sentence says the refusal comes before the
  trust check, without opening the engine.
- `apps/cli/src/commands/run/harness.test.ts`: the test "needs trust for a
  harness program" (exit 3) is replaced by two that pin exit 9 and check
  that no fingerprint shows on stdout or stderr. Both fail before the fix.

## Why

The CLI page on docs.halonic.dev says such a run is refused with exit 9
before anything starts, and that is the useful answer: trusting the
workspace changes nothing for a run this engine can't start. Exit 3 stays
what it is for every run that can start.

Whether `halonic trust` should ask at all for a workspace that needs no
trust is left to Chief's card (item A of refusal-words on HAL-6631).

## Covers

- cli.run-harness
- cli.run-sandbox-gate
- apps/cli/src/commands/run/harness.test.ts
