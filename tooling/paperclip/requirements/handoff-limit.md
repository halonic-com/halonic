# paperclip.handoff-limit

- Status: active
- Since: unreleased
- Source: HAL-17628; HAL-18122 (the parent's maker); K3 on the phase 2 card the board approved on HAL-17544, 24 Nov; section 1.2 of the architecture note on HAL-17511

When an agent changes the agent assigned to a task whose parent task carries the `channel` tag and was made by a person, not an agent (a channel's child task, one per agent a message went to), the Agent tools plugin shall count it as a hand-off of that task; when the count would pass 3, it shall assign the task back to the agent who held it before, comment "Stopped after 3 hand-offs" on it, log the task's identifier and save the `handoff_limit.reverted` metric, and leave the count at 3. It shall not count a change by the board or any other person, by the system or by a plugin, a change to or from no agent, or its own change coming back as `issue.updated`, and it shall still take the new assignee as the one to go back to. It shall read the assignee from the event's payload when the payload carries it, so two quick reassignments count twice; it shall read the task again right before it assigns it back and send nothing when the assignee changed meanwhile; it shall leave alone a task whose parent isn't a channel; and it shall handle the events of one task one after another. It shall put no task text in a log line or a metric.

## Examples

- Given a child task of a channel, assigned to Chief,
  when agents pass it to Liam, then Julian, then Mateo,
  then the plugin changes nothing; when Mateo passes it to Elena,
  then the plugin assigns it back to Mateo and comments "Stopped after 3 hand-offs".
- Given the same task after three hand-offs,
  when the board assigns it to Elena,
  then the plugin changes nothing and Elena holds it.
- Given a task under a parent without the `channel` tag,
  when agents pass it on four times,
  then the plugin changes nothing.
- Given a task under a parent with the `channel` tag that an agent made,
  when agents pass it on four times,
  then the plugin changes nothing.
