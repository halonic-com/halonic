# Decision: the live line is cut to the terminal's width

- Requirement: `cli.progress` (`apps/cli/requirements/progress.md`)
- Task: HAL-2184; the first note of the review of #757 on HAL-2618
- Approval: the maintainer approves this note in review

## What changes

A live line longer than the terminal wraps onto a second row. The carriage return and "erase
line" that each draw starts with only reach the last row, so every redraw would leave a copy of
the line behind. `cli.progress` now says the line fits the terminal's width less one column (so
the cursor never wraps either), cut with "…", or "..." when the stream isn't UTF-8. The width is
read at each draw, so a resized window is cut right. A terminal that doesn't say its width gets
the whole line, as before. One example is added.

cli-output 1.5 doesn't say how a long line is cut. Where the cut goes and its ellipsis are a
detail of the approved line, so the team decides it (board, HAL-2282).

## Tests

No guard was weakened. The existing examples keep their tests; new tests cover the cut, the cut
of a coloured line, a resized terminal and a terminal without a width.
