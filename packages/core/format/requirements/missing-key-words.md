# format.missing-key-words

- Status: active
- Since: unreleased
- Source: HAL-12126, from the new-user flow check on HAL-12121 (a misspelled `name:` gave "Invalid input: expected string, received undefined" with no key name); unknown fields from Kim's first-run check C336 (HAL-14261)

When `parseFile` finds that a required key isn't in its map at all, the problem's message shall be `Missing required key "<key>"`, with the code `invalid_type` and the path and position it had. Each unrecognized key shall be a problem of its own, saying `There's no field "<key>" in this file.`, or `in "<map path>".` below the top. When exactly one key the map allows and doesn't have, required or not, is nearest to it, within an edit distance of 2 and less than the key's length, the message shall end with `Did you mean "<key>"?`. A key that is there with the wrong type keeps schema-kit's message (`schema-kit.plain-words`).

## Examples

- Given a workflow with `nmae: Support reply` and no `name`,
  when it is parsed,
  then one problem says `Missing required key "name"` and the other `There's no field "nmae" in this file. Did you mean "name"?`.
- Given an agent with `modle: smart` and no `model`,
  when it is parsed,
  then the problem says `There's no field "modle" in this file. Did you mean "model"?`, although `model` is optional.
- Given a provider with `colour: red` and its `type` missing,
  when it is parsed,
  then the problem for `type` says `Missing required key "type"` and the one for `colour` has no guess.
- Given an agent whose `params.temperature` is `hot`,
  when it is parsed,
  then the problem says `temperature needs a number, not text.`.
