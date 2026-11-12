# Decision: a changed patch is approved with next-sha256 before it lands

- Approval: HAL-7431. Liam approves this note in review of this PR.
- Kind: internal

## What changes

- An entry in `tooling/check/patches-allowed.json` may carry `next-sha256`: the hash of a
  changed patch, next to the `sha256` of the patch in use. A patch file with either hash
  passes. It must be 64 lower-case hex digits and differ from `sha256`.
- A patch whose hash is the entry's `next-sha256` gets a warning: move the hash to `sha256` and
  remove `next-sha256`.
- The srt entry gets `next-sha256` for the patch that also fixes srt's Windows egress check
  (HAL-7431), and its reason and `remove-when` cover that part.
- Docs: `docs/guides/dependencies.md` says how to change a listed patch.

## Why

A listed patch couldn't be changed. A pull request that changes only the list fails its own
check (the patch in use no longer has the listed hash), and one that changes the list and the
patch fails the check against the base commit's list (the new hash isn't there yet). With
`next-sha256` the new file is approved first, in its own pull request, as a new patch is, and
the pull request that changes it then passes both checks. The hash still ties every change to
a reviewed list.

The change it is for: srt's Windows egress check binds a loopback port outside the proxy range
[60080,60089] in 5 attempts, closing each one that lands in the range. Windows hands out ports
in sequence, so a start that lands at 60080 fails every attempt, and the session fails to open
(the flaky `srt-kept-grants.windows.test.ts` in merge-group run 43213600023). The patch keeps
those listeners open until it finds a port outside the range, with one attempt more than the
range has ports. srt 0.0.82 still has the 5-attempt loop.

## Covers

- tooling/check/
