# engine.run-agent-instructions

- Status: active
- Since: 0.1.0
- Source: HAL-4754, from the old runner's `systemPrompt` at `784f78d`; found by the parity run on HAL-1541

When a workflow run calls a state's agent, or a `delegate_` tool hands a subagent a task, the engine shall send the model a system message before the step's prompt or the task, built from the agent's file in the run's kept definitions: its instructions, trimmed; each skill its `skills` lists that the kept definitions have, as `## Skill: <name>`, its description and its body; the delegation line of `engine.subagent-tools` when it has `subagents`; a line on connector tools when it has `connectors`; and how to reply when its `output` is a choice or JSON. The parts shall be joined by blank lines. The engine shall leave out a skill the kept definitions don't have, and shall send no system message when no part is left or the kept definitions have no file for the agent.

The old runner also described the agent's knowledge sources in this message; the engine leaves that to `knowledge_search` and `knowledge_read` (`engine.agent-knowledge`).

## Examples

- Given agent `writer` with instructions "You write replies." and skill `house-style`,
  when the run calls it,
  then the model gets a system message "You write replies.", then `## Skill: House style` with the skill's description and body, and then the step's prompt.
- Given agent `writer` whose file lists a skill the run's definitions don't have,
  when the run calls it,
  then the system message has its instructions only.
- Given agent `writer` whose file leaves those fields at their defaults, or no file for it,
  when the run calls it,
  then the model gets the step's prompt alone.
- Given agent `writer` with subagents, connectors and a `choice` output of `yes` and `no`,
  when the run calls it,
  then the system message has the delegation line, the connector line and "Reply with exactly one of: yes, no. No other words.".
- Given subagent `checker` with its own instructions and skill,
  when `writer` delegates a task to it,
  then `checker`'s model gets `checker`'s system message, then the task.
