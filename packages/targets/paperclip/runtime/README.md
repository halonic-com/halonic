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

## Actions it can run

| Action | What it answers |
| --- | --- |
| `github.pull-request` | one pull request on the tool's `repositories`: `ci-ok`, mergeability, merge queue, signed approvals on the head, the newest review finding, what the author does next |
| `github.open-pull-requests` | the caller's open pull requests (branches starting with its `urlKey`), the ones out of sync first |
| `paperclip.failed-runs` | the runs that failed or timed out since a time, per agent, with cause codes and tasks, from the record the runtime keeps |
| `paperclip.task` | one task: status, holder, parent, blockers, documents and its newest comments (5 unless asked for up to 20), trimmed as `task_get` does |

An approval counts on the current head when the repository's team signed it ("Name: approved on
head `abc1234`") and it isn't the author's own: the signer is compared with the author's `urlKey`,
display name and its first word, so "Liam" is the own approval of `liam-cto` named Liam. Which reviewer may approve which paths is a
company's routing, so it isn't in the runtime. The other actions of the format are off until their
handlers move in.

## Failed runs

The SDK can't list runs, so when a built-in tool runs `paperclip.failed-runs` the runtime subscribes
to `agent.run.failed` (the `events.subscribe` capability) and keeps each failed run in plugin state:
ids, a cause code and a time, never the error text, for a week and at most 500 runs. Runs that fail
while the plugin is down are missing, and the answer says since when it has been counting.

A tool's `callers` name agents by their `urlKey`, compared without case. An agent's display name
never counts, because two agents can share one.

## Keys

The runtime reads GitHub only with the read token the installer sets as the `githubToken` secret
reference, and only by GET requests to `api.github.com` that don't follow redirects. It never mints
a token and never takes a key from the workspace.

`paperclip.task` reads Paperclip only through the plugin's own read clients (`issues.get`,
`issues.listComments`, `issues.relations.get`, `issues.documents.list` and `get`, `agents.list`).
Only that action asks for `issues.read`, `issue.comments.read`, `issue.documents.read` and
`issue.relations.read`, so a plugin without a task tool doesn't get them.

## Example

```ts
import { pluginActions } from "@halonicjs/target-paperclip-runtime/actions";

const runnable = pluginActions().filter((action) => action.available);
```
