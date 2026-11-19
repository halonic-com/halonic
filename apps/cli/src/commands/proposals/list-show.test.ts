import { sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { acmeProposalsSetup, editSaved, proposeIn } from "../../test/acme-proposals.ts";
import { type AcmeRuns, makeAcmeRuns, removeAcmeRuns, writeFiles } from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { proposalsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("proposals");
  await writeFiles(acmeRuns.acme, { "notes/today.md": "Two tickets.\n" });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

async function proposalsIn(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const command = proposalsCommandWith(acmeProposalsSetup(acmeRuns));
  const code = await runCli(["proposals", ...args], io, [command]);
  return { code, io };
}

verifies("cli.commands.proposals.list", () => {
  describe("the list", () => {
    it("lists each open proposal with its files and when the run finished", async () => {
      await proposeIn(acmeRuns, "run_mfx3k2a1_01jd8q", {
        "notes/today.md": "Three tickets.\n",
        "notes/new.md": "New.\n",
      });

      const { code, io } = await proposalsIn(acmeRuns.acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "01jd8q   2 files   5 minutes ago",
        "",
        "See one with halonic proposals show <run-id>.",
      ]);
    });

    it("says when nothing is waiting, and exits 0", async () => {
      const { code, io } = await proposalsIn(acmeRuns.acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual(["No run in Acme has changes waiting for you."]);
    });

    it("gives the proposals with full ids with --json", async () => {
      await proposeIn(acmeRuns, "run_mfx3k2a1_01jd8q", { "notes/today.md": "Three tickets.\n" });

      const { io } = await proposalsIn(acmeRuns.acme, "--json");

      const json = JSON.parse(io.stdout.join("\n"));
      expect(
        json.proposals.map((each: { proposal: { runId: string } }) => each.proposal.runId),
      ).toEqual(["run_mfx3k2a1_01jd8q"]);
    });
  });
});

verifies("cli.commands.proposals.show", () => {
  describe("one proposal", () => {
    it("shows each file with its diff, then how to decide", async () => {
      await proposeIn(acmeRuns, "run_mfx3k2a1_01jd8q", {
        "notes/today.md": "Three tickets.\n",
        "notes/new.md": "New.\n",
      });

      const { code, io } = await proposalsIn(acmeRuns.acme, "show", "01JD8Q");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Run 01jd8q proposes changes to 2 files in Acme.",
        "",
        "added  notes/new.md",
        "  @@ -0,0 +1,1 @@",
        "  +New.",
        "",
        "modified  notes/today.md",
        "  @@ -1,1 +1,1 @@",
        "  -Two tickets.",
        "  +Three tickets.",
      ]);
    });

    it("says when a file changed since the run, with the diff from the file now", async () => {
      await proposeIn(acmeRuns, "run_mfx3k2a1_01jd8q", { "notes/today.md": "Three tickets.\n" });
      await editSaved(acmeRuns, "notes/today.md", "Four tickets.\n");

      const { io } = await proposalsIn(acmeRuns.acme, "show", "01jd8q");

      expect(io.stdout.slice(2, 6)).toEqual([
        "modified  notes/today.md",
        "  This file changed since the run, so accept won't write it. The diff is from your file now.",
        "  @@ -1,1 +1,1 @@",
        "  -Four tickets.",
      ]);
    });

    it("points to the list, with the user's --dir, for an unknown id", async () => {
      const { code, io } = await proposalsIn(acmeRuns.folder, "show", "01jd8x", "--dir", "acme");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr).toEqual([
        "✕ No changes from run 01jd8x are waiting in Acme.",
        `  See the proposals with halonic proposals --dir .${sep}acme.`,
      ]);
    });

    it("asks for the full id when two proposals end in the same short id", async () => {
      await proposeIn(acmeRuns, "run_mfx3k2a1_01jd8q", { "notes/today.md": "A\n" });
      await proposeIn(acmeRuns, "run_mfx3k2a2_01jd8q", { "notes/today.md": "B\n" });

      const { code, io } = await proposalsIn(acmeRuns.acme, "show", "01jd8q");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe("✕ Two proposals in Acme end in 01jd8q.");
    });

    it("is a usage error without a run id", async () => {
      const { code } = await proposalsIn(acmeRuns.acme, "show");

      expect(code).toBe(exitCode.usage);
    });
  });
});
