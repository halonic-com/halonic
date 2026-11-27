import type { FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runsRailEntry } from "./rail-entry.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

verifies("runs.rail-entry", () => {
  it("shows for a workspace project", () => {
    expect(runsRailEntry.shows(workspaceProject)).toBe(true);
  });

  it("doesn't show for a code folder without items", () => {
    expect(runsRailEntry.shows({ ...workspaceProject, kind: "code-folder", hasItems: false })).toBe(
      false,
    );
  });

  it("shows for a code folder without items that has runs recorded", () => {
    expect(
      runsRailEntry.shows({
        ...workspaceProject,
        kind: "code-folder",
        hasItems: false,
        runsRecorded: true,
      }),
    ).toBe(true);
  });
});
