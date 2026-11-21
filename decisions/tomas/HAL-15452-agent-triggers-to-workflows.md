# Decision: an agent's Triggers leads to its workflows instead of Add trigger

- Task: HAL-15452
- Approval: a detail of an approved screen (the Triggers section, flow-routines 2.3), decided by the team under the HAL-2282 rule from flow check C579 findings 1 and 2 (HAL-15448), confirmed by Sofia on HAL-15460. Liam signs this note at code review.
- Kind: user-visible

## What changes

On an agent, Configuration › Triggers no longer offers **Add trigger** or asks for a **Prompt**,
because the routine it made can't run: its own page then says so. In its place the section says
why and leads to a workflow that runs the agent:

- when workflows in the agent's hub run it as a step (directly or in a workflow they call), "Halonic
  can't run an agent on its own yet, only as a step in a workflow. Add a trigger to a workflow it's a
  step in:" and an **Add trigger to *Workflow*** for each, which makes the routine for that workflow
  and opens it on its Trigger picker, as Add trigger on the workflow does;
- when none does, "… Make a workflow with the agent as a step, then add a trigger to that workflow."
  and **New workflow**.

The routines that already start the agent stay listed above the line. An agent's section no longer
says "Nothing starts this agent on its own yet; it runs when called." before that line, so "on its
own yet" shows once.

What to do instead now starts the same everywhere, "Make a workflow with the agent as a step", and
ends with the step for where the person is: "then pick it under Starts" on a routine's page, the
New routine dialog and Run now, and "then have the routine start that workflow" in `halonic serve`
and its how-to. Studio's words come from `agentCantRunWords` alone.

Requirements changed: `routines.triggers.agent-cant-run-note` (rewritten for the new section),
`routines.triggers.add-trigger-creates-routine` (Add trigger and its Prompt on an agent removed),
`routines.triggers.empty-state` (no agent line), and the sentence quoted in
`routines.new.create`, `routines.starts.starts-card`, `studio.engine-service` and `cli.commands.serve.serve`;
`studio.workspace-routines` gains that it gives an agent's section the workflows that run the agent
as a step, with one example.

Tests changed: in `triggers-section.test.tsx` the four tests of an agent's Prompt (asks first, Cancel,
focus after Cancel, the line above the Prompt) are removed with the behaviour they test, and the
empty-state test now checks the workflow line and that an agent says "on its own yet" once. New
tests cover the agent's Add trigger per workflow, New workflow, the rows above the line, and
`workflowsWithAgent` in `workspace-routines.test.ts`. The quoted sentence is updated in
`new-routine-dialog.test.tsx`, `starts-card.test.tsx`, `engine-service.test.ts` and
`webhook-routines.test.ts`. No other test was weakened or skipped.

## Why

C579 found the section saying "don't" and offering the button that does it, and three different
next steps for the same limit. Leading to the workflows that run the agent is the step that works
today. When Halonic can run an agent on its own, Add trigger on an agent comes back with its Prompt.

## Covers

- routines.triggers.agent-cant-run-note
- routines.triggers.add-trigger-creates-routine
- routines.triggers.empty-state
- routines.new.create
- routines.starts.starts-card
- studio.engine-service
- studio.workspace-routines
- cli.commands.serve.serve
- packages/studio/features/routines/src/triggers/triggers-section.test.tsx
