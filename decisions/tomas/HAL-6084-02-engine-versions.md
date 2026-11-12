# Decision: the CLI's local engine can run more than one version of a workspace

- Requirements: `cli.local-engine` (`apps/cli/requirements/local-engine.md`)
- Task: HAL-6084, step 2a of the plan there (routines watch reads the live version)
- Approval: Liam approves this note in his review of this pull request on
  HAL-6084
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dtNzQneUe89QXfG5Xz4ojcUpspQT2Cbpx6q4wuybhvCyKgrggXR5j6GjOv2SJAMAD9ZTYBEy9wQleRG+81GLCw==

## What changes

`halonic routines watch` will read the live version at each fire through `LiveRoutines`, so one
engine has to start runs from more than one version. The CLI's engine host read one loaded
workspace for everything: a run's definitions, its model calls, a chat turn's agent and its
connectors' tools.

`openLocalEngine` gets an optional `versions` input (`WorkspaceVersions`):

- `definitionsOf(hubId, workflowId, version)`: a new run starts with the definitions of the
  version it records, which the executor now passes (step 1, #2075). When that version can't give
  them, such as one that fails the trust or sandbox check, the start fails and no run is stored.
- `latest()`: model calls, chat agents and their connectors' tools read the version read last.
  This is how `halonic runs send` already treats a run that goes on: its steps come from the
  definitions it kept, but its models are checked on the version that runs now. A new version gets
  a model resolver of its own (`latestModelResolver`), so it builds its own providers.

The executor keeps the `privacy.localOnly` of the workspace it was opened with. So a version that
changes it must not be given as `latest()`; the watch (step 2b) refuses that version's runs.

`halonic run` and `halonic runs send` don't pass `versions` and behave as before. Nothing a user
sees changes.

## Tests

No test was weakened. `local-engine-versions.test.ts`, a new file next to `local-engine-host.test.ts` (which is near its size limit), has three tests: a run starts with the
definitions of the version it records; no run is stored when the version can't give them; and a
chat turn takes its agent and model from the version read last.

## Covers

- cli.local-engine
