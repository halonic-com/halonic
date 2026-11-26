# paperclip.pr-watcher-rereview

- Status: active
- Since: unreleased
- Source: HAL-17759; HAL-17901 (Julian's finding on #5744); green pull requests waited 2 to 6 hours for a new review after a push (24 Nov), and the rebase-only re-approval of HAL-14809 (board, 22 Nov); HAL-18201, after HAL-18190 stopped counting Julian's rebase-only re-approval outside his limits; HAL-18460, an approval that carries over a rebase needs no review round; HAL-18459, which counts Julian's rebase-only re-approval on any pull request again; HAL-19585, which compares a renamed file without a patch by its blob

When the PR watcher hands a task to its reviewer and one of its pull requests has an approval by someone other than its author on an older head, the PR watcher shall compare the pull request's changes from its merge base at the approved head and at the current head on GitHub, with GET requests only. When they match and the approval carries over (`paperclip.pr-watcher-rebase-carry`), the pull request shall not go to review. When they match otherwise, the handoff comment shall say the push was only a rebase and name the approved head, and a pull request Liam approved shall go to Julian, with the re-approval line Julian posts after checking `git range-diff`, on any path `julianRebaseRefusal` allows (not a `changeset-release/` or `julian/` branch); otherwise it shall go to the reviewer of its paths; when they differ, or the comparison fails, the comment shall name both heads, and the pull request shall go to the reviewer of its paths. A pull request whose changed paths make it a security one (`isSecurityPath`: a code path with one of the reviewer path words, `docs/security/` or `SECURITY.md`) shall not be compared, and its comment shall name both heads and say it gets no rebase-only re-approval, so it goes to the reviewer of its paths (HAL-17901). The watcher shall never post an approval itself, and shall leave a task whose author's newest comment has the line `PR watcher: own review task` (a security or release pull request) with its author.

## Examples

- Given pull request 5701 on Liam's paths (it changes `pnpm-lock.yaml`), approved by Liam on `4999bbb`, now at `5701aaa` with the same changes and a green `ci-ok`,
  when the watcher runs,
  then it compares once, records that the approval carries over, and gives the task to nobody.
- Given the same pull request on `halonic-com/cloud`, where approvals don't carry over,
  when the watcher runs,
  then it gives the task to Julian with "only a rebase since Liam's approval on `4999bbb`" and the line "Julian: re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)".
- Given a rebase-only pull request on a `liam/` branch that Julian approved on `4999bbb`,
  when the watcher runs,
  then it gives the task to Julian with the line "Julian: re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)".
- Given the same pull request with a changed line since `4999bbb`,
  when the watcher runs twice,
  then it gives the task to Liam once, naming `4999bbb` and `5701aaa`.
- Given the same pull request and GitHub refusing the comparison,
  when the watcher runs,
  then it gives the task to Liam.
- Given the same rebase-only pull request changing `packages/x/src/sandbox/fence.ts`,
  when the watcher runs,
  then it gives the task to Liam, naming `4999bbb` and `5701aaa`, with no "Julian: re-approved" line, and compares nothing.
- Given the same rebase-only pull request and the author's newest comment with the line `PR watcher: own review task`,
  when the watcher runs,
  then it leaves the task with its author and compares nothing.
- Given the approved head's change and the current head's change differ only in their hunk line numbers,
  when the watcher compares them,
  then they match; a renamed file GitHub lists without a patch matches when its blob is the same, and makes them differ when the blob differs or GitHub gives none.
