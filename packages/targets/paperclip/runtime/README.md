# @halonicjs/target-paperclip-runtime

The runtime every Paperclip plugin built from a Halonic workspace runs. It serves the tools of a
workspace snapshot inside Paperclip, each through a reviewed action, and keeps serving the last
good snapshot when a newer one can't be loaded.

- **Layer:** targets
- **Owner:** ravi
- **Public API:** `@halonicjs/target-paperclip-runtime`, and the action list for the builder at
  `@halonicjs/target-paperclip-runtime/actions`

## What a built plugin holds

The plugin builder (`halonic build paperclip-plugin`, a later step) writes three files:

| File | Where it comes from |
| --- | --- |
| `worker.js` | this package's worker, copied unchanged into every plugin (the worker entry comes in a follow-up, HAL-18000) |
| `snapshot.json` | the workspace's snapshot (`makeSnapshot` and `snapshotText` in `@halonicjs/format`) |
| the manifest | written by the builder from the snapshot and `pluginActions()` |

## Which snapshot it serves

1. With no pin in the plugin settings: `snapshot.json`.
2. With a pin (`workspaceRepo`, `snapshotCommit`, `snapshotSha256`): the file
   `snapshots/<commit>.json` on the `halonic-snapshots` branch of the workspace repository, once the
   workspace check (`ci-ok`) on that commit is green, the file's sha-256 is the pinned one and
   `readSnapshot` accepts it. It is kept as the last good snapshot.
3. When the pin can't be loaded: the last good snapshot, or `snapshot.json`, unchanged. The plugin
   writes `workspace.snapshot_stale_minutes` and tries again at most every 10 minutes.

A tool the served snapshot doesn't define, or defines with another action or other parameters than
the plugin was built with, is off. So is a tool whose action has no handler in this runtime.

## Keys

The runtime reads GitHub only with the read token the installer sets as the `githubToken` secret
reference, and only by GET requests to `api.github.com`. It never mints a token and never takes a
key from the workspace.

## Example

```ts
import { pluginActions } from "@halonicjs/target-paperclip-runtime/actions";

const runnable = pluginActions().filter((action) => action.available);
```
