# ports.agent-messaging-reach

- Status: active
- Since: unreleased
- Source: architecture note HAL-17491, section 6.8 condition 2 (revision 17), decided on HAL-20274; plan on HAL-20278, approved by Liam; task HAL-20441; `declines` and the format characters from the review on HAL-20469

The `AgentMessaging` port shall let a source say what approving or accepting a `risky` inbox item reaches with an optional `reach`: the agent it acts for, the secret with its setting path, the adapter, and the environment variables by name, each saying whether it binds a secret, and how many more variables it sets than it names. A `reach` shall hold names only, never a value. An item shall hold together only when it has no `reach`, or it is `risky` and every name in its `reach` is 1 to 200 characters long, not blank and has no control, format or lone surrogate character, with at most 100 environment variables, each named once, and any count of variables left out a whole number above 0. The port shall let a source mark its own options that turn an item down with `declines`, never an option an agent wrote, and an item shall not hold together when an option's `declines` is set to anything but `true`.

## Examples

- Given a `risky` item whose `reach` names the agent "Ada", the adapter `process` and the variables `ACME_DEPLOY_TOKEN`, which binds a secret, and `ACME_REGION`,
  when it is checked,
  then it holds together.
- Given a `normal` item with a `reach`,
  when it is checked,
  then it doesn't hold together.
- Given a `risky` item whose `reach` names a blank agent, a 201-character adapter, a secret name with a newline, an agent with U+202E, an adapter with a lone surrogate, the same variable twice or 0 variables left out,
  when it is checked,
  then it doesn't hold together.
- Given an item whose Reject option has `declines` set to `true`,
  when it is checked,
  then it holds together, and with `declines` set to `false` it doesn't.
