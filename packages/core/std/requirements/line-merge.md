# std.line-merge

- Status: active
- Since: 0.1.0
- Source: HAL-3278, for Compare's "Combine both" and for keeping the assistant's baseline up to date on every write (HAL-3267, engine answer 1)

When two texts that started from the same base are merged line by line, the line-merge function shall take each change that only one side made, take a change both sides made the same way once, and keep every line neither side changed.

## Examples

- Given base "a\nb\nc\n", ours "A\nb\nc\n" and theirs "a\nb\nC\n", when they are merged, then the result is "A\nb\nC\n" with no conflict.
- Given both sides changed "b\n" to "B\n", when they are merged, then the result has "B\n" once and no conflict.
- Given ours added a line at the end and theirs is the base, when they are merged, then the result is ours.
