# Decision: the error-output tail leaves no end of a secret with a line break

- Approval: Liam asked for this follow-up on HAL-15620 (https://paperclip.halonic.com/HAL/issues/HAL-15620), comment 9f14bbb4, and named the fix on HAL-15662 (https://paperclip.halonic.com/HAL/issues/HAL-15662). The same `[line removed: …]` style as #4794, so no new words from Sofia.
- Kind: user-visible

## What changes

A stdio connector keeps the last 10 lines its program wrote to standard error, each cut at 300
characters, and cleans them before showing them (`ConnectorStoppedError.errorOutput`,
`ProgramStoppedAtStartError.errorOutput`, which `halonic tools review` prints). The scrubber finds
whole secrets only. A secret with a line break, such as a PEM key in a variable the program
printed, could lose its start to the older lines the tail dropped, or to the part of a line the
tail cut, and its end was then shown.

- The tail now marks a line that follows text it didn't keep: the first line it kept once older
  lines were dropped, and the line after a line it cut (blank lines in between don't clear that).
- The cleaner replaces each marked line with `[line removed: it follows text that wasn't kept]`,
  as it replaces a cut line with `[line removed: too long to check]`.
- `mcp.stdio-restart` says so, with two new examples.

## Tests

No test is removed or weakened. The transport tests now expect each kept line with its
`afterLostText` mark too. New tests: a secret with a line break after a cut line (with a blank
line between), a secret with a line break whose first line the tail dropped, a tail that dropped
nothing and one that dropped a stored line, and a stopped program's `errorOutput` with a secret
whose first line was dropped.

## Why

A line the tail lost can't be checked, so the line right after it can't be trusted either. Only
that one line goes: a secret with one line break is fully covered. A secret of three or more lines
(a whole PEM key) can still leave its middle lines when its first one is dropped; that needs the
scrubber to know each line of such a secret and is raised on HAL-15662 as its own follow-up.

## Covers

- mcp.stdio-restart
