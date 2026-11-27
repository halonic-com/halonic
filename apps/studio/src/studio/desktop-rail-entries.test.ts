import { createShell, type FolderFacts } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

const codeFolder: FolderFacts = { ...workspaceProject, kind: "code-folder", hasItems: false };

function shownNames(facts: FolderFacts): string[] {
  const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });
  return shell.contributions.rail.shown(facts).map((entry) => entry.label);
}

verifies("studio.desktop-rail-entries", () => {
  it.each([
    [
      "a workspace project",
      workspaceProject,
      ["Home", "Library", "Messenger", "Inbox", "Runs", "Changes", "Settings"],
    ],
    [
      "a workspace project with a code folder inside",
      { ...workspaceProject, hasCodeFolderInside: true },
      ["Home", "Code", "Library", "Messenger", "Inbox", "Runs", "Changes", "Settings"],
    ],
    ["a code folder without items", codeFolder, ["Home", "Code", "Changes", "Settings"]],
    [
      "a code folder without items where an item waits",
      { ...codeFolder, waitingCount: 2 },
      ["Home", "Code", "Inbox", "Changes", "Settings"],
    ],
    [
      "a code folder without items that has runs recorded",
      { ...codeFolder, runsRecorded: true },
      ["Home", "Code", "Runs", "Changes", "Settings"],
    ],
    [
      "a code folder with items",
      { ...codeFolder, hasItems: true },
      ["Home", "Code", "Library", "Messenger", "Inbox", "Runs", "Changes", "Settings"],
    ],
    [
      "a code folder without git",
      { ...codeFolder, git: "not-a-repository" },
      ["Home", "Code", "Changes", "Settings"],
    ],
  ] satisfies [string, FolderFacts, string[]][])(
    "lists the entries for %s",
    (_name, facts, names) => {
      expect(shownNames(facts)).toEqual(names);
    },
  );
});
