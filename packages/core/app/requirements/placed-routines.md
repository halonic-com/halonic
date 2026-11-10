# app.placed-routines

- Status: active
- Since: 0.1.0
- Source: HAL-1540, step 7(c) of the HAL-186 plan; the hosts give the routine scheduler a loaded workspace's routines

When a host gives the routine scheduler a loaded workspace's routines, `placedRoutines` shall return every routine file that parsed, each with the hub folder it sits in, or `null` for a routine at the workspace root, in the order of the files' paths. A routine file that didn't parse shall be left out. A routine that parsed but names a target that doesn't exist shall still be returned, so its start fails on its own and is reported without holding the other routines back.

## Examples

- Given a workspace with a routine in the `acme` hub, a routine at the workspace root and an agent file,
  when `placedRoutines` reads it,
  then it returns the root routine with hub `null` and the `acme` routine with hub `acme`, and nothing for the agent.
- Given a routine file whose YAML doesn't parse,
  when `placedRoutines` reads the workspace,
  then that file is not among the routines.
- Given a routine whose `run.workflow` names a workflow the hub doesn't have,
  when `placedRoutines` reads the workspace,
  then the routine is still among them.
