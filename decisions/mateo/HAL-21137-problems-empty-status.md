# Decision: Code's empty Problems line is read out and says "No problems in your files."

- Task: HAL-21137
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21137 (the post-merge words and accessibility check of #6938 asked for it from HAL-21130; Nora reviews it and Liam signs this note as the CTO)
- Kind: user-visible

## What changes

- `files.code-list-chips`: while Problems is on and no file has an error or a warning, the column says "No problems in your files." (was "No file has a problem.") in place of the tree, in a status region, so a screen reader reads it when the tree empties. Go to Files still moves the focus to the line.
- `TreeBody` keeps one `role="status"` region in the page at all times, also while a search finds nothing, so the line always arrives in a region that was already there. The region sits after the search's own status region.

## Why

The line was a plain paragraph, so after picking Problems a screen reader said nothing while the list went away (WCAG 4.1.3). A status region that arrives together with its text is often not read, so the region has to be in the page before the line. The new wording is the one the words check suggested.

## Tests

No test was skipped or weakened. `code-list-column.test.tsx` checks that the line lands in a status region that was in the page before Problems was picked, and in the same region again after a search that found nothing is cleared. The two checks from #6947 now expect the new wording.

## Covers

- files.code-list-chips
