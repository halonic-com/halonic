import { runExecutorVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunUpdateFrame } from "./engine-api.ts";
import { sendTo, testEngine } from "./engine-server.test-helper.ts";

const frame: RunUpdateFrame = { runId: "run_1", status: "running", seq: 4 };

/** Reads what the stream has sent so far, as text. */
async function readSome(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  const { value } = (await reader?.read()) ?? {};
  reader?.releaseLock();
  return new TextDecoder().decode(value);
}

verifies("server.engine-run-updates", () => {
  describe("GET /api/run-updates", () => {
    it("sends one changed event per update, with only runId, status and seq", async () => {
      const { server, calls } = testEngine();
      const answer = await sendTo(server, "GET", "/api/run-updates");
      expect(answer.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
      expect(calls.following.size).toBe(1);
      for (const listener of calls.following) {
        listener({ ...frame, input: { secret: "acme" } } as RunUpdateFrame);
      }
      expect(await readSome(answer)).toBe(`event: changed\ndata: ${JSON.stringify(frame)}\n\n`);
    });

    it("stops following the feed when the client goes away", async () => {
      const { server, calls } = testEngine();
      const answer = await sendTo(server, "GET", "/api/run-updates");
      await answer.body?.cancel();
      expect(calls.following.size).toBe(0);
    });

    it("ends the stream, rather than hold frames, for a client that stops reading", async () => {
      const { server, calls } = testEngine();
      const answer = await sendTo(server, "GET", "/api/run-updates");
      const [listener] = calls.following;
      for (let seq = 1; seq <= 300; seq += 1) {
        listener?.({ ...frame, seq });
      }
      expect(calls.following.size).toBe(0);
      const text = await answer.text();
      expect(text.split("event: changed").length - 1).toBe(256);
    });
  });
});

verifies("server.engine-server", () => {
  describe("GET /api/hello on the engine", () => {
    it("answers only the run executor version", async () => {
      const { server } = testEngine();
      const answer = await sendTo(server, "GET", "/api/hello");
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ runExecutorVersion });
    });
  });
});
