# agent-host-client.run-instructions

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `agent-host.instruction-routes`

The instructions stand-in shall send an agent's `AGENTS.md` text, when it isn't blank, and the `SKILL.md` text of each skill its file selects to the host's `POST /v1/harnesses/instructions`, and give the engine the folder and the pin the host answered, in the engine's form. It shall ask nothing and answer `null` for an agent with no instructions and no skills. It shall throw when the host refuses or answers a pin that isn't digests. Releasing shall ask the host to remove that folder and never throw.

## Examples

- Given an agent with instructions and one skill, when the engine opens its instructions, then the host gets both files and the engine gets the host's pin and folder.
- Given an agent with blank instructions and no skills, when the engine opens its instructions, then the answer is `null` and the host is not asked.
- Given a host that can't release the folder, when the engine releases it, then the release doesn't throw.
- Given a host that refuses with `instructions_refused`, when the engine opens the instructions, then the call fails with that kind and the host's reason.
