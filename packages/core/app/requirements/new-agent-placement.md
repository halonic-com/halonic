# app.new-agent-placement

- Status: active
- Since: 0.1.0
- Source: HAL-9509, following HAL-9451 (Settings › Agent sandbox saves `sandbox.new-agents`); decided by Liam on HAL-9509 (fail closed, helper before the creation path)

The app shall place a new agent from the host setting `sandbox.new-agents`: only when its value is `this-computer` shall it record the "this computer" choice for the agent's file as it is now, through `app.agent-placement`. With no saved value, a value that isn't `sandbox` or `this-computer`, host settings that aren't loaded or couldn't be read, it shall record nothing, so the agent runs in a sandbox.

## Examples

- Given no saved `sandbox.new-agents`,
  when a new agent is placed,
  then nothing is recorded and it runs in a sandbox.
- Given `sandbox.new-agents` is `this-computer`,
  when a new agent is placed,
  then the choice is recorded for the agent's file as it is now, and it runs on this computer.
- Given a saved value that is neither `sandbox` nor `this-computer`,
  when a new agent is placed,
  then nothing is recorded and it runs in a sandbox.
- Given host settings whose read failed,
  when a new agent is placed,
  then nothing is recorded and it runs in a sandbox.
