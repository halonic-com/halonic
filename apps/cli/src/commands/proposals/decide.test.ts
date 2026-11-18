import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { acmeProposalsSetup, editSaved, proposeIn, savedFile } from "../../test/acme-proposals.ts";
import { type AcmeRuns, makeAcmeRuns, removeAcmeRuns, writeFiles } from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { proposalsCommandWith } from "./command.ts";

const runId = "run_mfx3k2a1_01jd8q";
let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("proposals-decide");
  await writeFiles(acmeRuns.acme, { "notes/today.md": "Two tickets.\n" });
  await proposeIn(acmeRuns, runId, {
    "notes/today.md": "Three tickets.\n",
    "notes/new.md": "New.\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

async function proposalsIn(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = proposalsCommandWith(acmeProposalsSetup(acmeRuns));
  const code = await runCli(["proposals", ...args], io, [command]);
  return { code, io };
}

verifies("cli.commands.proposals.decide", () => {
  describe("accept", () => {
    it("writes every file, and the proposal is done", async () => {
      const { code, io } = await proposalsIn("accept", "01jd8q");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Wrote 2 files: notes/new.md and notes/today.md.",
        "Run 01jd8q's proposal is done.",
      ]);
      expect(await savedFile(acmeRuns, "notes/today.md")).toBe("Three tickets.\n");
      expect(await savedFile(acmeRuns, "notes/new.md")).toBe("New.\n");
      expect((await proposalsIn()).io.stdout).toEqual([
        "No run in Acme has changes waiting for you.",
      ]);
    });

    it("writes only the file named, and says what is left", async () => {
      const { io } = await proposalsIn("accept", "01jd8q", "notes/new.md");

      expect(io.stdout).toEqual([
        "Wrote 1 file: notes/new.md.",
        "1 file is still to decide: halonic proposals show 01jd8q.",
      ]);
      expect(await savedFile(acmeRuns, "notes/today.md")).toBe("Two tickets.\n");
    });

    it("keeps an edit made since the run, names the file and exits 5", async () => {
      await editSaved(acmeRuns, "notes/today.md", "Four tickets.\n");

      const { code, io } = await proposalsIn("accept", "01jd8q");

      expect(code).toBe(exitCode.conflict);
      expect(io.stdout).toEqual([
        "Wrote 1 file: notes/new.md.",
        "notes/today.md changed since the run, so it wasn't written. Edit by hand, or discard.",
        "1 file is still to decide: halonic proposals show 01jd8q.",
      ]);
      expect(await savedFile(acmeRuns, "notes/today.md")).toBe("Four tickets.\n");
    });

    it("refuses a file the proposal doesn't change", async () => {
      const { code, io } = await proposalsIn("accept", "01jd8q", "notes/other.md");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toBe("✕ Run 01jd8q proposes no change to notes/other.md.");
    });

    it("is a usage error with more than one file", async () => {
      const { code } = await proposalsIn("accept", "01jd8q", "notes/new.md", "notes/today.md");

      expect(code).toBe(exitCode.usage);
    });
  });

  describe("discard", () => {
    it("leaves the saved files as they are, and the proposal is done", async () => {
      const { code, io } = await proposalsIn("discard", "01jd8q");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Discarded the changes to 2 files. Your files stay as they are.",
        "Run 01jd8q's proposal is done.",
      ]);
      expect(await savedFile(acmeRuns, "notes/today.md")).toBe("Two tickets.\n");
      expect(await savedFile(acmeRuns, "notes/new.md")).toBeNull();
    });

    it("discards only the file named", async () => {
      const { io } = await proposalsIn("discard", "01jd8q", "notes/today.md");

      expect(io.stdout).toEqual([
        "Discarded the changes to 1 file. Your files stay as they are.",
        "1 file is still to decide: halonic proposals show 01jd8q.",
      ]);
    });
  });
});
