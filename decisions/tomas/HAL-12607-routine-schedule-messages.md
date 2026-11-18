# Decision: a broken routine is listed, and a bad interval or cron range says what is wrong

- Task: HAL-12607
- Approval: Liam reviews this change on HAL-12607 (a team decision with no board card, HAL-2282 rule for small wording on an approved screen). He signs this note.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ldTOCY5vW7kWBjEWdt4JVLJ2QosTjSsfEGFw2J8OqeKy3JtAqr3QsGilQib89K6lTbLeJKo6FAdOPU3oEOc4Bw==

## What changes

- `halonic routines` lists a routine file that doesn't load, such as one with `every: 0m`, instead
  of hiding it (and saying "No routines in Acme yet" when it was the only one). The row has the
  routine id from the file's name, `Invalid file, line 4: <first error>` where the trigger goes,
  and "Off", as the routine scheduler never sees the file. `--json` gives the same row with
  `enabled: false`. A bad cron is still listed as `Invalid schedule "…"`, as before.
- An unquoted `every: 15`, which YAML reads as a number, fails at `trigger.every` with
  `use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)`, as the
  quoted `"15"` already did, instead of `Invalid input (invalid_union)` at `trigger`. The same for
  a mail trigger's `every`. No number passes: the pattern needs a unit. The routine JSON Schema
  doesn't change.
- A cron range that runs backwards, such as `5-1`, says `Weekday: "5-1" runs backwards; write the
  smaller number first.` instead of `is outside 0-7`. An end outside the field's limits, such as
  `9-1`, still says `is outside 0-7`.
- `s.preprocess` joins schema-kit's builders, for the number case above.

The one changed assertion in `routine-list.test.ts` expected a routine with an interval no date
can hold to be left out; it is now listed with no next run, which is this change. No test was
skipped or deleted.

## Why

Nina's docs check (HAL-12594, P11-P13) found these in real runs: a typing mistake in `every` made
the routine disappear from the list without a word, a bare number got a message that names no
reason, and a backwards range was called out of range when both ends are inside it.

## Covers

- app.routine-list
- cli.commands.routines.list
- format.routine-file
- format.routine-mail-interval
- routines.cron-rejects-bad-expressions
- schema-kit.builders
