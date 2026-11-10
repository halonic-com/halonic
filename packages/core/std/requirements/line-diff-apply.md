# std.line-diff-apply

- Status: active
- Since: 0.1.0
- Source: HAL-3278, so Accept and Reject of one part, and "Discard this part", work on one change of a diff

When some of the changes of a line diff are applied to the text they came from, the apply-line-changes function shall give that text with only those changes made, and shall refuse changes that overlap, or whose removed lines aren't that text's lines at their place.

## Examples

- Given "a\nb\nc\nd\n" changed to "A\nb\nc\nD\n", when only the second change is applied to "a\nb\nc\nd\n", then the result is "a\nb\nc\nD\n".
- Given the same texts, when every change but the second is applied, then the result is "A\nb\nc\nd\n".
- Given every change, when they are applied, then the result is the text after; given none, the text before.
- Given a change from a longer text, when it is applied to a shorter one, then it fails with a message.
- Given a change from diffing "x\ny\n" and "x\nY\n", when it is applied to "p\nq\n", then it fails with a message, because "y\n" isn't line 2 of that text.
