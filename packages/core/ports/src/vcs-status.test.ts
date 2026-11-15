import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseStatus } from "./vcs-status.ts";

const modes = "N... 100644 100644 100644";
const hashes = "1111111 2222222";
const ordinaryRecord = (xy: string, path: string) => `1 ${xy} ${modes} ${hashes} ${path}`;

function status(...records: string[]) {
  return parseStatus(`${records.join("\0")}\0`);
}

verifies("ports.vcs-status-output", () => {
  describe("the branch header", () => {
    it("reads the branch, what it tracks and how far apart they are", () => {
      expect(
        status(
          "# branch.oid 3333333",
          "# branch.head main",
          "# branch.upstream origin/main",
          "# branch.ab +2 -1",
        ),
      ).toMatchObject({
        isRepo: true,
        branch: "main",
        upstream: "origin/main",
        ahead: 2,
        behind: 1,
      });
    });

    it("reads a new repository, a detached head and an upstream that is gone", () => {
      expect(status("# branch.oid (initial)", "# branch.head main")).toMatchObject({
        branch: "main",
        upstream: null,
        ahead: 0,
      });
      expect(status("# branch.head (detached)").branch).toBeNull();
      // git gives no `branch.ab` line when the upstream branch no longer exists.
      expect(status("# branch.head main", "# branch.upstream origin/gone")).toMatchObject({
        upstream: "origin/gone",
        ahead: 0,
        behind: 0,
      });
    });

    it("gives no branch for output without header lines", () => {
      expect(status(ordinaryRecord(".M", "models.yaml"))).toMatchObject({
        branch: null,
        upstream: null,
        ahead: 0,
        behind: 0,
      });
    });
  });

  describe("the changes", () => {
    it("reads a modified, an added, a deleted and an untracked file", () => {
      expect(
        status(
          ordinaryRecord(".M", "hubs/sales/hub.yaml"),
          ordinaryRecord("A.", "skills/tone/SKILL.md"),
          ordinaryRecord(".D", "with space.yaml"),
          "? notes.txt",
        ).changes,
      ).toEqual([
        { path: "hubs/sales/hub.yaml", status: "modified", staged: false },
        { path: "skills/tone/SKILL.md", status: "added", staged: true },
        { path: "with space.yaml", status: "deleted", staged: false },
        { path: "notes.txt", status: "untracked", staged: false },
      ]);
    });

    it("gives two changes for a path changed in the index and again in the tree", () => {
      expect(status(ordinaryRecord("MM", "models.yaml")).changes).toEqual([
        { path: "models.yaml", status: "modified", staged: true },
        { path: "models.yaml", status: "modified", staged: false },
      ]);
    });

    it("keeps spaces in a path and reads a rename with its old path", () => {
      const rename = `2 R. ${modes} ${hashes} R100 hubs/Sales team/new.yaml`;
      expect(status(rename, "hubs/Sales team/old.yaml").changes).toEqual([
        {
          path: "hubs/Sales team/new.yaml",
          status: "renamed",
          staged: true,
          from: "hubs/Sales team/old.yaml",
        },
      ]);
    });

    it("reads a conflicted file", () => {
      const conflict = `u UU ${modes} 100644 ${hashes} 4444444 hub.yaml`;
      expect(status(conflict).changes).toEqual([
        { path: "hub.yaml", status: "conflicted", staged: false },
      ]);
    });

    it("reads nothing from an empty answer", () => {
      expect(parseStatus("").changes).toEqual([]);
    });
  });
});
