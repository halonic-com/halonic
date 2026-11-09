import { join } from "node:path";
import { FolderDefinitionStore, FolderRunStore } from "../src/index.ts";

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
