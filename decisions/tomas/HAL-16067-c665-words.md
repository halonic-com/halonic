# Decision: C665 wording for `routines watch` and a model on an unknown provider

- Approval: the task HAL-16067 asks for these changes, from Sofia's words check C665 (rows 71 and 110). The team decides them under the HAL-2282 rule, since they reword messages that are already there, for the same cases. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8jpCjFQmLHNv2lynVnt7XM2jrmuNHg0kBbaWa4wSDzZHI1O72ru+VIwnsiluu3VXvlrsrhFonJxy6ZY1EDESDw==

## What changes

- `cli.commands.routines.watch`: the line for a routine whose agent runs in Claude Code or Codex changes from "✕ Daily notes can't start: routines can't run agents in Claude Code yet, and Coder is in Claude Code. Set the agent to Halonic's own loop, or turn the routine off." to "✕ Daily notes can't start: Coder runs in Claude Code, which routines can't start yet. Set Coder to Halonic on its Harness page, or turn the routine off." (C665 row 110). The requirement's text and its example change to the new words; when the line shows, and what the watch does, stay the same.
- `workspace.references`: the error for a `provider/model` setting whose provider the workspace doesn't have changes from `Agent "writer" uses model "mok/echo", whose provider "mok" the workspace doesn't have: Did you mean mock/echo?` to `The model mok/echo, used by the agent writer, names the provider mok, which the workspace doesn't have. Did you mean mock/echo?`, and its other fix to `Add providers/mok.yaml, or use a provider the workspace has.` (C665 row 71). The code (`unknown-provider`), the file and the key path stay the same, and so does which settings are checked. The requirement's two examples and its sentence about the message change to the new words.

## Why

Row 110: "Halonic's own loop" names no control a person can find. The CLI's other harness fixes say "on its Harness page", and Studio says "Analyst runs in Claude Code, which Halonic can't start yet." for the same refusal. Row 71: it is the same check as the alias line from C637 in another shape, and the fix after the colon started with a capital.

## Tests

No test was weakened or skipped. `watch.test.ts`, `watch-live-version.test.ts` and `model-providers.test.ts` check the new words in place of the old ones.

## Covers

- cli.commands.routines.watch
- workspace.references
