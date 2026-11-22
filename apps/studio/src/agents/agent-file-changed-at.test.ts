import type { Version } from "@halonicjs/studio-feature-source-control/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fileChangedAt, type VersionsOfFiles } from "./agent-file-changed-at.ts";

const writerPath = "hubs/acme/agents/writer.agent.yaml";
const chosenAt = "2026-11-09T10:00:00.000Z";

/** A version made at `at` (ISO text) that changed `files`. */
function version(id: string, at: string, files: readonly string[]): Version {
  return { id, name: `Version ${id}`, notes: "", author: "Ada", at: Date.parse(at), files };
}

/** A workspace's versions, newest first, and the files changed since each one. */
function versions(
  history: readonly Version[],
  changedSince: Record<string, readonly string[]> = {},
): VersionsOfFiles {
  return {
    readHistory: async (limit) => history.slice(0, limit),
    listChangedSince: async (id) => changedSince[id] ?? [],
  };
}

verifies("studio.agent-placement-choices", () => {
  describe("fileChangedAt", () => {
    it("gives the time of the newest version that changed the file, after the choice", async () => {
      const history = [
        version("c", "2026-11-09T16:00:00.000Z", ["hubs/acme/agents/editor.agent.yaml"]),
        version("b", "2026-11-09T14:02:00.000Z", [writerPath]),
        version("a", "2026-11-09T09:00:00.000Z", [writerPath]),
      ];
      expect(await fileChangedAt(versions(history), writerPath, chosenAt)).toBe(
        "2026-11-09T14:02:00.000Z",
      );
    });

    it("gives no time when the saved file isn't that version any more", async () => {
      const history = [version("b", "2026-11-09T14:02:00.000Z", [writerPath])];
      const changed = versions(history, { b: [writerPath] });
      expect(await fileChangedAt(changed, writerPath, chosenAt)).toBeUndefined();
    });

    it("gives no time when the newest version that changed the file is older than the choice", async () => {
      // The file was put back as it was in a version made before the choice.
      const history = [version("a", "2026-11-09T09:00:00.000Z", [writerPath])];
      expect(await fileChangedAt(versions(history), writerPath, chosenAt)).toBeUndefined();
    });

    it("gives no time when no version changed the file", async () => {
      const history = [version("c", "2026-11-09T16:00:00.000Z", ["models.yaml"])];
      expect(await fileChangedAt(versions(history), writerPath, chosenAt)).toBeUndefined();
      expect(await fileChangedAt(versions([]), writerPath, chosenAt)).toBeUndefined();
    });
  });
});
