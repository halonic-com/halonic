# routines.triggers.add-trigger-creates-routine

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 15); flow-routines 2.3; HAL-13504; HAL-15452

When the person presses Add trigger on a workflow's Triggers section, the section shall ask the host to make a manual routine that starts the workflow and open its page on its Trigger picker (`openItem`'s `step: "trigger"`), and when the host can't, the section shall say why and keep its rows. While Halonic can't run an agent on its own, an agent's section shall offer no Add trigger and no **Prompt** (see `routines.triggers.agent-cant-run-note`).

## Examples

- Given the host makes the routine daily-2, then its page opens asking for the Trigger picker. Given the host rejects, then the section says "Couldn't add a trigger." and the reason.
- Given a workflow, then Add trigger makes the routine at once, with no **Prompt**.
- Given the agent Writer, then the section has no Add trigger and no **Prompt**.
