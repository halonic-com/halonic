# Decision: a signed approval line counts after notes, without a signed first line

- Task: HAL-17927 (under HAL-17891)
- Approval: the board asked for it through Chief on HAL-17912 (25 Nov), to match the live Merger's gate; Liam signs this note in review
- Kind: internal

## What changes

- `paperclip.merge-control-signed-approval`: a signed approval line ("Liam: approved on head
  `<sha>`", "Julian: approved on head `<sha>`" or "re-approved") counts on any line of a
  comment. The comment's first non-empty line no longer has to carry the same reviewer's name
  (HAL-17909, Julian's rule on HAL-17946). Everything else stays: the line must be outside code
  and quotes, be the comment's only approval line for that reviewer, sit in a comment with no
  change request, and name the current head by at least 7 characters. The author rules (Julian
  never on his own pull request, "Author: Liam") don't change.
- One test case changes: a comment whose first line is "Mateo: rebased" with Julian's approval
  line below it was expected not to count. It is replaced by the board's case: two lines of
  notes and then Julian's approval on the head counts, and the same comment naming another head
  doesn't. The example in the requirement changes the same way.

## Why

#5758 waited hours because its signed approval was on line 4 of a comment that didn't start
with the reviewer's name, while the live Merger's `gate.js` already counted it. The plugin has
to decide as the live Merger does before it replaces it. The first-line rule added no real
protection: every agent posts as the same GitHub account, so a comment's first line proves no
more than its approval line, and the head check already keeps a repeated approval of an older
head from counting on a new one.

## Covers

- paperclip.merge-control-signed-approval
