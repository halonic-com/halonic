# Decision: tighter log reading and note check for the front bot's progress notes

- Approval: HAL-19323, from the review of the progress notes on HAL-19236; the package owner's
  reviewer (Liam) approves this note in review
- Kind: internal
- Task: HAL-19323

## What changes

`paperclip.front-bot-progress-notes`:

- A command label names a second word only for programs with subcommands (`git`, `gh`, `pnpm`,
  `npm`, `npx`, `cargo`, `vitest`, `biome`). Every other listed program is "Ran <program>".
- Only `acpx.tool_call` records on the run's stdout are read.
- Progress notes are deleted from plugin state once the newest one is more than a day old,
  instead of only no longer being served.
- One example added: a search pattern never reaches the request.

`paperclip.front-bot-progress-check`:

- A new reason `markup`: a note holding `<`, `>`, `[`, `]` or a `javascript:`, `data:`,
  `vbscript:`, `file:` or `mailto:` link is rejected. One example added.

No example was removed and no test was weakened; every change makes the reader or the check
stricter.

## Why

The notes are off by default and stay off until these hold. A second word of a program without
subcommands is data the agent chose (a pattern, a host, a folder), not a step name. Records on
other streams aren't the agent's own. Markup and script links have no place in a one-line plain
note.

## Covers

- paperclip.front-bot-progress-notes
- paperclip.front-bot-progress-check
