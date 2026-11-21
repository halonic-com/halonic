# routines.triggers.agent-cant-run-note

- Status: draft
- Since: unreleased
- Source: HAL-15334 (C561 finding 4); HAL-13504; C52 claim 1.6

While Halonic can't run an agent on its own, the Triggers section on an agent shall say "Halonic can't run an agent on its own yet, only as a step in a workflow. Add a trigger to a workflow that uses this agent instead." above **Add trigger**, before any **Prompt** is asked for, and **Add trigger** shall be described by that line, so the person reads the limit before writing the agent's task. On a workflow it shall not say it.

## Examples

- Given the agent Writer with no routine, then the section says "No trigger starts this agent." and then the line, before Add trigger is pressed; a screen reader reads the line with Add trigger.
- Given the agent Writer and Add trigger was pressed, then the line still shows, above the **Prompt**.
- Given the workflow Reply, then the line isn't there.
