# std.near-match

- Status: active
- Since: 0.1.0
- Source: HAL-14270, "Did you mean" for the names `validate` checks in a workflow test (C337 C18 on HAL-14257); the same rule as `cli.near-match`

The near-match function shall give, for a name that was typed and a list of names that exist, the one name within an edit distance of 2 of it, counting a swap of two neighbouring characters as one edit. When no name is that close, or two or more are, it shall give none.

## Examples

- Given "soter" and the names "writer" and "sorter", when they are matched, then it gives "sorter".
- Given "xyz" and the names "writer" and "sorter", when they are matched, then it gives none.
- Given "rn" and the names "run" and "runs", when they are matched, then it gives none, because both are near.
