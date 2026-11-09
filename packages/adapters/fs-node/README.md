# @halonicjs/adapter-fs-node

The `DefinitionStore` and `RunStore` ports on the local file system with
Node: workspace files are plain files under a root folder, and each run is a
JSONL log. The CLI (`halonic validate`, `test`, `run`) and the parity run use
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
  callers, not against other programs writing into its root. A write
  replaces the file in place, without a temporary file.

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
- **Limits:** appends to one run go one at a time inside one process, so
  `expectedSeq` holds there. Two processes must not write to the same run
  folder. A log survives a crash of the program, not of the machine: there
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
