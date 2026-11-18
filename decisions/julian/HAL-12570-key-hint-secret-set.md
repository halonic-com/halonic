# Decision: a missing or refused model key names halonic secret set first

- Task: HAL-12570
- Approval: Liam reviews it on HAL-12570 and signs this note as the CTO
- Kind: internal

## What changes

When a run stopped because a model key was missing or refused, line 2 only named the secret's
variable ("Set HALONIC_SECRET_ANTHROPIC to a key Anthropic accepts"), so a CLI user who saved the
key with `halonic secret set` was pointed at a variable they never used.

- `cli.messages`: line 2 names `halonic secret set <secret>` first and keeps the variable as the
  other option ("Save a key OpenAI accepts with halonic secret set openai-key, or set
  HALONIC_SECRET_OPENAI_KEY, then run again."). One helper builds the line from the provider and
  the secret name, so every provider reads the same way. Small wording on the approved line
  (cli-output 3.4), decided by the team (HAL-2282). No Studio in the CLI still holds (HAL-6183),
  and Studio's own wording is unchanged.

## Covers

- cli.messages
