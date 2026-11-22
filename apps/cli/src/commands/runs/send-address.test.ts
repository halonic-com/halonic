import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
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
import { captureIo } from "../../test/capture-io.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { runsCommandWith } from "./command.ts";

// `runs send` to a run whose model call waits for the answer to Studio's
// "Allow this address?": it says the run waits for that answer, as `runs`
// and `runs show` say, instead of "it isn't waiting for you" (C696 #2).

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-send-address");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const question = { provider: "gateway", key: "gateway-key", origin: "https://gw.example" };

/** Support reply in Draft a reply, its model call asking about the address. */
const asked: StoredRun = {
  id: "run_mfx3k2a1_0a0a0a",
  start: today("10:53:00"),
  after: [
    [today("10:53:01"), { type: "state.entered", state: "draft" }],
    [today("10:53:05"), { type: "key-origin.asked", ...question }],
  ],
};

async function send(args: readonly string[]) {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["runs", "send", ...args], io, [
    runsCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, io };
}

async function eventsOf(runId: string): Promise<readonly RunEvent[]> {
  return (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(runId);
}

verifies("cli.commands.runs.send", () => {
  it('says a run waits for the answer to "Allow this address?" in Studio, and sends nothing', async () => {
    await storeRuns(acmeRuns, asked);
    const before = await eventsOf(asked.id);

    const { code, io } = await send(["0a0a0a", "approve"]);

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr).toEqual([
      "✕ Couldn't send approve to run 0a0a0a: it's waiting for your answer to \"Allow this address?\" in the step Draft a reply, and only Studio asks that.",
      "  See it with halonic runs show 0a0a0a.",
    ]);
    expect(await eventsOf(asked.id)).toHaveLength(before.length);
  });
});
