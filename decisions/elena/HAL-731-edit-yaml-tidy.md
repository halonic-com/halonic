# Decision: `yaml.edit-preserve-entries` tidies blank lines and comment indents after a delete

- Requirement: `yaml.edit-preserve-entries` (`packages/core/yaml/requirements/edit-preserve-entries.md`)
- Task: HAL-731, from the review of HAL-656 (pull request #236)
- Approval: [HAL-731](/HAL/issues/HAL-731) asks for this change; the maintainer approves it in review
- Kind: user-visible

## What changes

The requirement gets two more rules for a delete; nothing it promised before is taken away.

- **Blank lines at the start or the end of the file.** Deleting the first entry of the file also
  removes the blank lines between it and the next entry, so the file doesn't start with a blank
  line. Deleting the last entry also removes the blank lines between it and the entry above, so
  none is left at the end. A blank line that already ended the file stays.
- **Comments under a deleted block.** A comment line that was indented under the deleted block,
  right over its next sibling, moves to that sibling's indent. A comment over a less indented line
  stays where it is.

## Why

Both cases read back to the right data before, but left the file looking wrong: a blank first line,
a blank last line, or `# about b` indented as if it were still inside `a`. The second rule changes
the indent of lines outside the deleted entry, which the requirement didn't allow until now.

## Covers

- `packages/core/yaml/requirements/edit-preserve-entries.md`

No test was weakened. Two tests were added under `yaml.edit-preserve-entries` in
`packages/core/yaml/src/edit.test.ts`.
