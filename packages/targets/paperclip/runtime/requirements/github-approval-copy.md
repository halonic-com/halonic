# runtime.github-approval-copy

- Status: active
- Since: unreleased
- Source: HAL-19347, part of HAL-19324 (phase 1.1 of the HAL-19228 plan, bind approvals to Paperclip records): the same rule as Agent tools' `pr_status` (`paperclip.pr-tools-approval-copy`)

When a tool runs `github.pull-request` or `github.open-pull-requests`, the runtime shall show each signed approval it reports, for `github.open-pull-requests` each approval on the current head that isn't the author's, with `copy: yes`, `copy: no` or `copy: unknown`: `yes` when a comment on the task the branch names (`<agent>/<task>-…`), written by the agent whose url key is the reviewer's name in lower case, holds an approval line in the reviewer's name whose sha has all 40 characters and starts with the head the GitHub line names, for an approval on the current head the pull request's full head; `unknown` when the branch names no task, Paperclip has no task by that identifier, or the branch is a fork's; `no` otherwise. It shall read the task only for a pull request with a signed approval, with the `issues.read`, `issue.comments.read` and `agents.read` capabilities. When Paperclip can't be read, it shall show the approvals without a copy and the line "approval copies: couldn't read Paperclip (<error>)". Whether an approval counts shall not change.

## Examples

- Given `#12` on `priya/ACME-7-checkout` with "Julian: approved on head `7651f8c`" on GitHub, and Julian's agent's comment "Julian: approved on head `<the full head>`" on ACME-7,
  when an agent asks `pr_status` about it,
  then the approval counts and reads `Julian on 7651f8c (copy: yes)`.
- Given the same line on ACME-7 written by another agent, or by Julian's agent with only 7 characters of the head,
  when an agent asks `pr_status` about it,
  then the approval still counts and reads `copy: no`.
- Given the same approval and copy, after a push to a new head that shares the approved head's first 7 characters,
  when an agent asks `pr_status` about it,
  then the approval still counts and reads `copy: no`.
- Given the same pull request when Paperclip can't be read,
  when an agent asks `pr_status` about it,
  then the approval reads `Julian on 7651f8c`, followed by the line "approval copies: couldn't read Paperclip (…)".
- Given the same pull request on the branch `priya/fix-typo`, or on a fork's branch,
  when an agent asks `pr_status` about it,
  then the approval reads `copy: unknown`.
- Given Mateo's `#21` on `mateo/ACME-3-cart` approved on its head by Julian, with his copy on ACME-3, and by Priya, without one,
  when Mateo calls `my_prs`,
  then its line reads `approved on head (Julian copy: yes, Priya copy: no)`.
