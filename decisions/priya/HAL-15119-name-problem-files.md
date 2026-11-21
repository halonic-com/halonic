# Decision: the refusal for files with errors names the files, and Studio's band says to fix them

- Approval: /HAL/issues/HAL-15119 (Iris's flow check C544, items 1 and 2: "at the least name the file in the CLI line", and the band "never says to fix it, unlike the start card"); wording decided by the team, built on the approved Couldn't line and the start card's words
- Kind: user-visible

When `halonic run`, `halonic test`, `halonic runs send` or `halonic routines watch` refuses because the workspace's files have errors, line 1 said only how many problems there were: "Acme has 1 problem in its files." With one broken workflow, someone running a different one couldn't tell which file stopped them. Line 1 now names the files: one or two by path, three or more as the first and "and 2 other files", in the order `halonic validate` lists them. The count, the exit code, the fix line and `doctor` stay as they are, and the problems themselves are still not repeated, so a key pasted into a file never shows.

In Studio, the workflow page's problems band ("Support reply can't run: it has 2 problems.") never said what to do, while the start card did. The band now has the start card's own words as its second line, "Fix them before it can run." ("Fix it …" for one). Only the first line still describes **Run**.

Which runs such errors stop is unchanged here; that rule is asked on HAL-15127.

## Covers

- cli.workspace-file-problems
- cli.commands.test.run-tests
- workflows.start.start-run
