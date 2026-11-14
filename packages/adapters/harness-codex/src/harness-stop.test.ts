import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeCodex } from "./fake-codex.test-helper.ts";
import {
  bridge,
  newHarness,
  openSession,
  readAll,
  task,
  withKill,
} from "./harness-run.test-helper.ts";

verifies("harness-codex.start", () => {
  describe("codexHarness: stopping Codex", () => {
    it("rejects cancel with the session's error, without the token, when Codex stops anyway", async () => {
      const inner = openSession(fakeCodex(() => new Promise(() => undefined)));
      const session = withKill(inner, async (realKill) => {
        await realKill();
        throw new Error(`could not stop the program started with ${bridge.token}`);
      });
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await inner.whenStarted();

      const cancelled = await run.cancel().then(
        () => undefined,
        (error: unknown) => error,
      );
      const { error } = await reading;

      expect(String(cancelled)).toContain("could not stop the program");
      expect(String(cancelled)).not.toContain(bridge.token);
      expect(String(error)).toContain("cancelled");
    });

    it("ends the stream with the stop error, not cancelled, when Codex is still running", async () => {
      const inner = openSession(fakeCodex(() => new Promise(() => undefined)));
      const session = withKill(inner, async () => {
        throw new Error(`could not stop the program started with ${bridge.token}`);
      });
      const run = newHarness().start(task, session, bridge);
      const reading = readAll(run);
      await inner.whenStarted();

      const cancelled = await run.cancel().then(
        () => undefined,
        (error: unknown) => error,
      );
      const { error } = await reading;

      expect(String(cancelled)).toContain("could not stop the program");
      expect(String(cancelled)).not.toContain(bridge.token);
      expect(String(error)).toContain("could not stop the program");
      expect(String(error)).not.toContain(bridge.token);
      expect(String(error)).not.toContain("cancelled");
      await inner.close();
    });
  });
});
