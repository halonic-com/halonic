# contracts.agent-messaging-ids

- Status: active
- Since: unreleased
- Source: task HAL-20062, from the review of HAL-19061

The `AgentMessaging` contract shall fail for a provider that lists a source, agent, inbox item, conversation, message or attachment id that breaks `gatewayMessagingIdPattern`. The phone reads such a list, but its session breaks when it hands the id back, as in `msg-answer` or `msg-read`, or meets it as a `msg-changed` source.

## Examples

- Given a provider whose ids hold a space, such as `acme item-1`,
  when the contract lists its ids,
  then it names `acme item-1` as off the pattern and fails.
- Given the fake, whose ids look like `fake-1`,
  when the contract lists its ids,
  then it names none and passes.
