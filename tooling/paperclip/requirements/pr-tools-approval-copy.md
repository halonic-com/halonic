# paperclip.pr-tools-approval-copy

- Status: active
- Since: unreleased
- Source: HAL-19324, phase 1.1 of the HAL-19228 plan (bind approvals to Paperclip records)

When the Agent tools plugin's `pr_status` reports a pull request, and when the PR watcher's wake comment shows a pull request's status, each signed approval shall say `copy: yes`, `copy: no` or `copy: unknown`: `yes` when the reviewer's own Paperclip agent posted a comment on the task the branch names (`<agent>/HAL-<n>-…`) with an approval line in the reviewer's name whose sha has all 40 characters and starts with the head the GitHub line names; `unknown` when the branch, or a fork's branch, names no such task; `no` otherwise. Whether an approval counts shall not change.

## Examples

- Given #4588 on `priya/HAL-14219-engine-contract` with "Liam: approved on head `7651f8c`" on GitHub, and Liam's agent's comment "Liam: approved on head `<the full head>`" on HAL-14219,
  when an agent asks `pr_status` about it,
  then the approval counts and reads `Liam on 7651f8c (copy: yes)`.
- Given the same line on HAL-14219 written by another agent, or by Liam's agent with only 7 characters of the head,
  when an agent asks `pr_status` about it,
  then the approval still counts and reads `copy: no`.
- Given the same pull request on the branch `priya/fix-typo`,
  when an agent asks `pr_status` about it,
  then the approval reads `copy: unknown` and no task is read.
- Given an open pull request with Liam's approval on its head and his copy on its task,
  when the PR watcher wakes its author,
  then the wake comment's approvals line reads `copy: yes`.
