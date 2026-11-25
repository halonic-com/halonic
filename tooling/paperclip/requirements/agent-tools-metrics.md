# paperclip.agent-tools-metrics

- Status: active
- Since: unreleased
- Source: HAL-15929, phase 1 of the Agent tools plugin (HAL-15920, "Measure"): the numbers for the tools plan's before/after comparison

When the Agent tools plugin's PR watcher job finishes a pass for a company, the plugin shall save as metrics, tagged with the company and whether it ran dry, the number of tasks with a pull request, tasks it marked or would mark done, authors it woke or would wake, tasks it couldn't check, its GitHub requests and the pass's duration, and the Paperclip monitors set on open tasks and fired in the last 10 minutes, on all of them and on those with a pull request; and when an agent calls one of its tools, the plugin shall save the call and its GitHub requests, tagged with the tool and whether it answered or failed. A metric that doesn't save shall not fail the pass or the call.

## Examples

- Given a dry run with HAL-4485, whose pull request merged green and whose monitor fired 4 minutes ago, and HAL-77, without a pull request, whose monitor fired 30 minutes ago,
  when the job runs,
  then it saves 1 task with a pull request, 1 done, 2 monitors set, 1 fired, 1 fired on a task with a pull request, and the number of GitHub requests it sent, each tagged `dryRun: "true"`.
- Given a metrics store that refuses every write,
  when the job runs,
  then the pass finishes and the log says the metrics didn't save.
- Given an agent that calls `pr_status` on #4605 and then on a repository the plugin doesn't watch,
  when both answer,
  then it saves one `ok` call with its GitHub requests and one `error` call with none.
