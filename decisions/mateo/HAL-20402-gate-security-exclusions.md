# Decision: tests, Markdown and wording don't make a security pull request in the gate

- Approval: the fix asked for on HAL-20402 (#6651 and #6737 held as security PRs); Liam approves this note in review on HAL-20402 and signs it as the CTO
- Kind: internal

The merge gate's security sign-off rule (`paperclip.merge-control-security-signoff`)
counted any changed path under `apps/studio/src-tauri/` or `packages/core/action-catalog/`,
or naming sandbox, secret, sign-in, oauth, keychain or trust, except a changeset. So it held
#6651 (two crate READMEs) and #6737 (tests, Markdown and a `*-words.ts` file) for Julian's
sign-off. `reviewerFor` already skips tests, Markdown and wording files for the same words
(HAL-14809). The gate now uses that same rule, `isWordsOnly` from `reviewer-paths.ts`.
`docs/security/` and `SECURITY.md` still count, even though they are Markdown.

The gate's hold reason also names its cause: the `security` label, the security-review line,
the file count, or the first path that triggered it.

## Why

The gate and the reviewer routing disagreed about what a security pull request is, so
pull requests the routing gave to Julian as ordinary ones waited for a security sign-off
that nobody knew to give, and the reason didn't say which file caused it.

## Covers

- paperclip.merge-control-security-signoff
