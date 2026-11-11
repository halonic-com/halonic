# harness-host.placement

- Status: active
- Since: 0.1.0
- Source: HAL-6277 (plan approved by Liam in HAL-6487)

The placement policy shall answer where an agent's harness runs by reading the agent's file, as it is on disk now, from the agent's hub and id, and asking the person's choices with those bytes under the workspace's real path. It shall answer `this-computer`, with when the person chose, only when a person chose that for the file as it is now, and `sandbox` otherwise. It shall pass on nothing else of the choice, and it shall fail, so the harness doesn't start, when the agent's file can't be read.

## Examples

- Given no choice for the agent,
  when the engine asks,
  then the agent runs in a sandbox.
- Given a person chose "this computer" for the agent's file,
  when the file gains a space and the engine asks,
  then the agent runs in a sandbox.
- Given a hub without the agent,
  when the engine asks,
  then the answer fails with the files' error.
