# Build a Paperclip plugin from your workspace

If your agents run in Paperclip, Halonic can turn tools you define in your
workspace into a Paperclip plugin: a package you install in Paperclip that
offers those tools to your agents. This is a package for Paperclip. It isn't
a [plugin](../guides/plugins.md) you add to Halonic.

Your workspace names and describes each tool and says who may call it. What a
tool can do comes only from Halonic's built-in actions, so a workspace can
choose and describe tools but never give itself a new power.

You need:

- a workspace in a git repository, with its files committed;
- the right to install plugins in your Paperclip.

## 1. Define a tool

Each tool is one file in your workspace, `library/tools/<id>.tool.yaml`. The
file name, without `.tool.yaml`, is the tool's id. This one, in
`library/tools/pr-status.tool.yaml` of the `examples/acme` workspace, lets an
agent read a pull request on Acme's shop website:

```yaml
# Acme is an invented company: the repository below doesn't exist.
name: pr_status
description: Reads one pull request on Acme's shop website, with its checks, whether it can merge and its place in the merge queue.
parameters:
  pr:
    type: integer
    description: The pull request's number, such as 42.
    required: true
    minimum: 1
callers: everyone
action:
  run: github.pull-request
  with:
    repositories: [acme/shop-website]
```

| Field | What it holds |
| --- | --- |
| `name` | the name agents call the tool by: lowercase words joined by `_`, at most 48 characters |
| `description` | what the tool does, in 1 to 500 characters. Agents read it to choose a tool, so keep it short |
| `callers` | who may call it: `everyone`, or a list of agents (see below). There is no default, so a tool without `callers` is refused |
| `parameters` | what the agent passes, at most 16. Each has a `type` (`string`, `integer`, `number` or `boolean`), a `description` of 1 to 300 characters and `required` (`false` by default). A string may list its choices under `enum` and set `maxLength` (1,000 by default); a number may set `minimum` and `maximum` |
| `action.run` | the built-in action that does the work (see the next section) |
| `action.with` | that action's settings, such as the repositories it may read |

To offer a tool only to some agents, name them by their URL key in Paperclip.
Case doesn't matter, and an agent's display name never counts, because two
agents can share one:

```yaml
callers:
  agents:
    - reporter
    - sorter
```

The complete list of fields is in the tool file's JSON Schema,
[`tool.schema.json`](../../packages/core/format/spec/tool.schema.json).

### Check your tool files

Run `halonic validate` in the workspace. Besides mistakes in the fields, it
refuses a tool file that could leak a key or hide what it does:

- a value that looks like a key or token, anywhere in the file;
- a parameter whose name asks for a key, such as `token`, `apiKey` or
  `password`. An agent would have to hold the key to pass it, and keys come
  only from the plugin's settings;
- hidden characters in a description or a choice, such as zero-width spaces
  or marks that change the text's direction;
- an action that isn't in the list, a setting the action doesn't take, or a
  field the format doesn't know;
- a parameter the action needs but the tool doesn't declare, or one the
  action never reads (see the next section);
- a file larger than 64 KiB.

For example, a parameter named `token`:

```text
library/tools/deploy.tool.yaml
  6:5  ✕ A tool never takes a key from an agent. Rename the parameter, or use an action that reads its key from the plugin's settings.  (parameter-asks-for-key)

✕ 1 error in 1 file. Checked 14 files.
```

And a tool for `github.pull-request` whose parameter is called `number`
instead of `pr`:

```text
library/tools/bad-pr.tool.yaml
  4:3  ✕ The action github.pull-request reads the parameter 'pr', so every tool that runs it must declare it. Add 'pr' under parameters, or rename the parameter that should be 'pr'.  (parameter-missing)
  5:5  ✕ The action github.pull-request never reads this parameter, so an agent's value for it would be dropped. It reads only 'pr', 'repo': rename or remove it.  (parameter-not-read)

✕ 2 errors in 1 file. Checked 17 files.
```

## 2. Pick an action

An action is reviewed code that ships with Halonic. Your tool picks one and
fills in its settings; it can't add an action of its own.

This version of Halonic can build a plugin with these actions that read:

| Action | What it answers | Parameters it reads | Settings under `with` |
| --- | --- | --- | --- |
| `github.pull-request` | one pull request: its checks, whether it can merge, its place in the merge queue, approvals on its newest commit, the newest review finding and what its author does next | `pr` (a number or the pull request's GitHub URL); optional: `repo`, when the tool lists more than one repository | `repositories`: 1 to 20, each `owner/name` |
| `github.open-pull-requests` | the caller's open pull requests (branches that start with the agent's URL key), listed with the ones that need attention first | none | `repositories` |
| `github.merge-times` | how long pull requests took from being opened to being merged, per repository | none | `repositories`, and `days`: 1 to 90, 7 by default |
| `paperclip.task` | one Paperclip task: status, holder, blockers, documents and its newest comments | `task` (its identifier, such as `ACME-12`, or its id); optional: `comments` (0 to 20, 5 by default) and `document` (a document key) | none |
| `paperclip.failed-runs` | the agent runs that failed or timed out, counted from when the plugin started watching | `since` (optional: a time such as `2026-11-22T12:00:00Z`; when left out, the last `hours` from the settings) | `hours`: 1 to 168, 24 by default |
| `paperclip.template` | one of the workspace's templates, or the list of them | `id` (optional: leave it out for the list) | none |

And these that write to Paperclip, each as the agent that calls the tool:

| Action | What it does | Parameters it reads | Settings under `with` |
| --- | --- | --- | --- |
| `paperclip.comment` | posts one comment on a task in the caller's company | `task`, `body` | `mode` (see below) |
| `paperclip.next-step` | sets a task the caller holds to `in_progress` with a monitor, or to `blocked` with the tasks that block it, with a comment | `task`, `status`, `comment`; optional: `blockedBy` and the monitor (see below) | `mode` |
| `paperclip.finish-run` | ends the caller's run on a task it holds: `done`, `blocked` with its blockers, or `handoff` to the agent named in `to`, with a comment | `task`, `outcome`, `comment`; optional: `to` and `blockedBy` | `mode` |

The `github.` actions need a GitHub read token (see step 4). The
`paperclip.` actions need no key: they go through Paperclip.

Declare each parameter in your tool under the name in these tables.
`halonic validate` refuses a tool that leaves out one its action needs (any
that isn't marked optional), or declares one its action never reads.

The `paperclip.template` action reads the Markdown files in your workspace's
`library/templates/` folder, one template per file.

### Say who reviews: `routing.yaml`

A `routing.yaml` at your workspace's root says which agent covers each review
role and who owns each area. The build puts it in the plugin's snapshot.

```yaml
roles:
  code-reviewer: liam
  second-reviewer: julian
areas:
  engine-and-cli: priya
```

The roles are `code-reviewer`, `second-reviewer`, `clarifier` and
`merge-captain`; an area is a slug, such as `engine-and-cli`, at most 50 of
them. Name each agent by its url key only. `halonic validate` refuses another
role or field, an email, a GitHub login, a key, and an area named like an
account, such as `github-login`.

The format also knows `github.merge-queue`, but a plugin from this version of
Halonic can't run it. `halonic validate` accepts it; the build refuses it (see
below).

### Writing actions start in dry run

A writing action only writes when its tool file says `mode: write`. Without
it, the tool checks the call and answers what it would have written, and
writes nothing:

```text
Dry run: would post your comment on ACME-12. Nothing was written; the tool file sets mode: write when it goes live.
```

Only the tool file sets the mode; an agent's call can't change it. So try a
new writing tool in dry run first, then set `mode: write` and build again:

```yaml
action:
  run: paperclip.comment
  with:
    mode: write
```

`paperclip.next-step` and `paperclip.finish-run` change only a task the
calling agent holds. Setting a task to `in_progress` needs a monitor. If
your Paperclip doesn't let plugins set monitors, the tool refuses and the
agent sets the monitor itself. The agent gives the monitor in 4 parameters:
`monitorInMinutes` (15 to 1,440) and `monitorRef` (what it waits on, such as
`acme/shop-website#42`), and optionally `monitorService` (`github` by
default) and `monitorMaxChecks` (1 to 8, 4 by default).

## 3. Build the plugin

Commit your tool files, then run this in the workspace:

```sh
halonic build paperclip-plugin --out dist
```

```text
✓ Built halonic-ws.acme 0.1.0 from commit 873b694
  Plugin file    ./dist/halonic-ws.acme-0.1.0.tar
  Release file   ./dist/halonic-ws.acme-0.1.0.release.json
  SHA-256        b97549649579591470fb81d0474f83a0fd5393c8b8a0307d0f00493e8379b8ee
  Changes        added my_prs, pr_status and task_get
```

It writes two files:

- the **plugin file**, `<plugin id>-<version>.tar`, the package you install;
- the **release file**, `<plugin id>-<version>.release.json`, which says what
  the plugin file is.

The plugin id is `halonic-ws.` followed by your workspace's id, so two
workspaces can each have a plugin in one Paperclip.

| Release file field | What it says |
| --- | --- |
| `pluginId` | the plugin id, such as `halonic-ws.acme` |
| `version` | the plugin's version, such as `0.1.0` |
| `archive` | the plugin file's name |
| `sha256` | the plugin file's SHA-256 |
| `workspaceCommit` | the workspace commit the tools come from |
| `halonicVersion` | the version of Halonic that built it |
| `changes` | the tools `added`, `removed` and `changed` since the previous build, with the fields that changed, and the `routing` entries (`roles.<role>`, `areas.<area>`) whose agent changed |

The same workspace commit and the same version of Halonic always give the
same plugin file, byte for byte. To check a plugin file someone else built,
build that commit yourself and compare the SHA-256.

The command never installs anything, never reaches Paperclip or the network,
and never asks for a key.

| Option | What it does |
| --- | --- |
| `--out <folder>` | where to write both files. The current folder by default |
| `--since <release file>` | the previous build's release file. The build lists what changed since then and takes the next minor version: `0.1.0` becomes `0.2.0` |
| `--plugin-version <x.y.z>` | the version to give the plugin, instead of the next one |
| `--dir <folder>` | the workspace, if you don't run the command inside it |
| `--json` | print the release file's fields and both paths as JSON |

### When the build refuses

The build stops, and writes nothing, when:

- a tool or template file, `routing.yaml` or `workspace.yaml` has changes
  that aren't committed, because the release file has to name the commit the
  tools come from:

  ```text
  ✕ Couldn't build the plugin: library/tools/pr-status.tool.yaml has changes that aren't committed.
    Commit the workspace's files with git, then build again.
  ```

- `halonic validate` finds errors in the workspace;
- a tool uses an action this version of Halonic can't run yet:

  ```text
  ✕ Couldn't build the plugin: merge_queue uses github.merge-queue, which a plugin from this version of Halonic can't run yet.
    Take the file for merge_queue out of library/tools and commit, then build again.
  ```

- `--out` already holds a different plugin file with the same name and
  version. Build with `--since` and the last build's release file, or give
  another version with `--plugin-version`.

Building the same commit again into the same folder leaves the files as they
are.

## 4. Install it in Paperclip

1. Check that the plugin file is the one the release file names: the SHA-256
   this prints must match `sha256` in the release file.

   ```sh
   sha256sum dist/halonic-ws.acme-0.1.0.tar
   ```

2. Unpack it on the machine where Paperclip runs. This makes a `package`
   folder with `package.json`, `manifest.js`, `worker.js` and `snapshot.json`:

   ```sh
   tar -xf dist/halonic-ws.acme-0.1.0.tar
   ```

3. In Paperclip, open **Settings → Plugins** and install the plugin from the
   `package` folder, giving its full path. Paperclip installs from a folder,
   not from the `.tar` file itself.
4. If any of your tools uses a `github.` action, fill in **GitHub read token**
   with a Paperclip secret that holds a GitHub token. It needs read access
   to the repositories your tools list, and nothing more. Paperclip keeps
   only a reference to the secret, and the plugin uses the token only to read
   from `api.github.com`. A key never goes in your workspace.
5. Leave the pin settings empty (see
   [Which workspace version the plugin serves](#6-which-workspace-version-the-plugin-serves)).

Your agents then see each tool under its `name`. If a tool's `callers` don't
name an agent, the tool answers that agent that it isn't offered to it, and
nothing runs.

The plugin asks Paperclip only for the permissions its tools need. For
example, it asks to read tasks and their comments only when one of your tools
uses `paperclip.task`, and to post comments or change tasks only when one
uses a writing action.

## 5. Update or roll back

To change your tools:

1. Edit the tool files and commit.
2. Build with the last build's release file:

   ```sh
   halonic build paperclip-plugin --out dist --since dist/halonic-ws.acme-0.1.0.release.json
   ```

   ```text
   ✓ Built halonic-ws.acme 0.2.0 from commit d5e0193
     Plugin file    ./dist/halonic-ws.acme-0.2.0.tar
     Release file   ./dist/halonic-ws.acme-0.2.0.release.json
     SHA-256        a5de844b64b5f392887a731b6cb6e76f10a79757646d915a7d355d302c34401e
     Changes        changed pr_status
   ```

3. Install the new plugin file as in step 4.

A tool's name and parameters are fixed when you install the plugin, so a new
tool or a changed parameter always needs a new version.

To roll back, install the previous version's plugin file again. Keep every
plugin file you install, with its release file, so you always have the one
before.

## 6. Which workspace version the plugin serves

Every plugin file holds a snapshot of your tools at the commit it was built
from, as `snapshot.json`. With the pin settings empty, the plugin serves
exactly that snapshot. Nothing else is needed.

You can pin a newer snapshot instead, to change a tool's settings (such as
its repositories) or your templates without installing a new version. Set
all three of these, or none:

| Setting | What it holds |
| --- | --- |
| **Workspace repository** | the workspace's GitHub repository, as `owner/name` |
| **Pinned workspace commit** | the full id of the commit whose snapshot to serve |
| **Pinned snapshot sha-256** | the SHA-256 of that snapshot file |

The plugin reads the snapshot from `snapshots/<commit>.json` on the
`halonic-snapshots` branch of that repository (**Snapshot branch** changes the
branch). It serves it only when:

- the check on that commit is green: `ci-ok`, unless **Workspace check** names
  another;
- the file's SHA-256 is the pinned one;
- the snapshot names that commit and passes the same checks the build runs on
  your tool files.

Halonic doesn't publish the snapshot file for you. To pin a commit:

1. Build a plugin file from that commit and unpack it, as in step 4.
2. Commit its `package/snapshot.json` to `snapshots/<commit>.json` on the
   snapshot branch and push. Copy the file unchanged, byte for byte: no reformatting
   and no change to its line endings, or its SHA-256 no longer matches.
3. Set **Pinned snapshot sha-256** to that file's SHA-256:

   ```sh
   sha256sum package/snapshot.json
   ```

The same commit always gives the same `snapshot.json`, so anyone can rebuild
it and compare. The plugin reads the file with the GitHub read token, so the
token also needs read access to the workspace repository.

### When it can't load the pinned snapshot

If GitHub can't be reached, the check isn't green, the file doesn't match or
the pin is incomplete, the plugin keeps serving the last snapshot it loaded,
or the one built into it, unchanged. It writes how many minutes it has been
behind to the metric `workspace.snapshot_stale_minutes`, and tries the same
pin again at most every 10 minutes.

### When a tool is off

A tool answers that it is off, and runs nothing, when:

- the snapshot it serves doesn't have it;
- the snapshot gives it a different action or different parameters from the
  ones the plugin was built with;
- this version of Halonic has no code for its action.

A tool that's missing or doesn't match stays off: the plugin never runs it
anyway. To roll back a
pin, set the earlier commit and its SHA-256, or clear all three settings to go
back to the snapshot built into the plugin.
