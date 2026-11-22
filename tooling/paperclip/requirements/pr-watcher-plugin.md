# paperclip.pr-watcher-plugin

- Status: active
- Since: unreleased
- Source: HAL-15359; the board's decision of 22 Nov to run the PR watcher as the first job of the Agent tools plugin (HAL-15920, trigger A1), and Liam's plan approval there

When the Agent tools plugin's PR watcher job runs for a company with a GitHub token set, the plugin shall find each task's pull requests by the task identifier their branch names (`<agent>/HAL-<n>-…`), among the open pull requests and those updated in the last 3 days, change a task's status only to `done`, and, unless the company's `dryRun` setting is turned off, only log what it would do.

## Examples

- Given open pull requests on `mateo/HAL-15930-ci-dynamic-memory` and `priya/HAL-15897-c645-words` (stacked on another branch), and one on `release-notes-draft`,
  when the watcher looks for pull requests,
  then it finds them for HAL-15930 and HAL-15897, and none for the branch that names no task.
- Given a pull request merged on 9 Nov, read on 22 Nov,
  when the watcher looks for pull requests,
  then it leaves it out.
- Given a company whose settings don't turn `dryRun` off and a task whose pull request merged green,
  when the job runs,
  then it logs that it would mark the task done and changes nothing.
- Given any task change other than setting the status to `done`,
  when the plugin's host adapter is asked to make it,
  then it refuses before it reaches Paperclip.
- Given a company without a GitHub token,
  when the job runs,
  then it skips that company without reading any secret.
