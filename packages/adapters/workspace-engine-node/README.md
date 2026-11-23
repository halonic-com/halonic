# @halonicjs/adapter-workspace-engine-node

The engine of one workspace on this computer, with Node. It holds the workspace's engine lock, and
it opens the run store and blob store in the person's profile folder, a scheduler whose timers
survive a restart, the copies a live run's programs start in, and each run's connectors. The CLI
(`halonic run`, `halonic routines watch`, `halonic serve`) and the agent host's engine role open
the same engine.

The harness host isn't in here: it is in the host layer, which an adapter can't use. The caller
passes in `openHarnessHost`, along with what only it says or decides, such as the approvals of
listed tools.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-workspace-engine-node`

## Example

```ts
import { openLocalEngine } from "@halonicjs/adapter-workspace-engine-node";

const engine = await openLocalEngine({
  workspace,
  workspaceRoot,
  environment,
  secrets,
  keyOrigins,
  http,
  trusted: true,
  openHarnessHost,
  listedToolApproval,
  reportError: (error, source) => console.error(source, error),
});
try {
  await new WorkflowRuns(engine.executor).startRun(workspace, "support-reply", input);
} finally {
  await engine.close();
}
```

`openLocalEngine` throws `LockHeldError` of `@halonicjs/adapter-fs-node` when another engine is
open on the workspace; the caller says so in its own words.
