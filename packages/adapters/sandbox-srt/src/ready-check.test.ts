import { readFile, stat } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { startSmallestSandbox } from "./ready-check.ts";
import type { RunningProgram, RunRequest } from "./srt-runner.ts";
import { endedProgram } from "./srt-session.test-helper.ts";

/** A program that never ends unless it is killed. */
function hangingProgram(killed: { count: number }): RunningProgram {
  return {
    stdin: new WritableStream(),
    stdout: new ReadableStream(),
    stderr: new ReadableStream(),
    ended: new Promise(() => {}),
    killTree: () => {
      killed.count++;
    },
  };
}

verifies("sandbox-srt.check", () => {
  describe("startSmallestSandbox", () => {
    it("runs `true` once through the runner, with a bridge so srt sets up its network namespace", async () => {
      const asked: { request: RunRequest; settings: unknown }[] = [];
      const answer = await startSmallestSandbox({
        run: async (request) => {
          asked.push({
            request,
            settings: JSON.parse(await readFile(request.settingsPath, "utf8")),
          });
          return endedProgram(0);
        },
      });
      expect(answer).toBeNull();
      expect(asked).toHaveLength(1);
      const [{ request, settings }] = asked as [(typeof asked)[number]];
      expect(request).toMatchObject({ program: "true", args: [], withoutSrtEnv: false });
      expect(settings).toMatchObject({ network: { allowedDomains: ["127.0.0.1:9"] } });
    });

    it("removes its folders afterwards", async () => {
      let request: RunRequest | undefined;
      await startSmallestSandbox({
        run: async (given) => {
          request = given;
          return endedProgram(0);
        },
      });
      await expect(stat(request?.settingsPath ?? "")).rejects.toThrow();
      await expect(stat(request?.launcherEnv["TMPDIR"] ?? "")).rejects.toThrow();
    });

    it("gives srt's own line when the sandbox doesn't start", async () => {
      const answer = await startSmallestSandbox({
        run: async () =>
          endedProgram(1, "\nError: socat bridge failed to start: Connection refused\n  at x\n"),
      });
      expect(answer).toBe("Error: socat bridge failed to start: Connection refused");
    });

    it("gives the exit code when srt says nothing", async () => {
      expect(await startSmallestSandbox({ run: async () => endedProgram(3) })).toBe(
        "srt ended with 3",
      );
    });

    it("gives the launch error when nothing could be started", async () => {
      const answer = await startSmallestSandbox({
        run: async () => {
          throw new Error("spawn node ENOENT");
        },
      });
      expect(answer).toBe("spawn node ENOENT");
    });

    it("stops srt and says so when it takes longer than the time limit", async () => {
      const killed = { count: 0 };
      const answer = await startSmallestSandbox({ run: async () => hangingProgram(killed) }, 50);
      expect(answer).toBe("srt didn't start a sandbox within 0.05 seconds");
      expect(killed.count).toBe(1);
    });

    it("also times out when srt never launches, and stops it if it launches late", async () => {
      const killed = { count: 0 };
      let launch: (program: RunningProgram) => void = () => {};
      const answer = await startSmallestSandbox(
        {
          run: () =>
            new Promise((resolve) => {
              launch = resolve;
            }),
        },
        50,
      );
      expect(answer).toBe("srt didn't start a sandbox within 0.05 seconds");
      launch(hangingProgram(killed));
      await new Promise((resolve) => setImmediate(resolve));
      expect(killed.count).toBe(1);
    });
  });
});
