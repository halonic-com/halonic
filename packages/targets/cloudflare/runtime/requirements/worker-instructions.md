# runtime.worker-instructions

- Status: active
- Since: unreleased
- Source: HAL-18277 (B1b-2b of the plan on HAL-18020), scope approved on HAL-18274

The Worker shall give a harness step the agent's instructions as `AGENTS.md` and each skill the agent selected as `skills/<id>/SKILL.md`, read from the run-definitions index of the snapshot it serves, in the folder `/halonic/temp/instructions`. It shall pin them with Web Crypto SHA-256 the way a computer does: each file's `sha256:` digest, and the digest of their listing sorted by name. When the agent has no instructions and no skills, it shall give none. It shall refuse a skill the hub doesn't have and a skill id that isn't a plain folder name, so the step fails before its program starts.

Rationale: the run log has to name what instructions a cloud run had, and a skill id must never reach outside the instructions folder.

## Examples

- Given an agent with instructions `Be brief.` and the skill `review`, when its instructions are opened, then the files are `AGENTS.md` and `skills/review/SKILL.md` in `/halonic/temp/instructions`, and the pin names both by digest.
- Given an agent with no instructions and no skills, when its instructions are opened, then there are none.
- Given an agent that selects the skill `../work`, or a skill the hub doesn't have, when its instructions are opened, then it is refused.
