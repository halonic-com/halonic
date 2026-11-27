# paperclip-client.declining-options

- Status: active
- Since: unreleased
- Source: security review of HAL-20441 stack B on HAL-20469 (major 1), fix asked for by Liam; requirement `ports.agent-messaging-reach`

The Paperclip provider shall set `declines` only on its own options that turn an item down and grant nothing: an approval's Reject and Request changes, a budget override's and a strategy's included, a secret proposal's and a join request's Reject, and a confirmation card's Reject. It shall never set `declines` on a decision's options, whatever ID or label the agent gave them, and never on an option that approves or accepts.

## Examples

- Given a pending `hire_agent` approval, a budget override and a confirmation card that asks to run a tool,
  when the inbox is read,
  then their Reject and Request changes options decline, and Approve and Accept don't.
- Given an agent's join request and a secret proposal,
  when the inbox is read,
  then only their Reject declines.
- Given a decision whose destructive option the agent named `reject`,
  when the inbox is read,
  then none of its options declines.
