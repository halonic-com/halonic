# Decision: `halonic secret remove` says "saved", names a variable that still holds the secret, and points to `secret list`

- Task: HAL-15812, HAL-15816
- Approval: flow check C631, P1 (https://paperclip.halonic.com/HAL/issues/HAL-15800), routed to the platform adapters' owner in https://paperclip.halonic.com/HAL/issues/HAL-15812; words check C633, point 1, in https://paperclip.halonic.com/HAL/issues/HAL-15816. A team decision on a command's wording, with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

With no secret saved under the name, `halonic secret remove openai-key` printed
"openai-key wasn't set. Nothing changed." even when `HALONIC_SECRET_OPENAI_KEY` held a value that
runs still read. It now says one of two things, still changes nothing and still exits 0:

- With no saved secret and no variable: "openai-key isn't set, so nothing changed. To see the
  secrets that are set, run halonic secret list." (C633's sentence).
- With no saved secret but the variable set: "No secret openai-key is saved. Nothing changed." and
  a second line, "HALONIC_SECRET_OPENAI_KEY is still set, so runs still read openai-key from it.
  Unset it to remove openai-key." An empty variable counts as unset, the same as for runs.

`--json` is unchanged (`"removed": false`). The command reads only whether the variable holds a
value, never prints the value.

The requirement `cli.commands.secret.remove` replaces its "wasn't set" sentence and example with
these two cases and adds an example for the variable. The tests that expected "wasn't set" now
expect the new words, and new tests cover the variable, set and empty. No test was weakened or
skipped.

## Why

In C631, the old words said the key "wasn't set" while runs still read it from the variable
(HAL-15800). `remove` can't clear an environment variable, so the message names it. C633
(HAL-15816) asked the plain case to point to `halonic secret list`.

## Covers

- cli.commands.secret.remove
