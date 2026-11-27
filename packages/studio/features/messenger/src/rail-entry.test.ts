import type { FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { messengerRailEntry } from "./rail-entry.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

verifies("messenger.rail-entry", () => {
  it("shows for a workspace project", () => {
    expect(messengerRailEntry.shows(workspaceProject)).toBe(true);
  });

  it("doesn't show for a code folder without items", () => {
    expect(
      messengerRailEntry.shows({ ...workspaceProject, kind: "code-folder", hasItems: false }),
    ).toBe(false);
  });

  it("shows for a code folder with items", () => {
    expect(messengerRailEntry.shows({ ...workspaceProject, kind: "code-folder" })).toBe(true);
  });
});
