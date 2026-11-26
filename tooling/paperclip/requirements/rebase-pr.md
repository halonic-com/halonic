# paperclip.rebase-pr

- Status: active
- Since: unreleased
- Source: HAL-18984, tools B5 of the token plan's Track B (the board's go, 26 Nov; proposal on HAL-18938); the carry-over of `paperclip.merge-control-carry-over` and `paperclip.pr-watcher-rebase-carry`; the rule to rebase after an approval only for a conflict or when the queue asks (HAL-18722)

When an agent calls the Agent tools plugin's `rebase_pr` tool with a pull request on one of the plugin's repositories, the plugin shall read it as `pr_status` does, with GitHub GET requests alone, and answer `rebase` when it is the calling agent's own open pull request (its branch in the same repository starts with the agent's url key), not in the merge queue, mergeable, and behind its base; `up-to-date` when it is that and not behind; and `refused`, with the reason, otherwise. It shall name the approvals that count on the current head and say they carry over the rebase when its changes stay the same, except on a security pull request by its paths, a release pull request, Liam's own pull request, a stacked pull request whose base isn't `main`, or a repository whose queue the Merger doesn't run, where it shall say the approval needs a re-review. Until the board turns on GitHub's rebase (HAL-18091), it shall send no write and give, for a `rebase` or a conflict, the commands that rebase the branch in the agent's clone, only when the branch and base names hold nothing but letters, digits and `._/-`.

## Examples

- Given #4588 on `priya/HAL-14219-engine-contract`, 3 commits behind `main`, mergeable, not queued, with Liam's approval on its head,
  when Priya calls `rebase_pr` on it,
  then the answer is `rebase`, Liam's approval carries over, it warns that an approved pull request is rebased only when the queue session asks or it conflicts, it gives the `git fetch`, `git rebase` and `git push --force-with-lease` commands, and every request it sent was a GET.
- Given the same pull request,
  when Mateo calls `rebase_pr` on it,
  then the answer is `refused`, because it's Priya's pull request.
- Given the same pull request in the merge queue, conflicting, or with GitHub's mergeability still unknown,
  when Priya calls `rebase_pr` on it,
  then the answer is `refused` with that reason, and only the conflict gives the commands.
- Given the same pull request 0 commits behind `main`,
  when Priya calls `rebase_pr` on it,
  then the answer is `up-to-date` with no commands.
- Given the same pull request touching `packages/x/src/sandbox/fence.ts`, or on a `liam/` branch called by Liam,
  when its author calls `rebase_pr` on it,
  then the answer is still `rebase`, and the approval needs a re-review.
- Given the same pull request stacked on `priya/HAL-14218-engine-types` instead of `main`,
  when Priya calls `rebase_pr` on it,
  then the answer is still `rebase`, and the approval needs a re-review.
- Given a branch named with a `;` or a space,
  when its author calls `rebase_pr` on it,
  then the answer gives no commands.
