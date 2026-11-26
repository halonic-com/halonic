# Decision: only the same reviewer, or a push, clears a change request in merge control

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19778 (Julian's security review on HAL-19649, 26 Nov 12:08 UTC, [major] and [minor] items; the board's ci-fasttrack item 1 on HAL-19248)
- Kind: internal

Merge control's change-request rule let another reviewer's approval clear an open change request: after "Liam: approved on head X", "Liam: changes requested on head X", a later "Nora: approved on head X" (or Julian's) queued the pull request. Now a change request stays open until the same reviewer approves the head after it, or the author pushes after it and the counted approval is newer than that push (an approval carried over a rebase never clears it). The same pass bundles Julian's minor items.

## What changes

- `paperclip.merge-control-change-request`: "newest change request newer than the head's approval" becomes "a change request with neither a later approval of the head by the same reviewer nor a push after it with the counted approval given after that push", and names Nora too. New examples: the sequence above isn't queued, nor is a request followed by a rebase-only push that carries over an older approval. The rule moves from `approval.ts` to `change-request.ts`.
- `paperclip.merge-control-carry-over`: an approval carries over only from a different sha, and only from the team account's lines; a failed compare is cached as unknown, so it isn't asked again every pass. In `approval.test.ts` and `approval-nora.test.ts` the "identical diff" cases now approve an older head instead of the current head before a push; the same-head case now expects no carry-over.
- `paperclip.merge-control-security-signoff`: a description line `security review` (any case, leading spaces) and a pull request with more files than the gate reads (over 100) mark a security pull request. In `gate.test.ts` and `shadow-reasons.test.ts` the over-100-files cases now carry Julian's sign-off, so they still reach the "queue by hand" rule; their expectations are unchanged.
- `paperclip.merge-control-signed-approval`: an approval line inside an HTML comment doesn't count; the wording now says plainly that an opening approval line counts over a change request below it, as live, with a test. No other test or `expect` is removed or weakened.

## Why

- **One reviewer can't overrule another's open request** (Julian's [major]): the code reviewer's change request must hold until he approves again or the code changes.
- **Fail safe on what the gate can't read**: a pull request with unread files may hide a security path, and a failed compare never carries an approval.

## Covers

- paperclip.merge-control-change-request
- paperclip.merge-control-carry-over
- paperclip.merge-control-security-signoff
- paperclip.merge-control-signed-approval
