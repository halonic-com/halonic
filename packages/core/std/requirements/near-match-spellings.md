# std.near-match-spellings

- Status: active
- Since: unreleased
- Source: HAL-14288, one "Did you mean" helper for the CLI, workflow and workspace; the CLI's `--no-x` options (`cli.near-match`)

When the caller gives other spellings for a name, the near-match function shall also find that name when the typed name is within an edit distance of 2 of one of those spellings, with the same rule as `std.near-match`: one name or none.

## Examples

- Given "--colour", the names "--json" and "--no-color", and "--color" as another spelling of "--no-color", when they are matched, then it gives "--no-color".
- Given "--colour" and the names "--json" and "--no-color", with no other spellings, when they are matched, then it gives none.
