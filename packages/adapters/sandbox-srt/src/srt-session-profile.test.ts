import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-test-"));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

verifies("sandbox-srt.session", () => {
  describe("the session's profile", () => {
    it("keeps the profile it was opened with, though the proof's time counts against the limit", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      // The proof takes 1.25 seconds of the five.
      vi.spyOn(Date, "now").mockReturnValueOnce(10_000).mockReturnValue(11_250);
      const { runner, runs } = fakeRunner();
      const opened = makeProfile(base, { timeLimitMs: 5000 });
      const session = await new SrtSandbox(linux, runner).open(opened);
      expect(session.profile).toEqual(opened);
      await session.start(command);
      await vi.advanceTimersByTimeAsync(3749);
      expect(runs[0]?.killed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(runs[0]?.killed).toBe(true);
    });
  });
});
