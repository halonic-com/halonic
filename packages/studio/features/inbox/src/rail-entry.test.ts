import type { FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { inboxRailEntry } from "./rail-entry.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

verifies("inbox.rail-entry", () => {
  it("shows for a workspace project", () => {
    expect(inboxRailEntry.shows(workspaceProject)).toBe(true);
  });

  it("doesn't show for a code folder without items", () => {
    expect(
      inboxRailEntry.shows({ ...workspaceProject, kind: "code-folder", hasItems: false }),
    ).toBe(false);
  });

  it("shows for a code folder without items where an item waits", () => {
    expect(
      inboxRailEntry.shows({
        ...workspaceProject,
        kind: "code-folder",
        hasItems: false,
        waitingCount: 1,
      }),
    ).toBe(true);
  });
});
