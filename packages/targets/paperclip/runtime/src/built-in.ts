import { SNAPSHOT_FORMAT, type WorkspaceSnapshot } from "@halonicjs/format";
import { checkedSnapshot } from "./pinned-snapshot.ts";

/**
 * The snapshot built into a plugin. The builder writes it as `snapshot.json`
 * next to `worker.js`, so `worker.js` stays the same file in every plugin.
 * It is checked like any fetched snapshot: one the runtime refuses, or none
 * at all, leaves every tool off.
 */

/** The snapshot with no tools, which a plugin without a usable built-in one serves. */
export const emptySnapshot: WorkspaceSnapshot = {
  format: SNAPSHOT_FORMAT,
  workspace: { name: "none", commit: "0".repeat(40) },
  tools: [],
};

/** Reads JSON data from a file next to the worker. */
export type ReadJson = (relativePath: string) => Promise<unknown>;

/** The built-in snapshot, and why it is empty when it is. */
export async function builtInSnapshot(
  readJson: ReadJson,
): Promise<{ readonly snapshot: WorkspaceSnapshot; readonly problem?: string }> {
  let data: unknown;
  try {
    data = await readJson("./snapshot.json");
  } catch (error) {
    return {
      snapshot: emptySnapshot,
      problem: `no built-in snapshot: ${(error as Error).message}`,
    };
  }
  try {
    return { snapshot: checkedSnapshot(data) };
  } catch (error) {
    return { snapshot: emptySnapshot, problem: (error as Error).message };
  }
}
