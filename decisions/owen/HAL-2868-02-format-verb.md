# Decision: a sheet's tool may say what a call does to its noun, and a noun may start with a capital

- Approval: HAL-2868, from Sofia's wording call on HAL-2848 and her note on HAL-2868 (team decisions); Liam agreed to the capital first letter on HAL-6051; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:b26FeAQ2+NzUvjt7TTUOPUVobta0DCtWathGAKbA6lh72PWlYmvSSsS6zkUD1oyvmOwmRwGb5MmQpFuhRrk+Cw==
- Task: HAL-2868, a follow-up to HAL-2836

## What changes

`format.integration-file`: a tool in an `integration.yaml` sheet may have a `verb` next to its
`noun`, one of `sent`, `saved`, `created`, `updated` and `moved`. Without one, a run says "Sent".
A `verb` without a `noun` fails as `verb-without-noun`, because on its own it says nothing. The
list is the same as `ToolVerb` on `tool.result` in `@halonicjs/events`.

A noun's first letter may now be a capital (`^[A-Za-z][a-z]*(?: [a-z]+)*$`). Everything after it
stays lower case, letters and single spaces only.

The Google Drive fixture gets the nouns and verbs Sofia asked for: "Drive file" with `saved`,
`updated` and `moved`, and "Drive folder" with `created`. The integrations repo follows.

## Why

The run line is the user's record of what left their machine. "Sent 1 file" overstated a file
that only went to the user's own Drive. The verb is a closed list, not free text, so a sheet from
any publisher can't word a send as something milder, such as "checked 1 email": every verb on it
still says that something was made or changed. Adding one is a one-line change to this package,
and its review is the guard.

The capital is for product names. "Drive" is one, and lower-case "drive file" would read wrong,
while plain "file" can't tell the user's Google Drive apart from the workspace. Only the first
letter may be a capital, so a sheet can't shout, and there are still no digits or marks, so a noun
can't carry a value from the call. The capital is only for a product or service name ("Drive
file", "Slack message"), never for an ordinary word ("Email"). The pattern can't tell the two
apart, so the review of an integration's listing checks it.

## What it doesn't change

The engine doesn't copy `verb` onto `tool.result` yet, and the receipt doesn't read it yet. Both
follow in later steps of HAL-2868.

## Covers

- format.integration-file
- packages/core/format/spec/integration.schema.json
- packages/core/format/spec/plugin.schema.json
