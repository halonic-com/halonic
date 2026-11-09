# workspace.workflows

- Status: active
- Since: 0.1.0
- Source: HAL-1523 (HAL-186 implementation plan, step 1b; HAL-871)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report, for each workflow, the errors and warnings of the workflow package's `validateWorkflow`, given the agents and workflows of the workflow's own hub (the root's for a workflow at the root); as an error, a method call whose agent has no such method, and each argument the method takes that the call leaves out of `with`; as a warning, each argument in `with` the method doesn't take; and as an error, once per loop on its first workflow, workflows of one hub that run each other in a loop. Each issue has the old loader's message and the key path and line of what it is about. A workflow in a hub whose `hub.yaml` failed shall not be checked, as the old loader left that hub out.

## Examples

- Given each workflow parity case that breaks a rule or a name, such as `workflow/unknown-target`, `workflow/unknown-method`, `workflow/method-missing-argument`, `workflow/method-extra-argument` and `workflow/subflow-loop`, when it is loaded, then it gives exactly the errors and warnings the old loader recorded, the first at the key path its case file names. It is on the line the case file names, or one line below it when the issue is about a map, such as a whole state: the line where the map's value starts.
- Given `workflow/subflow-loop`, when it is loaded, then `extra` gives 'Workflows run each other in a loop: extra → line-check → extra' at `states.start.workflow`, line 7.
- Given a root workflow whose states use a root agent and a hub's agent, when it is loaded, then only the hub's agent is unknown.
