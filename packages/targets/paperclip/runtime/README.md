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
| `worker.js` | this package's worker (`pnpm build` writes it to `dist/worker.js`), copied unchanged into every plugin |
| `snapshot.json` | the workspace's snapshot (`makeSnapshot` and `snapshotText` in `@halonicjs/format`) |
| the manifest | written by the builder from the snapshot and `pluginActions()` |

## Which snapshot it serves

1. With no pin in the plugin settings: `snapshot.json`.
2. With a pin (`workspaceRepo`, `snapshotCommit`, `snapshotSha256`): the file
   `snapshots/<commit>.json` on the `halonic-snapshots` branch of the workspace repository, once the
   workspace check (`ci-ok`) on that commit is green, the file's sha-256 is the pinned one (the
   SHA-256 of `snapshot.json` in the plugin file built from that commit) and
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
| `paperclip.budgets` | each agent's monthly budget as the workspace sets it beside Paperclip's, flagging every difference; reads the agent list only and changes nothing |
| `paperclip.task` | one task: status, holder, parent, blockers, documents and its newest comments (5 unless asked for up to 20), trimmed as `task_get` does |
| `github.merge-times` | merges into the default branch over the tool's `days`, per day, and the median and longest time from opened to merged |

`github.merge-times` measures from when a pull request was opened to when it merged, read from
GitHub's closed pull request list, and every answer says so. Paperclip's own `merge_speed` measures
time in the merge queue from the PR watcher's snapshots, which the runtime doesn't have, so the two
figures differ. It reads at most 1,000 closed pull requests per repository and says when that left
older merges out.

An approval counts on the current head when the repository's team signed it ("Name: approved on
head `abc1234`") and it isn't the author's own: the signer is compared with the author's `urlKey`,
display name and its first word, so "Liam" is the own approval of `liam-cto` named Liam. Which reviewer may approve which paths is a
company's routing, so it isn't in the runtime. The other actions of the format are off until their
handlers move in.

Each action reads fixed parameter names from an agent's call, listed with it in `@halonicjs/format`
(`toolActionInfo(name).parameters`): `pr` and `repo` for `github.pull-request`, `task`, `comments`
and `document` for `paperclip.task`, `since` for `paperclip.failed-runs`, `id` for
`paperclip.template`; the writing actions' are under Writing actions. `halonic validate` refuses a
tool file that leaves out a required one or declares one its action doesn't read, so the builder never
builds it. `action-parameters.test.ts` holds every handler here to that list.

A tool's `callers` name agents by their `urlKey`, compared without case. An agent's display name
never counts, because two agents can share one.

## Failed runs

The SDK can't list runs, so when a built-in tool runs `paperclip.failed-runs` the runtime subscribes
to `agent.run.failed` (the `events.subscribe` capability) and keeps each failed run in plugin state:
ids, a cause code and a time, never the error text, for a week and at most 500 runs. Runs that fail
while the plugin is down are missing, and the answer says since when it has been counting.

## Writing actions

`paperclip.comment`, `paperclip.next-step` and `paperclip.finish-run` are the only actions that
change anything. Each checks everything first, then writes only when the tool file sets
`mode: write`; otherwise (`dry-run`, the default) it answers the writes it would make. The agent's
parameters never pick the mode. A task change goes through `issues.setDisposition` when the host
has it (Halonic's server), and through the comment and the plain issue update otherwise; without
`setDisposition` no monitor can be set, so `in_progress` is refused there. Each action reaches only
the Paperclip clients its handler declares capabilities for.

Their parameters: `task` and `body` for `paperclip.comment`; `task`, `status`, `comment`, `monitor`
and `blockedBy` for `paperclip.next-step`; `task`, `outcome`, `comment`, `to` and `blockedBy` for
`paperclip.finish-run`. `monitor` and `blockedBy` aren't flat values, so a tool file can't declare
them yet.

## How the worker talks to Paperclip

The worker speaks Paperclip's plugin worker protocol with its own client: JSON-RPC 2.0, one message
per line over stdin and stdout. It was written against `@paperclipai/plugin-sdk` **2026.1117.0**,
plugin API version **1** (`pinnedSdkVersion` and `pluginApiVersion` in `src/worker-protocol.ts`), and
refuses a Paperclip that initializes it with another API version. It uses only built-in web APIs,
so `worker.js` holds no Paperclip code and imports nothing but its `snapshot.json`; the SDK is used only in the contract
tests.

- It answers `initialize`, `health`, `shutdown`, `executeTool` and `onEvent`; any other method gets
  a method-not-found error.
- It calls back to Paperclip for state, secrets, http, agents, tasks, metrics and event
  subscriptions only when the plugin's manifest declares the capability that call needs, and
  refuses the call itself otherwise.
- Task writes go through `issues.createComment` and `issues.update`. The protocol has no
  `issues.setDisposition` (only Halonic's server does), so through the worker a writing action that
  asks for `in_progress` is refused.
- `onEvent` hands the event to the plugin's listeners for it. A listener that fails, or a
  subscription Paperclip or the worker refuses, goes to Paperclip's plugin log and never stops the
  worker.
- A line longer than 4 MiB, a line that isn't JSON-RPC, and a call back that gets no answer within
  9 s each end in an error, never in a stopped worker. A call's params, which may hold a key, never
  go into an error.

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
