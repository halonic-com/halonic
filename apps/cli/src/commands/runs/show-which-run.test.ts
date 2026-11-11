import { mkdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  done,
  makeAcmeRuns,
  removeAcmeRuns,
  type StoredRun,
  storeRuns as storeAcmeRuns,
  today,
  waiting,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;
let folder: string;
let acme: string;

const runsCommand = () => runsCommandWith(acmeRunsSetup(acmeRuns));

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show");
  ({ folder, acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const storeRuns = (...runs: readonly StoredRun[]) => storeAcmeRuns(acmeRuns, ...runs);

async function showIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["runs", "show", ...args], io, [runsCommand()]);
  return { code, io };
}

// The run `runs show` picks (by id, in any case) and its --json form.
verifies("cli.commands.runs.show", () => {
  describe("which run", () => {
    it("takes the short id in any case, or the full id", async () => {
      await storeRuns(done);

      for (const typed of ["A1B2C3", done.id, done.id.toUpperCase()]) {
        const { code, io } = await showIn(acme, typed);
        expect(code).toBe(exitCode.ok);
        expect(io.stdout[0]).toContain("run a1b2c3");
      }
    });

    it("says there's no such run, and points to the list with the user's --dir", async () => {
      await storeRuns(done);

      const { code, io } = await showIn(folder, "01jd8x", "--dir", "acme");

      expect(code).toBe(exitCode.notFound);
      expect(io.stdout).toEqual([]);
      expect(io.stderr).toEqual([
        "✕ There's no run 01jd8x in acme.",
        `  See recent runs with halonic runs --dir .${sep}acme.`,
      ]);
    });

    it("asks for the full id when two runs end in the same short id", async () => {
      await storeRuns(done, { ...waiting, id: "run_mfx3k2a2_a1b2c3" });

      const { code, io } = await showIn(acme, "A1B2C3");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ Two runs in acme end in a1b2c3.",
        "  Use the full id, as halonic runs --json shows it.",
      ]);
    });

    it("takes exactly one run id", async () => {
      const none = await showIn(acme);
      expect(none.code).toBe(exitCode.usage);
      expect(none.io.stderr).toEqual([
        "✕ halonic runs show needs a run id.",
        "  Usage: halonic runs show <run-id> [--dir <folder>]",
      ]);

      const two = await showIn(acme, "a1b2c3", "09d9a0");
      expect(two.io.stderr[0]).toBe(
        "✕ halonic runs show takes one run id, and you gave two: a1b2c3, 09d9a0.",
      );
    });

    it("shows an escape code in the id the user typed, or a bidi control in the folder name, as its code", async () => {
      const shared = join(folder, "ac\u202eme");
      await writeFiles(shared, { "workspace.yaml": "id: acme\nname: Acme\n" });
      await storeAcmeRuns({ ...acmeRuns, acme: shared }, done);

      const heading = await showIn(shared, "a1b2c3");
      expect(heading.io.stdout[0]).toBe(
        "support-reply in ac\\u202eme · run a1b2c3 · started 10:31, finished 10:31",
      );
      const missing = await showIn(shared, "01jd8x");
      expect(missing.io.stderr[0]).toBe("✕ There's no run 01jd8x in ac\\u202eme.");
      const two = await showIn(acme, "\u001b[31ma1b2c3", "09d9a0");
      expect(two.io.stderr[0]).toBe(
        "✕ halonic runs show takes one run id, and you gave two: \\u001b[31ma1b2c3, 09d9a0.",
      );
      await mkdir(join(folder, "downloads"));
      const nowhere = await showIn(folder, "\u001b[31ma1b2c3", "--dir", "downloads");
      expect(nowhere.io.stderr[0]).toBe(
        "✕ Couldn't show run \\u001b[31ma1b2c3: there's no workspace.yaml here.",
      );
    });

    it("says the folder holds no workspace", async () => {
      await mkdir(join(folder, "downloads"));

      const { code, io } = await showIn(folder, "a1b2c3", "--dir", "downloads");

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toBe("✕ Couldn't show run a1b2c3: there's no workspace.yaml here.");
    });
  });

  describe("--json", () => {
    it("gives the run's events, oldest first, with the full id", async () => {
      await storeRuns(done);

      const { code, io } = await showIn(acme, "a1b2c3", "--json");

      expect(code).toBe(exitCode.ok);
      const output = JSON.parse(io.stdout.join("\n")) as {
        events: { type: string; runId: string; at: string }[];
      };
      expect(output.events.map((event) => event.type)).toEqual([
        "run.started",
        "state.entered",
        "run.completed",
      ]);
      expect(output.events.every((event) => event.runId === done.id)).toBe(true);
      expect(output.events[0]?.at).toBe(today("10:31:00"));
    });
  });
});
