# Decision: a plugin connector checked without sheets says to check with `halonic validate`, not to turn off local-only

- Approval: the task HAL-15890 asks for this change, from the changeset check C644 (HAL-15885) of #4893. The team decides it under the HAL-2282 rule, since it rewords a message that is already there. Liam wrote it, so Julian signs this note in review.
- Kind: user-visible

## What changes

- `workspace.local-only-sheet-hosts`: in a local-only workspace loaded without any sheets' hosts, as Studio and `halonic doctor` load it, a `plugin` connector still gets the `local-only-connector` error, but the message says the plugin's sheet isn't read here, so nothing says which hosts it reaches, and ends with "check the workspace with halonic validate, which reads it" instead of "set privacy.localOnly: false in workspace.yaml to use it". The requirement's text says so and gains an example. Other connectors checked without sheets, and every message when the sheets are given, stay as they are. Which connectors count as local, and what `halonic validate` and `halonic run` refuse, don't change.

## Why

#4893 (HAL-15806) stopped offering to turn off local-only for a plugin nobody has looked at yet, but only when the sheets are given. Studio's problem lists and `doctor` give none, so a Studio user was still told to turn off local-only for any plugin connector. That weakens privacy as the first fix, and in Studio it wouldn't even help, since Studio's agent host never starts a plugin's backend. `halonic validate` reads the added plugins' sheets and names the real reason.

## Tests

No test was weakened or skipped. In `local-only.test.ts`, the test of a plugin connector loaded without sheets expects the new message; it failed before the fix.

## Covers

- workspace.local-only-sheet-hosts
