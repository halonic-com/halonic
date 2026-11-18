# format.missing-key-words

- Status: active
- Since: unreleased
- Source: HAL-12126, from the new-user flow check on HAL-12121 (a misspelled `name:` gave "Invalid input: expected string, received undefined" with no key name)

When `parseFile` finds that a required key isn't in its map at all, the problem's message shall be `Missing required key "<key>"`, with the code `invalid_type` and the path and position it had. When the same map has an unrecognized key within an edit distance of 2 of exactly one of its missing keys, the unrecognized key's message shall end with `Did you mean "<key>"?`, or, when the problem names several unrecognized keys, `Did you mean "<key>" for "<unrecognized>"`, one pair per guess. A key that is there with the wrong type keeps Zod's message.

## Examples

- Given a workflow with `nmae: Support reply` and no `name`,
  when it is parsed,
  then one problem says `Missing required key "name"` and the other `Unrecognized key: "nmae". Did you mean "name"?`.
- Given a provider with `colour: red` and its `type` missing,
  when it is parsed,
  then the problem for `type` says `Missing required key "type"` and the one for `colour` has no guess.
- Given an agent whose `params.temperature` is `hot`,
  when it is parsed,
  then the problem keeps the message "Invalid input: expected number, received string".
