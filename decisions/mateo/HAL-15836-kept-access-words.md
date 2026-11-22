# Decision: a removal that kept access the next start doesn't end says so

- Approval: Liam decided this fix in the description of HAL-15836 (C636 items 1 to 3); he signs this note in review on HAL-15836
- Kind: user-visible

C636 (HAL-15823, items 1 to 3) found that what Halonic says after a sandbox
removal with administrator rights doesn't match what happens. Liam decided the
fix on HAL-15836.

`sandbox-srt.removal-kept-access` said a removal whose kept grants the next
start won't take back, because srt still lists its sandbox account, is done
without `keptAccess`. That is the worst case, and Settings, the CLI and the
uninstaller then said plain "removed". The requirement now gives
`keptAccess: "manual"` for it, and for a status that can't be read (some access
may be kept), and no `keptAccess` only when srt lists no kept grants, so all
three can say that access stays and how to end it. `until_next_start` is
unchanged. The test that held the old answer now expects `manual`, with the same
number of `expect` calls, and two examples are added.

## Covers

- sandbox-srt.removal-kept-access
