import { type FakeProgram, FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexFinishing } from "./fake-codex.test-helper.ts";
import {
  bridge,
  engineSessionOptions,
  newHarness,
  readAll,
  task,
  withExitReason,
} from "./harness-run.test-helper.ts";

function openSession(program: FakeProgram): FakeSandboxSession {
  return new FakeSandboxSession(engineSessionOptions(program));
}

verifies("harness-codex.start", () => {
  describe("codexHarness: how a run ends", () => {
    it("says Codex was stopped when the sandbox stops it before the turn completes", async () => {
      const session = openSession(idleProgram);
      const reading = readAll(newHarness().start(task, session, bridge));
      await session.whenStarted();
      await session.close();

      const { error } = await reading;

      expect(String(error)).toContain("Codex was stopped before it finished");
    });

    it("says Codex ran out of time when the sandbox reports a timeout", async () => {
      const session = withExitReason(
        openSession(async () => 0),
        "timeout",
      );

      const { error } = await readAll(newHarness().start(task, session, bridge));

      expect(String(error)).toContain("Codex ran out of time before it finished");
    });

    it("refuses a message once the run has ended", async () => {
      const run = newHarness().start(task, openSession(codexFinishing), bridge);
      await readAll(run);

      await expect(run.send({ type: "answer", text: "More." })).rejects.toThrow(
        "The Codex run has ended.",
      );
    });

    it("cancels without error once the run has ended", async () => {
      const run = newHarness().start(task, openSession(codexFinishing), bridge);
      await readAll(run);

      await expect(run.cancel()).resolves.toBeUndefined();
    });
  });
});
