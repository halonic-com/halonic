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

// The `halonic runs` row of a run whose model call waits for the answer to
// Studio's "Allow this address?": it names the dialog and Studio (HAL-16321).

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-list-address-question");
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

async function list(): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = runsCommandWith(acmeRunsSetup(acmeRuns));
  const code = await runCli(["runs"], io, [command]);
  return { code, io };
}

verifies("cli.commands.runs.list-address-question", () => {
  describe('a run waiting for the answer to "Allow this address?"', () => {
    it("is listed as Needs you, naming the dialog and Studio", async () => {
      await storeRuns(acmeRuns, asked);

      const { code, io } = await list();

      expect(code).toBe(exitCode.ok);
      const row = io.stdout.find((line) => line.includes("0a0a0a")) ?? "";
      expect(row).toContain("! Needs you");
      expect(row).toContain("Support reply");
      expect(row).toContain(
        'Waiting for your answer in Studio: "Allow this address?" in the step Draft a reply',
      );
      expect(io.stdout.join("\n")).not.toContain("halonic runs send");
    });

    it("is listed as running again once the question is answered", async () => {
      const answered: StoredRun = {
        ...asked,
        after: [
          ...(asked.after ?? []),
          [today("10:53:20"), { type: "key-origin.answered", ...question, answer: "allowed" }],
        ],
      };
      await storeRuns(acmeRuns, answered);

      const { io } = await list();

      const row = io.stdout.find((line) => line.includes("0a0a0a")) ?? "";
      expect(row).toContain("In Draft a reply");
      expect(row).not.toContain("Allow this address?");
    });
  });
});
