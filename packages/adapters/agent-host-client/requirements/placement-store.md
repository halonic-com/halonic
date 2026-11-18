# agent-host-client.placement-store

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `agent-host.placement-routes`

The placement store stand-in shall get, save and remove an agent's "this computer" choice by asking the host's `POST /v1/placements/get`, `save` and `remove`, and give the engine the choice the host answered. It shall send only the key, or the choice's own fields. It shall throw, never answer `null`, when the host refuses or can't read a choice, and when the answer isn't a choice for the key asked.

## Examples

- Given a host with no choice, when the engine asks for one, then the answer is `null`.
- Given a host that answers a choice for another agent, when the engine asks, then the call fails.
- Given a host that refuses with `placement_unreadable`, when the engine asks, then the call fails with that kind and the host's reason.
- Given a choice, when the engine saves it, then the host gets exactly its five fields.
