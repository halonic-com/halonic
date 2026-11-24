# Decision: the reviewer signs the decision note with the review and pushes the line

- Approval: Chief decided it on HAL-17893 (item 2 of the merge-time report on HAL-17891); Liam owns the flow, Julian reviews and signs it there
- Kind: internal

`pnpm decision sign <number>` gets a `--push` option. After signing, it adds the
`- Signature:` line to the note at the head it signed, commits only that as `halonic-dev`
through a temporary index (the pull request is never checked out, so none of its code or
hooks run), and pushes the commit to the pull request's branch without force. It refuses a
pull request from a fork. `docs/guides/checks.md` and `docs/guides/review.md` now say that a
red `ci-ok` whose only failure is the missing signature is ready for review, and that the
reviewer signs and approves the signed head in the same run. The signing rule itself, the
signed text, the guard and its trust roots don't change.

## Why

44% of red pull request runs failed only because the note wasn't signed yet, and asking for
the signature was its own round: a handoff, the author's push and a full CI run before the
review could start. Signing with the review removes that round.

## Covers

- tooling/check/
