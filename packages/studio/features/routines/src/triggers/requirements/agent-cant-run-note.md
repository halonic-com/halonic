# routines.triggers.agent-cant-run-note

- Status: draft
- Since: unreleased
- Source: HAL-15334 (C561 finding 4); HAL-15452 (C579 findings 1 and 2); HAL-13504; C52 claim 1.6

While Halonic can't run an agent on its own, the Triggers section on an agent shall list the routines that start it and then, in place of **Add trigger**, lead to a workflow that runs it: when workflows in the agent's hub run it as a step, directly or in a workflow they call, it shall say "Halonic can't run an agent on its own yet, only as a step in a workflow. Add a trigger to a workflow it's a step in:" and then show **Add trigger to *Workflow*** for each of them, in the hub's order, which makes a manual routine that starts that workflow and opens it on its Trigger picker, as Add trigger on the workflow does; when none does, it shall say "Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then add a trigger to that workflow." and show **New workflow**, which opens New workflow, where the window can. On a workflow it shall say neither.

## Examples

- Given the agent Writer, a step in the workflows Briefing and Digest, then the section says "… Add a trigger to a workflow it's a step in:" and shows **Add trigger to Briefing** and **Add trigger to Digest**, and no Add trigger or **Prompt**; pressing **Add trigger to Digest** makes a routine that starts Digest and opens it on its Trigger picker.
- Given the agent Writer, a step in no workflow, then the section says "… Make a workflow with the agent as a step, then add a trigger to that workflow." and **New workflow** opens New workflow.
- Given the routine Daily starts the agent Writer, then its row shows above the line.
- Given the workflow Reply, then neither line is there.
