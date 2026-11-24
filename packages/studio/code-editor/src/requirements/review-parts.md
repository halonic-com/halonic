# code-editor.review-parts

- Status: active
- Since: unreleased
- Source: HAL-16807 (T14 PR 15, HAL-1307); AI changes 1.2, "In a file" (green and red lines in place, Accept and Reject per part) (HAL-3228)

The code editor shall mark each part of the assistant's changes to review it is given: every line the part added on a green (`success-soft`) background, and the lines it removed struck through in red above where they were, or after the last line when they were at the end. Each part shall be a group, named by its owner (such as "Change 1 of 3"), with its own **Accept** and **Reject** buttons (Reject reads "Reject and delete file" on the only part of a file the assistant created) that tell the owner which part and which decision. The marks shall stay on the right lines while the user types elsewhere, and setting a new list shall replace the marks shown before. On request, the editor shall put the cursor on the first line of a part, scroll to it and take focus.

## Examples

- Given the assistant changed line 2 of `model: small` to `model: large`, when the parts are set, then line 2 is green, `model: small` shows struck through above it, and the group "Change 1 of 1" has Accept and Reject.
- Given the only part of a file the assistant created, then its Reject reads "Reject and delete file".
- Given two parts, when the user clicks Reject on the second, then the owner is told part 1 (from 0) and reject.
- Given a part on line 3 and the user types a line above it, then the green mark stays on the same text.
- Given the parts are set to an empty list, then no line is marked and no buttons show.
- Given a part that only removed the last line, then that line shows struck through after the text.
- Given the owner asks for part 2, then the cursor is on its first line and the editor has focus.
