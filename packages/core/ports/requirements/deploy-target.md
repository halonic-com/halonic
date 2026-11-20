# ports.deploy-target

- Status: active
- Since: unreleased
- Source: the `halonic deploy` build plan on HAL-6702, approved by Liam on HAL-13512; deploy flow revision 4 on HAL-6687, approved by the board on HAL-6814; ADR 5.6 on HAL-35

The `DeployTarget` port (version 1) shall deploy a workspace to a host and read, roll back, export, import, unlock, sign everyone out of and destroy what it deployed, with the methods `login`, `plan`, `deploy`, `status`, `rollback`, `export`, `import`, `unlock`, `revokeSessions` and `destroy`. It shall hold only types and its version: Web types, no `node:` imports and nothing that runs. A deploy shall report its steps as typed events and end in a result that is data: deployed (with every warning after the switch), unchanged, or a failed self-test. A failure shall be an `Error` with one of the kit's error kinds (`RunFailureKind`, equal to `@halonicjs/std`'s `ErrorKind`) and a stable code, so the command line's exit code comes from the kind with no new number: `conflict` for uncommitted changes, another deploy running, a command line older than what's live and a rollback that isn't possible; `unauthenticated` for a missing or refused token; `denied` for a missing permission and for data loss without leave; `limit_reached` for the host's free plan; `unavailable` when the host doesn't answer. A target package shall export a `DeployTargetEntry` as `deployTarget`, with the host it serves and the port version it was built against, so the command line loads it by name without importing it. Every target shall pass the `contracts.deploy-target` suite once the fake target exists.

## Examples

- Given the port,
  when its methods are listed,
  then they are exactly `login`, `plan`, `deploy`, `status`, `rollback`, `export`, `import`, `unlock`, `revokeSessions` and `destroy`.
- Given a deploy that went live,
  when its result is built without a `warnings` list,
  then it doesn't compile.
- Given a deploy event that is a step's `started` or `done`,
  when it is built without the step's details,
  then it doesn't compile.
- Given a failure,
  when it is built with a code where its kind goes,
  then it doesn't compile.
- Given a target package,
  when its `deployTarget` export is read,
  then it names its host and the port version and has a `create` that gives a `DeployTarget`.
