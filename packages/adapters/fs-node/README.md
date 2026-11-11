# @halonicjs/adapter-fs-node

The `DefinitionStore`, `RunStore`, `RecordStore`, `TrustStore`,
`AgentPlacementStore`, `ConnectionSettingsStore`, `UnfencedRunConsentStore`,
`BlobStore` and `FolderReader` ports on the local file system with Node: workspace files are
plain files under a root folder, each run and each collection of records is a
JSONL log, each trust record, each agent's "this computer" choice, each
connector's "allow sending" setting and the yes to run without the sandbox is
a JSON file in the profile, and each blob is a file in the profile. The CLI
(`halonic validate`, `test`, `run`) and the parity run use
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
  A file it replaces keeps its permissions, such as a script's execute bit.
  The temporary file is flushed to disk before the rename, so after a power
  cut the file holds the old text or the new one, never an empty or partial
  file. The rename itself may still be lost, which leaves the old file.
- **Write if unchanged:** `write(path, content, { expected })` writes only
  when the file is still what `expected` says, and otherwise returns
  `changed-on-disk` with the current file. Writes to one path run one after
  another, but a program outside Halonic can still change the file in the
  few milliseconds between the check and the rename.
- **Watching:** `watch(listener)` reports changes made outside Halonic, as
  the port says. It hears the folder through `node:fs.watch`, recursive, and
  waits until the folder has been quiet for 100 ms, so a checkout arrives as
  one batch. It then reads each path the events named once and reports it as
  `changed` or `removed`. The store's own writes and removes are never
  reported, nor are its temporary files; an event that names no entry makes
  it check every file. `FolderStoreWatchOptions`, the constructor's third
  argument, sets `quietMs` and `events` (a `FolderEvents` function, for
  tests). If the system can't watch the folder, for example because Linux
  has used up `fs.inotify.max_user_watches`, the error says which limit it
  is. `close()` on the returned watch stops it.

## Runs in a folder

`new FolderRunStore(root)` passes the shared `RunStore` contract suite.

- **Files:** `<runId>.jsonl` holds the run's events, one per line, and only
  ever grows. `<runId>.snapshot.json` caches the engine's state, written
  through a temporary file that is flushed to disk and renamed over it.
  Delete it at any time; the engine then replays the log.
- **Private:** run logs and snapshots hold prompts, tool results and model
  output, so the root folder gets mode `700` (an existing folder is changed
  to it) and each log, snapshot and run lock mode `600`. Windows ignores
  these modes; the profile folder's own permissions protect the files there.
- **Links:** a log that is a symbolic link (even one to nothing), a hard
  link or not a plain file is refused on read and append with a `RangeError`,
  and nothing is written through it. A snapshot that is a link is not used
  and gives `null`.
- **List:** worked out from the logs on every call, with no cache. Deleting
  a `.jsonl` removes the run. With `startedSince`, a run that started
  earlier costs a read of its log's first line, not of the whole log.
- **Failed appends:** an append that fails, for example on a full disk,
  cuts the log back to where it was and stores nothing.
- **Crashes:** an event counts once its line break is written. A torn last
  line is skipped and cut off before the next append. A broken line in the
  middle of a log is an error naming the file and line. A snapshot that is
  missing, unreadable or ahead of the log gives `null`.
- **Run ids:** 1 to 128 letters, digits, `_`, `-` or `.`, not starting with
  a dot and not a Windows device name such as `NUL`. Anything else is a
  `RangeError`, so a run id can't leave the root. On macOS and Windows,
  `Run_1` and `run_1` are the same file. Run ids are case-sensitive, so the
  store checks the run id on the log's first line: a read under the other
  spelling finds no run (no events, `get` gives `null`), and an append under
  it throws and leaves the stored run alone. The engine's run ids are lower case.
- **Two processes:** an append holds `<runId>.lock` while it checks
  `expectedSeq` and writes, so a CLI and a desktop app writing to one run
  folder can't both win; one gets `conflict`. The lock file's format and
  rules are `RunLockRecord` in `@halonicjs/ports`, which the Tauri adapter
  follows too. An append waits while another writer holds the lock, and
  removes a lock left by a crash: one whose process no longer runs on this
  computer, or one older than `runLockStaleAfterMs` (10 seconds). On
  Windows, a lock step that fails with `EPERM` or `EBUSY`, as it does while
  another writer deletes the lock file, is tried again for up to 2 seconds.
  An append that stored its events but couldn't remove its lock still
  succeeds, so a retry doesn't conflict with its own events; the error goes
  to `onLockReleaseError`. Later appends to the run, this store's included,
  wait until the lock left behind goes stale after 10 seconds.
- **Flushed:** an append flushes its lines to disk before it reports
  success, so an event it acknowledged survives a power cut. Lock files are
  not flushed: a lock from before a power cut is stale when it is next read.
- **Limits:** if the program crashes in the middle of an append of several
  events, the first of them may be stored without the rest.

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
- **Writes** go to a temporary file that is flushed to disk and renamed over
  the record, so a reader sees the old record or the new one, also after a
  power cut. The folder is created with
  mode `700` and each file with `600`. Windows ignores these modes; the
  profile folder's own permissions protect the files there.
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
- **Writes** go through a flushed temporary file and a rename, with the same
  modes as trust records.
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
- **Writes** go through a flushed temporary file and a rename, with the same
  modes as trust records. Only the fields of the settings are written.
- **Damage:** when settings can't be read, hold another connector's key, or
  hold anything but `allowSending` as `true` or `false` and `changedAt` as
  text next to the key, `get` throws naming the connector and its
  workspace, and `remove` deletes the file without reading it. The error
  never quotes the file's text. `ConnectionSettings` in `core/app` then
  treats sending as off and tells the person why; switching sending on or
  off again replaces the file.

## The yes to run without the sandbox, in the profile

`new FileUnfencedRunConsentStore(root)` keeps the user's one yes to run
plugin and integration code without the sandbox as `consent.json` in
`root`, a folder in the user's profile such as `<profile>/unfenced-runs`,
never inside a workspace, so neither a workspace nor an agent can give the
yes. It passes the shared `UnfencedRunConsentStore` contract suite.

- **Writes** go through a flushed temporary file and a rename, with the same
  modes as trust records, and hold only the reason and the time.
- **Shape:** after `JSON.parse` the file must be exactly a non-empty
  `reason` and an `allowedAt` a `Date` can read (HAL-3385). Anything else,
  a link or a file that isn't JSON makes `get` throw, without quoting the
  file, and `UnfencedRuns` in `core/app` asks the user again. `remove`
  deletes the file without reading it.

## Every byte of a folder, for plugins

`new FileSystemFolderReader(root)` lists and reads every entry under
`root`, such as the profile's plugin folder, so the plugin service can
fingerprint each plugin's files exactly. It passes the shared
`FolderReader` contract suite.

- **Nothing is hidden:** `.git`, `.env` and other names a workspace keeps
  private are listed and read.
- **Links:** every segment is looked at with `lstat`, so a symbolic link
  or a Windows junction is listed as a link and never followed. Anything
  else that isn't a file or a folder, such as a pipe, is listed as `other`
  and never opened.
- **Reads** open the file without following a link (`O_NOFOLLOW` where the
  system has it) and check that the open handle is the same regular file
  `lstat` saw, so a file swapped for a link or a pipe in between is refused.
- **Order:** paths use `/` and are sorted by code unit on every system.
- **One level:** `entries(dir, { recursive: false })` lists only what is
  directly under `dir` (or the root); the default lists everything below it,
  up to `limit`.

## Placing and removing plugins

`new FileSystemPluginFolder(root)` is the profile's plugins folder as a
`PluginFolderWriter`: `place` writes a plugin's folder whole or not at
all, and `remove` takes one away. It passes the shared
`PluginFolderWriter` contract suite.

- **Whole or not at all:** a plugin is written into a new folder in
  `<root>.staging`, beside the plugins folder and on the same disk, then
  renamed into place as `<root>/<id>`. A replaced or removed plugin is
  renamed out to the staging folder first and deleted there, so a reader
  never lists half of one. A failed write leaves nothing in the plugins
  folder. What a crash leaves in the staging folder is deleted on the
  writer's first `place`, once it has been untouched for an hour.
- **Names:** "the same id in any case" is decided with `segmentAsOpened`,
  so it doesn't depend on the disk. `remove` acts only on the entry named
  exactly the id.
- **Links:** entries are looked at with `lstat`. `place` never replaces a
  link, and `remove` takes away a link or a Windows junction itself, never
  what it points to, also for one inside a plugin folder.

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
- **Crashes and failures:** a change counts once its line break is written,
  unless its append fails and is cut back. A torn last line is skipped and
  cut off before the next append. An append that fails cuts every log it
  added to back to where it was. Reads take no lock, so another process may
  briefly see lines that are then cut back. A broken
  line, or one for another collection, is an error naming the file and line.
- **Links:** a log that is a symbolic link, a hard link or not a plain file
  is refused on read, append and compact, as for trust records.
- **Flushed:** an append flushes its lines to disk before it reports
  success, as for run logs.

## Blobs in the profile

`new FolderBlobStore(root)` keeps attachments, large results and other
blobs in `root`, a workspace's `blobs` folder in the profile
(`workspaceFolders(...).blobsFolder()` in `@halonicjs/profile`). It passes
the shared `BlobStore` contract suite.

- **Files:** each blob is `<hash[0..2]>/<hash>`, holding only the bytes. The
  media type isn't kept, as the port allows. Folders get mode `700`, files
  `600`.
- **Writes** go to a temporary file in the blob's own folder, are flushed to
  disk and renamed into place, so the rename stays on one disk and a reader gets the whole
  blob or none. Bytes that are already stored aren't written again.
- **Paths:** a hash that isn't 64 lowercase hex characters never reaches a
  path, and a path outside the folder is refused where it is built.
- **Links:** a blob file that is a symbolic link, a hard link or not a plain
  file is refused on read, and a put replaces it.

## A lock held while a process runs

`holdLock(file, { onLost, onRenewError })` takes a lock that one process
holds for as long as it runs, such as the one engine of a workspace. It
writes the run lock's record (`RunLockRecord`) and judges a stale lock the
same way, so the lock of a crashed holder is taken over. A lock that a
live process holds is refused at once with a `LockHeldError` naming that
process; it never waits. When many processes start at once on a free
or a stale lock, never two hold it at the same time and each of the others
is refused with `LockHeldError`, which a test with real processes checks
(HAL-4236). The holder renews its lock every
`heldLockRenewEveryMs` (a third of the 10 seconds after which a lock is
stale) by writing its record again with `takenAt` now. When another
process has taken the lock over, because this one missed its renewals for
that long, `onLost` hears it and the renewals stop. A renewal that finds its
own lock already older than that limit, say after the computer slept, gives
the lock up instead of renewing it, because another process may be taking it
over at that moment; `onLost` hears that too. `release()` removes the
lock while it still holds this process's record. A lock file that is a link
to a file that isn't there fails with an error that says to remove the link.
