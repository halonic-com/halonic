import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import type { FolderFacts, RailEntryContribution, RailEntryId } from "./rail.ts";

const workspaceProject: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

const emptyCodeFolder: FolderFacts = { ...workspaceProject, kind: "code-folder", hasItems: false };

function entry(
  id: RailEntryId,
  order: number,
  shows: (facts: FolderFacts) => boolean = () => true,
): RailEntryContribution {
  return { id, label: id, icon: id, order, holds: [id], opens: id, shows };
}

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

function shownIds(studioFeatures: ReturnType<typeof feature>[], facts: FolderFacts) {
  const shell = createShell({ features: studioFeatures });
  return shell.contributions.rail.shown(facts).map((shown) => shown.id);
}

verifies("shell.rail-entries", () => {
  describe("order", () => {
    it("shows Home, the features' entries by order, then Settings, whatever order they register in", () => {
      const ids = shownIds(
        [
          feature("runs", (studio) => studio.rail.add(entry("runs", 50))),
          feature("inbox", (studio) => studio.rail.add(entry("inbox", 40))),
          feature("code", (studio) => studio.rail.add(entry("code", 10))),
        ],
        workspaceProject,
      );
      expect(ids).toEqual(["home", "code", "inbox", "runs", "settings"]);
    });

    it("shows only Home and Settings while no feature adds an entry", () => {
      expect(shownIds([], emptyCodeFolder)).toEqual(["home", "settings"]);
    });

    it("records which feature added each entry", () => {
      const shell = createShell({
        features: [feature("inbox", (studio) => studio.rail.add(entry("inbox", 40)))],
      });
      const shown = shell.contributions.rail.shown(workspaceProject);
      expect(shown.map((item) => item.featureId)).toEqual(["shell", "inbox", "shell"]);
    });
  });

  describe("rules", () => {
    const library = feature("library", (studio) =>
      studio.rail.add(entry("library", 20, (facts) => facts.hasItems)),
    );

    it("leaves out an entry whose rule doesn't hold for the folder", () => {
      expect(shownIds([library], workspaceProject)).toEqual(["home", "library", "settings"]);
      expect(shownIds([library], emptyCodeFolder)).toEqual(["home", "settings"]);
    });

    it("keeps the entry the active tab shows even when its rule no longer holds", () => {
      const shell = createShell({ features: [library] });
      const shown = shell.contributions.rail.shown(emptyCodeFolder, "library");
      expect(shown.map((item) => item.id)).toEqual(["home", "library", "settings"]);
    });

    it("gives every rule the same facts", () => {
      const seen: FolderFacts[] = [];
      const watch = (facts: FolderFacts) => {
        seen.push(facts);
        return true;
      };
      shownIds(
        [
          feature("inbox", (studio) => studio.rail.add(entry("inbox", 40, watch))),
          feature("runs", (studio) => studio.rail.add(entry("runs", 50, watch))),
        ],
        workspaceProject,
      );
      expect(seen).toEqual([workspaceProject, workspaceProject]);
    });
  });

  describe("errors", () => {
    function creating(...studioFeatures: ReturnType<typeof feature>[]) {
      return () => createShell({ features: studioFeatures });
    }

    it("throws for an entry the shell adds itself", () => {
      const adder = feature("gear", (studio) =>
        studio.rail.add({ ...entry("inbox", 1), id: "settings" as RailEntryId }),
      );
      expect(creating(adder)).toThrow(ShellError);
      expect(creating(adder)).toThrow(/"gear" adds the entry "settings", which the shell adds/);
    });

    it("throws for an entry that isn't one of the rail's", () => {
      const adder = feature("charts", (studio) =>
        studio.rail.add({ ...entry("inbox", 1), id: "dashboards" as RailEntryId }),
      );
      expect(creating(adder)).toThrow(/"charts" adds the entry "dashboards".*code, library/);
    });

    it("throws when two features add the same entry, naming both", () => {
      const inbox = feature("inbox", (studio) => studio.rail.add(entry("inbox", 40)));
      const mail = feature("mail", (studio) => studio.rail.add(entry("inbox", 41)));
      expect(creating(inbox, mail)).toThrow(/"inbox" is added by both "inbox" and "mail"/);
    });

    it("throws for an entry with an empty name", () => {
      const adder = feature("runs", (studio) =>
        studio.rail.add({ ...entry("runs", 50), label: " " }),
      );
      expect(creating(adder)).toThrow(/"runs" gives the entry "runs" no label/);
    });
  });
});
