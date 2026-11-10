# std.line-merge-conflict

- Status: active
- Since: 0.1.0
- Source: HAL-3278; rule 1.4 of AI changes ("edit inside one of the assistant's changes and it's yours") settles a conflict by taking one side

If both sides changed the same lines differently, or changed lines that touch, then the line-merge function shall mark that stretch as a conflict with the base's, our and their lines, and the merged-text function shall settle each conflict by taking the side it is told to take.

## Examples

- Given base "a\nb\nc\n", ours "a\nX\nc\n" and theirs "a\nY\nc\n", when they are merged, then line 2 is a conflict with base "b\n", ours "X\n" and theirs "Y\n".
- Given that conflict, when the merged text takes theirs, then it is "a\nY\nc\n"; when it takes ours, then it is "a\nX\nc\n".
- Given ours changed line 1 and theirs changed line 2, when they are merged, then lines 1 and 2 are one conflict, because the changes touch.
- Given both sides added a different line after "a\n", when they are merged, then the two additions are a conflict.
