import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  type StoredRun,
  storeRuns,
  today,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

// `runs show` on a run whose model call waits for the answer to Studio's
// "Allow this address?": the question and where to answer it (HAL-16221).

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-address-question");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const question = { provider: "gateway", key: "gateway-key", origin: "https://gw.example" };

/** Support reply in Draft a reply since 10:53, its model call asked about the address at 10:53:05. */
const asked: StoredRun = {
  id: "run_mfx3k2a1_0a0a0a",
  start: today("10:53:00"),
  after: [
    [today("10:53:01"), { type: "state.entered", state: "draft" }],
    [today("10:53:05"), { type: "key-origin.asked", ...question }],
  ],
};

async function show(typed: string): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = runsCommandWith(acmeRunsSetup(acmeRuns));
  const code = await runCli(["runs", "show", typed], io, [command]);
  return { code, io };
}

verifies("cli.commands.runs.show-address-question", () => {
  describe('a run waiting for the answer to "Allow this address?"', () => {
    it("ends with the question and says to answer it in Studio", async () => {
      await storeRuns(acmeRuns, asked);

      const { code, io } = await show("0a0a0a");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(-3)).toEqual([
        "",
        '! Waiting for your answer in Studio: may provider "gateway" send key "gateway-key" to https://gw.example?',
        '  Answer "Allow this address?" in Studio. Without an answer within 10 minutes, the model call fails.',
      ]);
      expect(io.stdout.join("\n")).not.toContain("halonic runs send");
    });

    it("ends with its step lines once the question is answered", async () => {
      const answered: StoredRun = {
        ...asked,
        after: [
          ...(asked.after ?? []),
          [today("10:53:20"), { type: "key-origin.answered", ...question, answer: "allowed" }],
        ],
      };
      await storeRuns(acmeRuns, answered);

      const { io } = await show("0a0a0a");

      expect(io.stdout.join("\n")).not.toContain("Allow this address?");
      expect(io.stdout.at(-1)).not.toBe("");
    });
  });
});
