import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseLog, parseStatus } from "./git-output.ts";

// The status cases are ported from the old local Studio's git adapter
// (`packages/vcs/git/src/git.test.ts`), rewritten for porcelain v2.

const modes = "N... 100644 100644 100644";
const hashes = "1111111 2222222";

function status(...records: string[]) {
  return parseStatus(Buffer.from(`${records.join("\0")}\0`));
}

verifies("git.vcs", () => {
  describe("git status output", () => {
    it("reads the branch, tracking, staged and unstaged changes, renames, untracked and conflicted files", () => {
      const parsed = status(
        "# branch.oid 3333333",
        "# branch.head main",
        "# branch.upstream origin/main",
        "# branch.ab +2 -1",
        `1 M. ${modes} ${hashes} workspace.yaml`,
        `1 .M ${modes} ${hashes} models.yaml`,
        `1 MM ${modes} ${hashes} hubs/p/hub.yaml`,
        `1 .D ${modes} ${hashes} with space.yaml`,
        `2 R. ${modes} ${hashes} R100 hubs/p/agents/new.agent.yaml`,
        "hubs/p/agents/old.agent.yaml",
        "? notes.md",
        `u UU N... 100644 100644 100644 100644 ${hashes} 4444444 conflict.yaml`,
      );
      expect(parsed).toMatchObject({
        isRepo: true,
        branch: "main",
        upstream: "origin/main",
        ahead: 2,
        behind: 1,
      });
      expect(parsed.changes).toEqual([
        { path: "workspace.yaml", status: "modified", staged: true },
        { path: "models.yaml", status: "modified", staged: false },
        { path: "hubs/p/hub.yaml", status: "modified", staged: true },
        { path: "hubs/p/hub.yaml", status: "modified", staged: false },
        { path: "with space.yaml", status: "deleted", staged: false },
        {
          path: "hubs/p/agents/new.agent.yaml",
          status: "renamed",
          staged: true,
          from: "hubs/p/agents/old.agent.yaml",
        },
        { path: "notes.md", status: "untracked", staged: false },
        { path: "conflict.yaml", status: "conflicted", staged: false },
      ]);
    });

    it("reads a new repository, a detached head and an upstream that is gone", () => {
      expect(status("# branch.oid (initial)", "# branch.head main")).toMatchObject({
        branch: "main",
        upstream: null,
        ahead: 0,
      });
      expect(status("# branch.oid 3333333", "# branch.head (detached)").branch).toBeNull();
      // git gives no `branch.ab` line when the upstream branch no longer exists.
      expect(status("# branch.head main", "# branch.upstream origin/gone")).toMatchObject({
        upstream: "origin/gone",
        ahead: 0,
        behind: 0,
      });
    });
  });

  describe("git log output", () => {
    it("reads each commit, with only the first line of its message, and an empty log", () => {
      const hash = "a".repeat(40);
      const output = `${hash}\0Acme Tester\x002026-11-10T01:02:03+01:00\0First line\nSecond line\n`;
      expect(parseLog(Buffer.from(output))).toEqual([
        { hash, author: "Acme Tester", date: "2026-11-10T00:02:03.000Z", message: "First line" },
      ]);
      expect(parseLog(Buffer.alloc(0))).toEqual([]);
    });
  });
});
