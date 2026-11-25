# code-editor.review-part-focus

- Status: active
- Since: unreleased
- Source: HAL-18077 (a11y check RV4, HAL-18044); AI changes 1.2, "In a file" (HAL-3228)

Going to a part of the assistant's changes to review shall move the focus to the part's group, which is focusable by code, so a screen reader says which change it is and Tab goes on to that part's Accept. The owner shall name each part from its position and what it changed as the text is now: the line where it starts, how many lines it added and how many it removed.

## Examples

- Given two parts, the second adding 1 line at line 3,
  when the editor goes to part 2,
  then the focus is on the group named "Change 2 of 2: 1 line added at line 3".
