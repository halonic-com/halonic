import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Snapshot } from "../snapshot/shape.ts";
import { now, pull, repo } from "./fast-track.test-helper.ts";
import { defaultSharedLabelList, readSharedLabelList, sharedLabelScope } from "./scope.ts";

/** Tasks by identifier: HAL-501 and HAL-502 are children of HAL-17422, HAL-503 of HAL-9. */
const parentIds: Record<string, string | null> = {
  "HAL-17422": null,
  "HAL-9": null,
  "HAL-501": "id-HAL-17422",
  "HAL-502": "id-HAL-17422",
  "HAL-503": "id-HAL-9",
};

function fakeIssues() {
  const reads: string[] = [];
  return {
    reads,
    issues: {
      async get(task: string) {
        reads.push(task);
        return task in parentIds
          ? ({ id: `id-${task}`, parentId: parentIds[task] } as never)
          : null;
      },
    },
  };
}

function labelled(number: number, by: string, branch: string) {
  return pull(
    number,
    { labels: [{ name: "fast-track", addedBy: by, addedAt: now.toISOString() }] },
    { branch },
  );
}

const snapshot: Snapshot = {
  takenAt: now.toISOString(),
  repos: [
    repo([
      labelled(1, "halonic-dev", "mateo/HAL-501-apps"),
      labelled(2, "halonic-dev", "mateo/HAL-503-other"),
      labelled(3, "board-member", "mateo/HAL-502-apps"),
      labelled(4, "halonic-dev", "no-task-branch"),
    ]),
  ],
} as unknown as Snapshot;

verifies("paperclip.fast-track-rules", () => {
  test("reads the list from the setting, and the board's list when it isn't set", () => {
    expect(readSharedLabelList(undefined)).toEqual(defaultSharedLabelList);
    expect(readSharedLabelList("HAL-1")).toEqual(defaultSharedLabelList);
    expect(readSharedLabelList([])).toEqual({ parents: [], pulls: [] });
    expect(
      readSharedLabelList([" HAL-9 ", "acme/tools#12", "#12", "hal-3", 7, "acme/tools#0"]),
    ).toEqual({ parents: ["HAL-9"], pulls: ["acme/tools#12"] });
  });

  test("keeps the tasks of halonic-dev's labelled pull requests whose parent is listed", async () => {
    const { issues, reads } = fakeIssues();
    const scope = await sharedLabelScope(
      issues,
      "acme",
      snapshot,
      defaultSharedLabelList,
      "halonic-dev",
    );
    expect([...scope.tasks]).toEqual(["HAL-501"]);
    expect([...scope.pulls]).toEqual(defaultSharedLabelList.pulls);
    // The board's own label (#3) and a branch without a task (#4) need no read.
    expect(reads).toEqual(["HAL-17422", "HAL-501", "HAL-503"]);
  });

  test("reads no task when no parent is listed", async () => {
    const { issues, reads } = fakeIssues();
    const list = { parents: [], pulls: ["acme/tools#2"] };
    const scope = await sharedLabelScope(issues, "acme", snapshot, list, "halonic-dev");
    expect(scope).toEqual({ pulls: new Set(["acme/tools#2"]), tasks: new Set() });
    expect(reads).toEqual([]);
  });
});
