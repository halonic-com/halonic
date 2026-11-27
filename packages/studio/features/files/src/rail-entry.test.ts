import type { FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { codeRailEntry } from "./rail-entry.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

verifies("files.rail-entry", () => {
  it("shows for a code folder", () => {
    expect(codeRailEntry.shows({ ...workspaceProject, kind: "code-folder", hasItems: false })).toBe(
      true,
    );
  });

  it("shows for a workspace project with a code folder inside", () => {
    expect(codeRailEntry.shows({ ...workspaceProject, hasCodeFolderInside: true })).toBe(true);
  });

  it("doesn't show for a workspace project without one", () => {
    expect(codeRailEntry.shows(workspaceProject)).toBe(false);
  });
});
