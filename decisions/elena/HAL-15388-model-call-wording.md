# Decision: requirement docs and test names say "model call limit", not "turn limit"

- Task: HAL-15388
- Approval: team decision, a wording follow-up from Julian's review of #4596 on HAL-15314; "model call limit" is the glossary name since HAL-14710 (Sofia, microcopy revision 117); the reviewer of the pull request on HAL-15388 signs this note
- Kind: internal

## What changes

Since HAL-14710 the agent's Model page and Settings › Assistant say **Model call limit**, but some requirement docs, test names and code comments still said "turn limit". This pull request changes only that prose: the requirements listed below swap "turn limit" for "model call limit" in their text and examples, and the tests of `workspace-agents`, the agent's Model page and Settings › Assistant say it in their names.

No rule, value or example is removed or weakened, no test is skipped or removed, and no `expect` changes. Code names (`turnLimit`, `maxSteps`, the key `assistant.turn-limit`, the reason code `turn-limit`) stay. Nothing a user sees changes.

The assistant chat's own requirements (`app.chat-turn-limit`, `app.chat-stop`) and the chat service's comments and error text are left for a separate change, because the requirement's ID itself names the turn limit.

## Covers

- studio.entry
- studio.workspace-agents
- fs-node.host-settings-store
- fs-tauri.host-settings-store
- memory.host-settings-store
- ports.host-settings-store
- app.host-settings
