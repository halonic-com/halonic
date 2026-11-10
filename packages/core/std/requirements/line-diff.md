# std.line-diff

- Status: active
- Since: 0.1.0
- Source: HAL-3278, so the changes-to-review record, Compare and "Discard this part" diff two texts in memory without git

The line-diff function shall give the changes that turn one text into another as runs of changed lines, each with the lines it removes and the lines it adds, keeping the longest run of common lines and keeping each line's newline. Where the changed middles of the two texts are too large to compare line by line, it shall give the whole middle as one change.

## Examples

- Given "a\nb\nc\n" and "a\nB\nc\n", when they are diffed, then there is one change at line 2 that removes "b\n" and adds "B\n".
- Given "a\nb\n" and "a\nx\nb\ny\n", when they are diffed, then there are two changes, each an insertion with no lines removed.
- Given "a\n" and "a", when they are diffed, then the last line differs, because one has a newline and the other doesn't.
- Given two texts that are the same, when they are diffed, then there are no changes.
- Given two texts whose changed middles are too large to compare line by line, when they are diffed, then the whole middle is one change, and applying it gives the text after.
