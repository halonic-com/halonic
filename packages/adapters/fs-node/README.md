# @halonicjs/adapter-fs-node

The `DefinitionStore`, `RunStore`, `RecordStore`, `TrustStore`,
`AgentPlacementStore`, `ConnectionSettingsStore` and `BlobStore` ports on
the local file system with Node: workspace files are plain files under a
root folder, each run and each collection of records is a JSONL log, each
trust record, each agent's "this computer" choice and each connector's
"allow sending" setting is a JSON file in the profile, and each blob is a
file in the profile. The CLI (`halonic validate`, `test`, `run`) and the parity run use
it.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-fs-node`

## Definitions in a folder

`new FolderDefinitionStore(root)` keeps each file at its path under `root`
and passes the shared `DefinitionStore` contract suite.

- **Paths** are checked with the port's own rules from `@halonicjs/ports`,
  the same code the memory adapter uses: no `..`, no absolute path, no
  `.git`, `.studio` or `.env` files.
- **Links:** a symbolic link or a Windows junction in any segment of a path
  is refused with a `RangeError`, even one that points inside the root.
  `list()` leaves links out, with everything under them.
- **Version:** `sha256:` and 16 hex characters over the files it serves,
  worked out as the memory adapter does, so the same files give the same
  version in both.
- **Limits:** a path is checked, then used. A program that swaps a folder
  for a link in between could get past the check; the store guards its own
  callers, not against other programs writing into its root.
- **Writes** go to a temporary file in the same folder that is renamed over
  the file, so another program reads the old text or the new. On Windows a
  scanner, an editor or the search indexer can hold the file open for a
  moment, and the rename fails with `EPERM` or `EBUSY`; the store tries it
  again five times over about a third of a second before the write fails.

## Runs in a folder

`new FolderRunStore(root)` passes the shared `RunStore` contract suite.

- **Files:** `<runId>.jsonl` holds the run's events, one per line, and only
  ever grows. `<runId>.snapshot.json` caches the engine's state, written
  through a temporary file and a rename. Delete it at any time; the engine
  then replays the log.
- **List:** worked out from the logs on every call, with no cache. Deleting
  a `.jsonl` removes the run.
- **Failed appends:** an append that fails, for example on a full disk,
  cuts the log back to where it was and stores nothing.
- **Crashes:** an event counts once its line break is written. A torn last
  line is skipped and cut off before the next append. A broken line in the
  middle of a log is an error naming the file and line. A snapshot that is
  missing, unreadable or ahead of the log gives `null`.
- **Run ids:** 1 to 128 letters, digits, `_`, `-` or `.`, not starting with
  a dot and not a Windows device name such as `NUL`. Anything else is a
  `RangeError`, so a run id can't leave the root. On macOS and Windows,
  `Run_1` and `run_1` are the same file, and reading one after writing the
  other is a "Broken run log" error; the engine's run ids are lower case.
- **Two processes:** an append holds `<runId>.lock` while it checks
  `expectedSeq` and writes, so a CLI and a desktop app writing to one run
  folder can't both win; one gets `conflict`. The lock file's format and
  rules are `RunLockRecord` in `@halonicjs/ports`, which the Tauri adapter
  follows too. An append waits while another writer holds the lock, and
  removes a lock left by a crash: one whose process no longer runs on this
  computer, or one older than `runLockStaleAfterMs` (10 seconds).
- **Limits:** a log survives a crash of the program, not of the machine: there
  is no `fsync`, so after a power cut the last appends may be gone. If the
  program crashes in the middle of an append of several events, the first
  of them may be stored without the rest.

## Example

[`examples/workspace-and-runs.ts`](examples/workspace-and-runs.ts) saves a
workflow, logs a run of it, and reads both back as the CLI would. A test runs
it.

```ts
import { join } from "node:path";
import { FolderDefinitionStore, FolderRunStore } from "@halonicjs/adapter-fs-node";

/** Saves a workflow in a workspace folder, logs a run of it, then reads both back as the CLI would. */
export async function runExample(folder: string): Promise<{
  files: string[];
  version: string;
  appended: boolean;
  conflict: boolean;
  status: string | undefined;
  snapshotSeq: number | undefined;
  eventsToReplay: number[];
}> {
  // Definitions are plain files under the workspace folder.
  const definitions = new FolderDefinitionStore(join(folder, "workspace"));
  await definitions.write("workflows/greet.yaml", "id: greet\n");
  const files = await definitions.list(); // ["workflows/greet.yaml"]
  const version = await definitions.version(); // "sha256:" and 16 hex characters

  // Each run is a <runId>.jsonl log in the runs folder, one event per line.
  const runs = new FolderRunStore(join(folder, "runs"));
  const at = "2026-11-09T09:00:00.000Z";
  const first = await runs.append("run_1", 0, [
    {
      runId: "run_1",
      seq: 1,
      at,
      type: "run.started",
      hubId: "demo",
      workflowId: "greet",
      input: {},
      kind: "run",
      definitionsVersion: version,
    },
  ]);
  // The engine caches its state in <runId>.snapshot.json with the events.
  await runs.append(
    "run_1",
    1,
    [{ runId: "run_1", seq: 2, at, type: "state.entered", state: "hello" }],
    { snapshot: { state: "hello" } },
  );
  await runs.append("run_1", 2, [
    { runId: "run_1", seq: 3, at, type: "run.waiting", state: "hello", events: ["approve"] },
  ]);
  // A writer that saw an older log loses: nothing is written twice.
  const late = await runs.append("run_1", 1, [
    { runId: "run_1", seq: 2, at, type: "state.entered", state: "late" },
  ]);

  // On the next step the engine starts from the snapshot and replays only what came after it.
  const snapshot = await runs.snapshot("run_1"); // { seq: 2, state: { state: "hello" } }
  const eventsToReplay = await runs.events("run_1", snapshot?.seq); // event 3
  const [summary] = await runs.list({ workflowId: "greet" });
  return {
    files,
    version,
    appended: first.ok,
    conflict: !late.ok,
    status: summary?.status, // "waiting"
    snapshotSeq: snapshot?.seq,
    eventsToReplay: eventsToReplay.map((event) => event.seq),
  };
}
```

## Trust records in the profile

`new FileTrustStore(root)` keeps each trust record as one JSON file in
`root`, a folder in the user's profile such as `<profile>/trust`, never
inside a workspace. It passes the shared `TrustStore` contract suite.

- **File names** are the SHA-256 of the location's UTF-16 code units
  (little-endian) in hex, then `.json`. The name never holds the location
  itself, so a file system that folds case or normalises Unicode (macOS,
  Windows) still keeps `/Workspaces/acme` and `/workspaces/acme`, or the
  two spellings of `café`, apart, and a long path still fits in a name.
  Hashing code units rather than UTF-8 keeps two Windows paths with
  different lone surrogates apart too.
- **Writes** go to a temporary file that is renamed over the record, so a
  reader sees the old record or the new one. The folder is created with
  mode `700` and each file with `600`.
- **Damage:** each file starts with its location. When a record can't be
  read, `get` and `list` throw with that location, and `revoke` deletes the
  file without reading it. When not even the location can be read, `list`
  names the file instead; deleting it removes the record.
- `list` sorts by location in code-unit order and leaves other files in the
  folder alone.

## "This computer" choices in the profile

`new FileAgentPlacementStore(root)` keeps each agent's choice to run on
this computer, outside a sandbox, as one JSON file in `root`, a folder in
the user's profile such as `<profile>/placements`, never inside a workspace,
so an agent that edits the workspace can't take itself out of its sandbox.
It passes the shared `AgentPlacementStore` contract suite.

- **File names** are the SHA-256 of the JSON of `[location, agent]` as
  UTF-16 code units, as for trust records. JSON keeps a location ending in
  `/` from running into the agent id.
- **Writes** go through a temporary file and a rename, with the same modes
  as trust records.
- **Damage:** when a choice can't be read, or the file holds another
  agent's key, `get` throws naming the agent and its workspace, and
  `remove` deletes the file without reading it. `AgentPlacement` in
  `core/app` then runs the agent in a sandbox.

## "Allow sending" settings in the profile

`new FileConnectionSettingsStore(root)` keeps each connector's settings,
whether it may send and when a person changed that, as one JSON file in
`root`, a folder in the user's profile such as `<profile>/connections`,
never inside a workspace, so an agent that edits the workspace can't switch
sending on. The setting survives a restart. It passes the shared
`ConnectionSettingsStore` contract suite.

- **File names** are the SHA-256 of the JSON of `[location, connector]` as
  UTF-16 code units, as for "this computer" choices.
- **Writes** go through a temporary file and a rename, with the same modes
  as trust records. Only the fields of the settings are written.
- **Damage:** when settings can't be read, hold another connector's key, or
  hold anything but `allowSending` as `true` or `false` and `changedAt` as
  text next to the key, `get` throws naming the connector and its
  workspace, and `remove` deletes the file without reading it. The error
  never quotes the file's text. `ConnectionSettings` in `core/app` then
  treats sending as off and tells the person why; switching sending on or
  off again replaces the file.

## Records in the profile

`new FileRecordStore(root)` keeps agent notes and collection records in
`root`, a workspace's `records` folder in the profile
(`workspaceFolders(...).recordsFolder()` in `@halonicjs/profile`), so they
survive a restart and two workspaces never share them. A person's
connection data, such as `_tokens`, belongs in a separate store. It passes
the shared `RecordStore` contract suite.

- **Files:** one log per collection, one JSON change per line, named by the
  SHA-256 of the collection name's UTF-16 code units, as for trust records.
  The folder gets mode `700`, the logs `600`.
- **Two processes:** every append and compact holds `write.lock`, with the
  run lock's rules, so a change appended while a compact runs is never
  lost. Reads take no lock.
- **Compact** reads, folds and replaces a log under the lock: the new log
  goes to a temporary file, is flushed to disk and renamed over the old one,
  so a crash leaves one or the other. A collection with no record left loses
  its log.
- **Crashes and failures:** a change counts once its line break is written.
  A torn last line is skipped and cut off before the next append. An append
  that fails cuts every log it added to back to where it was. A broken
  line, or one for another collection, is an error naming the file and line.
- **Links:** a log that is a symbolic link, a hard link or not a plain file
  is refused on read, append and compact, as for trust records.
- **Limits:** appends are not flushed to disk, so after a power cut the
  last appends may be gone, as for run logs.

## Blobs in the profile

`new FolderBlobStore(root)` keeps attachments, large results and other
blobs in `root`, a workspace's `blobs` folder in the profile
(`workspaceFolders(...).blobsFolder()` in `@halonicjs/profile`). It passes
the shared `BlobStore` contract suite.

- **Files:** each blob is `<hash[0..2]>/<hash>`, holding only the bytes. The
  media type isn't kept, as the port allows. Folders get mode `700`, files
  `600`.
- **Writes** go to a temporary file in the blob's own folder and are renamed
  into place, so the rename stays on one disk and a reader gets the whole
  blob or none. Bytes that are already stored aren't written again.
- **Paths:** a hash that isn't 64 lowercase hex characters never reaches a
  path, and a path outside the folder is refused where it is built.
- **Links:** a blob file that is a symbolic link, a hard link or not a plain
  file is refused on read, and a put replaces it.
