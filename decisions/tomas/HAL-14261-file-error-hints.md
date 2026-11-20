# Decision: plain YAML hints, unknown fields at their own line, no false unknown agent

- Task: HAL-14261
- Approval: Liam approves this change on HAL-14261 (https://paperclip.halonic.com/HAL/issues/HAL-14261), from Kim's first-run error check C336 (HAL-14245, rows 9–12, C2–C4). A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- **YAML hints (C2).** A colon and a space inside a value now says `A value has ": " in it. Put the
  value in quotes.`, a tab used to indent says `Indent with spaces, not tabs.`, and a quote that
  never closes says `This quote is never closed. Add the closing quote at the end of the value.`.
  The quotes hint only comes when the value the error points at has a `: ` in it: the parser gives
  the same error for a line indented too far, where quotes wouldn't help.
  The parser's own line follows in parentheses, so nothing is lost. An unclosed quote is reported
  where it opens, not at the end of the file.
- **Unknown fields (C3).** Each unknown key is its own problem, at the key's own line and column
  instead of the start of its map (often 1:1). It says `There's no field "modle" in this file.`
  (or `in "<map>"` below the top) and `Did you mean "model"?` when one field the map allows and
  doesn't have is near, required or optional. schema-kit records the keys an object allows for
  this; the path and code stay Zod's.
- **No false "unknown" after a broken file (C4, and C337's C4+).** A name whose file is there
  (where the name is looked up; by its own `id`, or its file name when it has none) but failed its
  own checks is no longer "unknown":
  an agent named by a workflow, routine or agent, a workflow named by a routine or workflow, an
  agent's skill, connector, knowledge or collection. (An alias's provider already landed as
  `alias-of-failed-provider-not-reported` in HAL-14260; this change reaches it through the same
  lookup.) While `models.yaml`
  has failed, no alias is unknown either, including `validate`'s `unknown-default-model` warning.
  The broken file's own errors say what to fix. This follows `test-of-failed-workflow-not-reported`.

Three proposed parity differences record what moves against the old app:
`unknown-key-at-its-own-line` (15 files), `unclosed-quote-at-its-opening-line` (1 file, whose case
already expected line 4) and `failed-file-not-unknown` (77 follow-on messages; the 4 provider ones are HAL-14260's
`alias-of-failed-provider-not-reported`).

The requirements `yaml.read-syntax-error`, `yaml.position-of`, `format.parse-file-positions`,
`format.missing-key-words` and `workspace.references` say this. Tests whose expected line moved to
the key's own line, and the "Did you mean" wording tests, are updated; tests are added for each
hint, the quote's line, the optional-field guess and the dropped follow-on error. No test was
weakened or skipped.

## Why

These are three messages a new user reads in their first ten minutes. The parser's words are only
clear to someone who knows YAML, `1:1` sends the user to the wrong line for the most common file
mistake, and "unknown agent" tells them to fix the wrong file.

## Covers

- yaml.read-syntax-error
- yaml.position-of
- format.parse-file-positions
- format.missing-key-words
- workspace.references
- packages/testing/parity/allowed-differences.json
