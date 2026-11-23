# paperclip.worker-agents-rule-checks

- Status: active
- Since: unreleased
- Source: HAL-16250; the 5 rule checks of the "Worker agents" page the board approved on HAL-16201 (addendum 2 on HAL-15997, section 1), with the states and wording of HAL-16208

When the board check runs a job pass, the Agent tools plugin shall work out 5 rule checks for every agent from the pass's listing of open tasks and the PR watcher's last GitHub snapshot, and save them for the Worker agents page without writing anything in Paperclip: (1) a task started after one of the agent's non-draft open pull requests with a failed `ci-ok` or a conflict last changed, as Check at most; (2) a task `in_progress`, or `in_review` without a pending board card, with no run and no monitor due, or a task `blocked` with no open blocker, as Problem; (3) an open pull request watched by monitors on two or more tasks, or a monitor due less than 15 minutes after it last fired, as Check; (4) nothing to start as Check, or more than 10 tasks in progress as Problem, and Not checked for a paused agent; (5) an open pull request whose branch starts with the agent's name but doesn't read `<agent>/HAL-<n>-<words>`, as Problem. Each result other than OK shall name the task or pull request to fix and a reason in the plugin's own words, never text an agent wrote; before the first snapshot, checks (1) and (5) shall say "Not available yet". The page shall list the agents with the most Problems first, then the most Checks, and show the agents whose checks are all OK on one shared line.

## Examples

- Given Ravi with a task in progress that has no run and no monitor,
  when the board check runs,
  then Ravi's task state check is a Problem that links that task with "In progress, nothing set to wake".
- Given Ravi's pull request with a failed `ci-ok`, last changed at 13:00, and Ravi's other task started at 14:00,
  when the board check runs,
  then Ravi's "New work on a red PR" check is a Check that links the pull request.
- Given a monitor due 5 minutes after it last fired,
  when the board check runs,
  then the agent's monitor check is a Check with "Monitor fires about every 5 min".
- Given no GitHub snapshot yet,
  when the board check runs,
  then "New work on a red PR" and "Branch names" say "Not available yet", never OK.
- Given 3 agents of which only Ravi has a Problem,
  when the board opens the page,
  then Ravi comes first and the other two share the line "2 more agents, all checks OK".
