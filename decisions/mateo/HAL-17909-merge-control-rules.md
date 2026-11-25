# Decision: merge control takes the live Merger's newer gate rules and Julian's signed-line rule

- Task: HAL-17909 (under HAL-17891)
- Approval: the board asked for each live Merger change as a plugin rule on HAL-17909 (25 Nov 01:25 and 01:50); Julian set the signed-line rule on HAL-17946; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oz8eRFQgIXfceLlOzcJ5PdXb7A8nLMMKAbn3+j20B9DafFqPt5dvXSIXTgTCtkx9fZ2sHoR3GqQsBmrR2llqBQ==

## What changes

- `paperclip.merge-control-signed-approval`: a signed approval line counts on any line of a
  comment only if the comment's first non-empty line is signed by the same reviewer, the line is
  outside fenced code, not indented and not quoted, it is the only approval line for that
  reviewer, and the comment holds no change request (Julian, HAL-17946). This closes the holes
  #5813 opened: a change request that restates an old approval, a pasted approval in code, and
  another agent's comment that repeats an approval. The backticks around the sha stay optional,
  as before. One test changes its fixture: the #5758 comment now begins with "Liam:" or
  "Julian:", as Julian's case 4 does; its `expect` calls stay.
- `paperclip.merge-control-change-request`: a "blocking" word in a comment that also holds an
  approval line now makes it a change request (Julian's rule c), so the test "notes with a
  blocking word before a signed approval on a later line don't hold it" now expects the pull
  request to stay out. "Not blocking" joins "non-blocking" and "no blocking" as not a change
  request, so a reviewer's "minor, not blocking" note doesn't turn an approval into one.
- `paperclip.merge-control-required-workflows`: every run of `Guard notes` or `Built-on label`
  created at the newest creation time must pass, not only the last one to start (#5649, the
  board's live change of 25 Nov 01:50).
- `paperclip.merge-control-main-red`: one more example (a red or a newer cancelled push run
  keeps the freeze) with the named test `merge-control freeze on red main`; the rule is
  unchanged. The automatic start of the freeze is HAL-17884's.

## Why

The plugin has to decide as the live Merger does before it replaces it, and Julian found that
counting a signed line anywhere let a change request clear its own block.

## Covers

- paperclip.merge-control-signed-approval
- paperclip.merge-control-change-request
- paperclip.merge-control-required-workflows
- paperclip.merge-control-main-red
