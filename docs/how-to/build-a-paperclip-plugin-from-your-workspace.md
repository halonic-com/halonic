# Build a Paperclip plugin from your workspace

If your agents run in Paperclip, Halonic can turn tools you define in your
workspace into a Paperclip plugin: a package you install in Paperclip that
offers those tools to your agents. Your workspace names and words each tool
and says who may call it. What a tool can do comes only from Halonic's
built-in actions, so a workspace can choose and word tools but never give
itself a new power.

You need:

- a workspace in a git repository, with its files committed;
- the right to install plugins in your Paperclip.

## 1. Define a tool

Each tool is one file in your workspace, `library/tools/<id>.tool.yaml`. The
file name, without `.tool.yaml`, is the tool's id. This one, in
`library/tools/pr-status.tool.yaml`, lets an agent read a pull request on
Acme's website:

```yaml
name: pr_status
description: Reads one pull request on Acme's website, with its checks, approvals and what its author does next.
callers: everyone
parameters:
  pr:
    type: string
    description: The pull request's number, such as 12, or its GitHub URL.
    required: true
action:
  run: github.pull-request
  with:
    repositories:
      - acme/website
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
- a file larger than 64 KiB.

For example, a parameter named `token`:

```text
library/tools/deploy.tool.yaml
  6:5  ✕ A tool never takes a key from an agent. Rename the parameter, or use an action that reads its key from the plugin's settings.  (parameter-asks-for-key)

✕ 1 error in 1 file. Checked 14 files.
```

## 2. Pick an action

An action is reviewed code that ships with Halonic. Your tool picks one and
fills in its settings; it can't add an action of its own. No action writes
anything.

This version of Halonic can build a plugin with these actions:

| Action | What it answers | Parameters it reads | Settings under `with` | Key it needs |
| --- | --- | --- | --- | --- |
| `github.pull-request` | one pull request: its checks, mergeability, merge queue, approvals on its newest commit, newest review finding and what its author does next | `pr` (a number or the pull request's GitHub URL), and `repo` when the tool lists more than one repository | `repositories`: 1 to 20, each `owner/name` | GitHub read token |
| `github.open-pull-requests` | the caller's open pull requests (branches that start with the agent's URL key), the ones that need attention first | none | `repositories` | GitHub read token |
| `paperclip.task` | one Paperclip task: status, holder, blockers, documents and its newest comments | `task` (an identifier or id), `comments` (0 to 20, 5 by default), `document` (a document key) | none | none: it reads through Paperclip |
| `paperclip.template` | one of the workspace's templates, or the list of them | `id` (leave it out for the list) | none | none |

An action reads its parameters only by the names in this table. Declare them
in your tool under those names: a parameter with another name never reaches
the action.

The `paperclip.template` action reads the Markdown files in your workspace's
`library/templates/` folder, one template per file.

The format also knows `github.merge-queue`, `github.merge-times` and
`paperclip.failed-runs`, but a plugin from this version of Halonic can't run
them yet. `halonic validate` accepts them; the build refuses them (see below).

## 3. Build the plugin

Commit your tool files, then run this in the workspace:

```sh
halonic build paperclip-plugin --out dist
```

```text
✓ Built halonic-ws.acme 0.1.0 from commit 1c23cc6
  Plugin file    ./dist/halonic-ws.acme-0.1.0.tar
  Release file   ./dist/halonic-ws.acme-0.1.0.release.json
  SHA-256        <the plugin file's sha-256>
  Changes        added pr_status
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
| `changes` | the tools `added`, `removed` and `changed` since the previous build, with the fields that changed |

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

- a tool file or `workspace.yaml` has changes that aren't committed, because
  the release file has to name the commit the tools come from:

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

1. Check that the plugin file is the one the release file names. The two
   values must be the same:

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

Your agents then see each tool under its `name`. An agent that a tool's
`callers` don't name gets an answer that the tool isn't offered to it, and
nothing runs.

The plugin asks Paperclip only for the permissions its tools need. For
example, it asks to read tasks and their comments only when one of your tools
uses `paperclip.task`.

## 5. Update or roll back

To change your tools:

1. Edit the tool files and commit.
2. Build with the last build's release file:

   ```sh
   halonic build paperclip-plugin --out dist --since dist/halonic-ws.acme-0.1.0.release.json
   ```

   ```text
   ✓ Built halonic-ws.acme 0.2.0 from commit b1f6913
     Plugin file    ./dist/halonic-ws.acme-0.2.0.tar
     Release file   ./dist/halonic-ws.acme-0.2.0.release.json
     SHA-256        <the plugin file's sha-256>
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

Halonic doesn't publish the snapshot file for you yet. To pin a commit:

1. Build a plugin file from that commit and unpack it, as in step 4.
2. Commit its `package/snapshot.json` to `snapshots/<commit>.json` on the
   snapshot branch. Copy the file unchanged, byte for byte: no reformatting
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
- the snapshot gives it another action or other parameters than the plugin was
  built with;
- this version of Halonic has no code for its action.

A tool that's missing or wrong is never allowed by default. To roll back a
pin, set the earlier commit and its SHA-256, or clear all three settings to go
back to the snapshot built into the plugin.
