# Decision: plain words for the common schema messages

- Approval: Liam approves this change on HAL-14277 (https://paperclip.halonic.com/HAL/issues/HAL-14277), from Nina's check C337 (HAL-14257, rows 17–20 and 24–26, code row C19). A team decision with no board card (HAL-2282 rule): it builds on the approved C336 wording.
- Kind: user-visible

## What changes

- **Plain schema words (C19).** schema-kit says the issues a new user meets most in plain words,
  with the field's name and what to write: `temperature is a number: write 0.2 without quotes.`,
  `gets is a list: write [input.mail].`, `on is a list: start each item with "- to:".`,
  `options needs at least one item.`, `model is empty: write a value.`,
  `maxSteps is too small: use 1 or more.`, `perRun must be more than 0.` and
  `url needs https://, such as https://tracker.example.com/mcp.`. A value is repeated only when
  it is one short line.
- It works through the error map `parse` already passes Zod, so a schema's own message (an id
  format, "This looks like an API key…") still comes first, and any other issue keeps Zod's
  message. The codes and paths don't change, so lines, parity and the format layer's "Missing
  required key" and "There's no field" stay as they are.
- `format.missing-key-words` said a key with the wrong type keeps Zod's message; it now points to
  the new requirement `schema-kit.plain-words`. Its example and the two tests that quoted Zod's
  words are updated. No test was weakened or skipped.

## Why

"Too small: expected array to have >=1 items" and "expected number, received string" use words a
new user doesn't know and don't say what to write. Nina found them on the first run of five common
mistakes.

## Covers

- format.missing-key-words
