# Decision: the docked step card gets Type and Agent, and Prompt shows only once a step has an agent

- Task: HAL-12216
- Approval: T7b scope on HAL-12216 (UX checklist 10.8, flow-workflows 5.2); Type's six names, "No agent" and "a new kind changes only `type`" agreed by Liam in review on HAL-12216 (19 Nov); C285 TY1 and NA1, decided by the team on HAL-14002 and checked by Sofia in C296 (HAL-14032); Liam approves this note in review
- Kind: user-visible

## What changes

- `workflows.page.step-card`: the card gets **Type**, a picker of the six kinds flow-workflows 5.2 lists (Agent step, Wait, End, Workflow, Parallel, For each), and **Agent**, a picker of "No agent" and the hub's agents, for an agent step and a for each step. A pick is saved at once as one change of the step, and the card then shows the fields of the kind and agent picked. With no agent it says "No agent: this step passes the data straight on." An agent the file names that the hub doesn't have stays in the list by its id.
- `workflows.page.step-card`: **Prompt** shows only for an agent step that has an agent (C285 NA1). Before, a step with no agent still showed Prompt with "The agent gets the run input.", which isn't true without an agent. A field the card hides keeps its text in the file.
- `studio.workspace-workflow-step-edit`: the desktop app gives the workflow its own hub's agents for the Agent picker, and changes a step's kind and agent in the file. A new kind changes only `type`, so the old kind's keys stay and changing back finds them. A kind other than an agent step goes in as the step's first key, and an agent step, the default, takes `type` out (C285 TY1). It refuses a kind the format doesn't have, and writes nothing.

Nothing is removed or weakened: Prompt, Save output as and Description, how they save, the key check, the toast and the card's placement stay the same. The examples that change only add Type and Agent, and the empty-prompt hint now needs an agent picked.

## Why

UX 10.8 and flow-workflows 5.2 put Type and Agent on the step card, and the T7b task brings the missing editing to the Workflows page. Keeping the old kind's keys means switching a kind by mistake loses nothing a person wrote.

Sofia's check C285 found that a step with no agent still promised "The agent gets the run input." (NA1), and that `type` landed at the end of a step, away from where people look for it (TY1).

## Covers

- workflows.page.step-card
- studio.workspace-workflow-step-edit
