# @halonicjs/adapter-program-copies-node

The folders a run's programs start in (HAL-4975): for a run that reads the live version, a copy of
the workspace at its commit, made as a git worktree through the hardened `@halonicjs/adapter-git`;
for a run on the saved files, the workspace folder itself. A copy holds only what git holds at that
commit, so a saved change, `.env` or `node_modules` never reaches a live run's programs.

- **Layer:** adapters
- **Owner:** elena
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-program-copies-node`

The CLI's engine opens one set on the workspace's `programCopiesFolder()`, under the workspace's
engine lock. The agent host opens its own on `hostProgramCopiesFolder()`, a sibling folder, so
neither sweeps the other's copies.

## Example

```ts
import { openProgramFolders } from "@halonicjs/adapter-program-copies-node";

const programs = await openProgramFolders({
  workspaceRoot: "/srv/acme",
  copiesFolder: folders.programCopiesFolder(),
  reportError: (error) => log(error),
});
const copy = await programs.folderFor({ reads: "live-version", commit, versionDate });
// … start the run's programs in copy.path …
await copy.release();
await programs.close();
```
