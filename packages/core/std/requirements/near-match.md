# std.near-match

- Status: active
- Since: unreleased
- Source: HAL-14288; the CLI's "Did you mean" (`cli.near-match`, cli-output 1.3 on HAL-1981), shared with the format and workflow packages

When a typed name isn't one of a known list, the near-match function shall offer the one name in the list within an edit distance of 2 of it, counting an insertion, a deletion, a substitution or a swap of two neighbouring characters as one edit, and shall offer nothing when no name is that close or when two or more are. A name may also be found by other spellings the caller gives for it.

## Examples

- Given "tset" and the names "init", "validate", "test" and "run", when a near match is asked for, then it is "test".
- Given "deploy" and the names "init", "test" and "run", when a near match is asked for, then there is none.
- Given "rux" and the names "run" and "runs", when a near match is asked for, then there is none, because both are within two edits.
- Given "--colour", the names "--json" and "--no-color", and "--color" as another spelling of "--no-color", when a near match is asked for, then it is "--no-color".
- Given "tset" and "test", when their edit distance is counted, then it is 1.
- Given "" and "run", when their edit distance is counted, then it is 3.
