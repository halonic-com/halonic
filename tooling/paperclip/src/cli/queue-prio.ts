import { readFileSync } from "node:fs";
import { type PrioPull, type PrioTask, queuePrio } from "../rules/queue-prio.ts";

/**
 * pnpm exec node tooling/paperclip/src/cli/queue-prio.ts < snapshot.json
 *
 * Prints the merge queue's fill order for one snapshot, so it can be checked
 * against the Writer session's `prio.json` before the Merger calls
 * `queuePrio` itself. Reads nothing but standard input and needs no token.
 *
 * The snapshot is `{ "now"?, "ranked": PrioPull[], "open"?: PrioPull[],
 * "tasks": PrioTask[] }`. `open` defaults to `ranked`; `now` to the clock.
 */

interface Snapshot {
  readonly now?: string;
  readonly ranked: readonly PrioPull[];
  readonly open?: readonly PrioPull[];
  readonly tasks: readonly PrioTask[];
}

function readSnapshot(text: string): Snapshot | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "standard input isn't JSON.";
  }
  if (typeof value !== "object" || value === null) {
    return "the snapshot must be a JSON object.";
  }
  const snapshot = value as Partial<Snapshot>;
  if (!Array.isArray(snapshot.ranked) || !Array.isArray(snapshot.tasks)) {
    return 'the snapshot needs a "ranked" and a "tasks" list.';
  }
  return snapshot as Snapshot;
}

const snapshot = readSnapshot(readFileSync(0, "utf8"));
if (typeof snapshot === "string") {
  console.error(`queue-prio: ${snapshot}`);
  process.exitCode = 2;
} else {
  const now = snapshot.now === undefined ? new Date() : new Date(snapshot.now);
  if (Number.isNaN(now.getTime())) {
    console.error(`queue-prio: "now" isn't a time: ${snapshot.now}`);
    process.exitCode = 2;
  } else {
    const ranked = queuePrio({
      ranked: snapshot.ranked,
      open: snapshot.open ?? snapshot.ranked,
      tasks: snapshot.tasks,
      now,
    });
    console.log(JSON.stringify({ at: now.toISOString(), order: ranked }, null, 2));
  }
}
