# Decision: Julian's rebase-only re-approval counts on any pull request

- Approval: Liam decided it on HAL-18459 (25 Nov, point 3); Julian's scope is Liam's call under HAL-14809
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JRO5U1vdwtSUyipXRG1tFX5WQM/PtDZSyusIrFCLmeQvcd3uCsOmf7JGWy6Vn8ALk9bhTx7bGMzOkucGYCjDDQ==

Julian's "re-approved on head `<new>` (rebase only, range-diff vs `<old>`)" now counts on
any pull request whose head `<old>` Liam approved, Liam's paths and the line limits
included. It still doesn't count on a security pull request by its paths
(`isSecurityPath`), on a `changeset-release/` branch or on Julian's own branch. One
function in `reviewer-paths.ts`, `julianRebaseRefusal`, holds that rule, and `pr_status`,
the PR watcher and the merge-control gate all call it, so they count the same
re-approvals. The merge-control gate also needs every changed file listed, so a security
path can't hide among files GitHub didn't list. Where Liam's approval doesn't carry over a
rebase-only push (`paperclip.pr-watcher-rebase-carry`: a stacked pull request the watcher
rebased off its merged base, or `cloud`), the PR watcher now sends the pull request to
Julian when `julianRebaseRefusal` allows it, instead of back to Liam.

This reverses HAL-18190 and HAL-18201, which stopped counting the re-approval outside
Julian's limits because the live gate didn't count it.

## Why

A rebase that leaves the diff unchanged needs a `git range-diff` check, not a second
full review. Sending those back to Liam kept green pull requests waiting for him for
hours. Security and release pull requests keep their own gates.

## Covers

- paperclip.pr-tools-reapproval
- paperclip.merge-control-julian-scope
- paperclip.pr-watcher-handoff
- paperclip.pr-watcher-rereview
- tooling/paperclip/src/pr-tools/pr-tools.test.ts
- tooling/paperclip/src/merge-control/approval.test.ts
- tooling/paperclip/src/pr-watcher/handoff-outside.test.ts
- tooling/paperclip/src/pr-watcher/rereview.test.ts
- tooling/paperclip/src/pr-watcher/route.test.ts
