import { mkdir } from "node:fs/promises";
import { join, sep } from "node:path";
import type { RunEvent } from "@halonicjs/events";
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
  running,
  type StoredRun,
  storeRuns as storeAcmeRuns,
  today,
  waiting,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { runsCommandWith } from "./command.ts";

let acmeRuns: AcmeRuns;
let folder: string;
let acme: string;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-send");
  ({ folder, acme } = acmeRuns);
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const storeRuns = (...runs: readonly StoredRun[]) => storeAcmeRuns(acmeRuns, ...runs);

async function sendIn(
  cwd: string,
  args: readonly string[],
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const commands = [runsCommandWith(acmeRunsSetup(acmeRuns))];
  const code = await runCli(["runs", "send", ...args], io, commands);
  return { code, io };
}

/** The run's events as they are in its log, to see that nothing was sent. */
async function eventsOf(runId: string): Promise<readonly RunEvent[]> {
  return (await openWorkspaceRuns(acme, acmeRuns.profile)).events(runId);
}

/** A run that finished 2 minutes before noon. */
const justDone: StoredRun = {
  id: "run_mfx3k2a1_0f0e0d",
  start: today("11:57:00"),
  after: [
    [today("11:57:01"), { type: "state.entered", state: "draft" }],
    [today("11:58:00"), { type: "run.completed", state: "draft", context: {} }],
  ],
};

verifies("cli.commands.runs.send", () => {
  describe("an event the waiting step doesn't take", () => {
    it("says which events the step takes, and the one that's close", async () => {
      await storeRuns(waiting);

      const typo = await sendIn(acme, ["09d9a0", "aprove"]);
      expect(typo.code).toBe(exitCode.usage);
      expect(typo.io.stderr).toEqual([
        "✕ Couldn't send aprove to run 09d9a0: the step Approve this reply? takes approve or reject.",
        "  Did you mean approve?",
      ]);

      const other = await sendIn(acme, ["09d9a0", "hold"]);
      expect(other.io.stderr[1]).toBe("  Run halonic runs show 09d9a0 to see the step.");
      expect(await eventsOf(waiting.id)).toHaveLength(3);
    });
  });

  describe("a run that isn't waiting", () => {
    it("says when it ended, and sends nothing", async () => {
      await storeRuns(justDone, done);

      const recent = await sendIn(acme, ["0f0e0d", "approve"]);
      expect(recent.code).toBe(exitCode.conflict);
      expect(recent.io.stderr).toEqual([
        "✕ Couldn't send approve to run 0f0e0d: it isn't waiting for you. It finished 2 min ago.",
        "  See it with halonic runs show 0f0e0d.",
      ]);

      const earlier = await sendIn(acme, ["a1b2c3", "approve"]);
      expect(earlier.io.stderr[0]).toBe(
        "✕ Couldn't send approve to run a1b2c3: it isn't waiting for you. It finished at 10:31.",
      );
    });

    it("names the step a running run is in", async () => {
      await storeRuns(running);

      const { code, io } = await sendIn(acme, ["09d9c0", "approve"]);

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't send approve to run 09d9c0: it isn't waiting for you. It's running, in the step Draft a reply.",
      );
    });
  });

  describe("which run", () => {
    it("points to the waiting runs when there's no such run", async () => {
      await storeRuns(waiting);

      const { code, io } = await sendIn(folder, ["01jd8x", "approve", "--dir", "acme"]);

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr).toEqual([
        "✕ Couldn't send approve: there's no run 01jd8x in acme.",
        `  See the runs waiting for you with halonic runs --dir .${sep}acme --status waiting.`,
      ]);
    });

    it("asks for the full id when two runs end in the same short id", async () => {
      await storeRuns(waiting, { ...done, id: "run_mfx3k2a2_09d9a0" });

      const { code, io } = await sendIn(acme, ["09d9a0", "approve"]);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ Couldn't send approve: two runs in acme end in 09d9a0.",
        "  Use the full id, as halonic runs --json shows it.",
      ]);
    });

    it("takes a run id and an event", async () => {
      const none = await sendIn(acme, ["09d9a0"]);
      expect(none.code).toBe(exitCode.usage);
      expect(none.io.stderr).toEqual([
        "✕ halonic runs send needs a run id and an event.",
        "  Usage: halonic runs send <run-id> <event> [--dir <folder>]",
      ]);

      const three = await sendIn(acme, ["09d9a0", "approve", "reject"]);
      expect(three.io.stderr[0]).toBe(
        "✕ halonic runs send takes a run id and an event, and you gave three: 09d9a0, approve, reject.",
      );
    });

    it("says the folder holds no workspace", async () => {
      await mkdir(join(folder, "downloads"));

      const { code, io } = await sendIn(folder, ["09d9a0", "approve", "--dir", "downloads"]);

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't send approve to run 09d9a0: there's no workspace.yaml here.",
      );
    });
  });
});
