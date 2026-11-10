# app.workflow-lookup

- Status: active
- Since: 0.1.0
- Source: HAL-2742; C174 on HAL-2000 (`hub/workflow` only when two hubs have a workflow with the same id); cli-output section 3.4, revision 27, the list's errors (HAL-1981)

The workspace's workflows shall be the workflows of its hubs, because a run always runs in a hub. A workflow named by its id shall be found when one hub has it; when two or more hubs have it, the lookup shall find none and name those hubs, so the caller can ask for `hub/id`. A workflow named as `hub/id` shall be found in that hub only.

## Examples

- Given the hubs `sales` and `support`, each with a workflow `reply`, and `support` with `support-reply`,
  when `support-reply` is looked up,
  then it is found in `support`.
- Given the same workspace,
  when `reply` is looked up,
  then none is found, and the hubs `sales` and `support` are named.
- Given the same workspace,
  when `sales/reply` is looked up,
  then the workflow `reply` of `sales` is found.
- Given a workflow `shared` at the workspace root,
  when `shared` is looked up,
  then none is found.
