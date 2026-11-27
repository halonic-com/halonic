import type { FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { changesRailEntry } from "./rail-entry.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

verifies("source-control.rail-entry", () => {
  it("shows for a workspace project", () => {
    expect(changesRailEntry.shows(workspaceProject)).toBe(true);
  });

  it("shows for a code folder without git", () => {
    expect(
      changesRailEntry.shows({
        ...workspaceProject,
        kind: "code-folder",
        hasItems: false,
        git: "not-a-repository",
      }),
    ).toBe(true);
  });

  it("shows for a folder on a computer without git", () => {
    expect(changesRailEntry.shows({ ...workspaceProject, git: "no-git-program" })).toBe(true);
  });
});
