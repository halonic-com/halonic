# workspace.trust-agent-asks

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam

When a harness agent's file says `asks: in-sandbox`, the workspace package shall add `asks: in-sandbox` to that agent's trust content. An agent with `asks: always`, or without `asks`, shall add nothing, so its content and fingerprint are the same as before the field existed. A change of `asks` between the trusted record and the workspace shall be listed as a changed agent with the field `asks`, and shall not count as a change that only removes things.

## Examples

- Given a Claude Code agent `coder` with `asks: in-sandbox`,
  then its trust content holds `asks: in-sandbox`.
- Given a trusted Claude Code agent without `asks`,
  when its file adds `asks: always`,
  then the fingerprint stays the same.
- Given a trusted Claude Code agent without `asks`,
  when its file adds `asks: in-sandbox`,
  then the fingerprint changes, the agent is listed as changed in `asks`, and the change doesn't only remove things.
- Given a trusted Claude Code agent with `asks: in-sandbox`,
  when its file drops it,
  then the agent is listed as changed in `asks`.
