# paperclip.signal-rule-checks

- Status: active
- Since: unreleased
- Source: HAL-18319 (plan HAL-17450 rev 5, "Step 2"; split from HAL-18196)

The `rule-checks` signal rule shall work out the Worker agents page's 5 rule checks from a compact JSON input (time only from `now`, the settings, the agents, the open tasks as the checks read them, and the PR watcher's open pull requests with the time of their snapshot, or none before the first one) and give the same checks per agent as `paperclip.worker-agents-rule-checks`, as one action that saves the record the page reads. A monitor firing more often than every `shortestMonitorMinutes` (default 15) shall be a Check, and more tasks in progress than `inProgressLimit` (default 10) a Problem. The rule shall change no task.

## Examples

- Given each fixture of the rule checks (the open tasks and pull requests, an agent with more than 10 in progress, no GitHub snapshot yet, and the left-out agent, an agent that is gone and a conflicting pull request), when the checks and the rule decide, then the saved record holds the same checks per agent.
- Given `shortestMonitorMinutes: 5` and `inProgressLimit: 12`, when a monitor fires every 5 minutes and an agent has 12 in progress, then neither is flagged.
