import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { plainTask, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { logRouteTimings, type RouteTiming } from "./route-timing.ts";
import { PaperclipTransport } from "./transport.ts";

/** A clock that moves 25 ms each time it is read, so a call's time is known. */
function steppingClock(): () => number {
  let now = 1000;
  return () => {
    now += 25;
    return now;
  };
}

let paperclip: FakePaperclip;
let timings: RouteTiming[];
let lines: string[];

beforeEach(() => {
  paperclip = new FakePaperclip();
  timings = [];
  lines = [];
});

function transport(fetcher: typeof fetch = paperclip.fetch): PaperclipTransport {
  const log = logRouteTimings((line) => lines.push(line));
  return new PaperclipTransport({
    address: paperclip.address,
    key: testKey,
    fetch: fetcher,
    clock: steppingClock(),
    timing: (timing) => {
      timings.push(timing);
      log(timing);
    },
  });
}

verifies("paperclip-client.route-timing", () => {
  describe("route timing", () => {
    it("records a task read as its route template with status, time and size", async () => {
      const body = { id: plainTask, title: "Acme launch page" };
      paperclip.on("GET", `/api/issues/${plainTask}`, { body });

      await transport().send("getTask", {
        path: { task: plainTask },
        query: { status: "todo" },
      });

      expect(paperclip.seen[0]?.query.get("status")).toBe("todo");
      expect(timings).toEqual([
        {
          method: "GET",
          route: "issues/:task",
          status: 200,
          ms: 25,
          bytes: new TextEncoder().encode(JSON.stringify(body)).byteLength,
        },
      ]);
    });

    it("logs one line without the ID, the query, a header or the key", async () => {
      paperclip.on("GET", `/api/issues/${plainTask}`, { body: { id: plainTask } });

      await transport().send("getTask", {
        path: { task: plainTask },
        query: { status: "todo" },
      });

      expect(lines).toHaveLength(1);
      const [line = ""] = lines;
      expect(line).toContain("GET issues/:task 200");
      for (const secret of [plainTask, "status", "todo", "?", testKey, "Bearer", "authorization"]) {
        expect(line).not.toContain(secret);
      }
      expect(line.toLowerCase()).not.toContain("accept");
    });

    it("records a refusal with its status", async () => {
      paperclip.on("GET", `/api/issues/${plainTask}`, { status: 403, body: { error: "no" } });

      await transport().send("getTask", { path: { task: plainTask } });

      expect(timings[0]).toMatchObject({ route: "issues/:task", status: 403 });
      expect(timings[0]?.bytes).toBeGreaterThan(0);
    });

    it("records an unreachable Paperclip as offline with no bytes", async () => {
      const unreachable = (): Promise<Response> => Promise.reject(new TypeError("fetch failed"));

      const answer = await transport(unreachable).send("getTask", { path: { task: plainTask } });

      expect(answer).toEqual({ kind: "failed", failure: "offline" });
      expect(timings).toEqual([
        { method: "GET", route: "issues/:task", status: "offline", ms: 25, bytes: 0 },
      ]);
    });

    it("records nothing without a sink", async () => {
      paperclip.on("GET", `/api/issues/${plainTask}`, { body: { id: plainTask } });
      const plain = new PaperclipTransport({
        address: paperclip.address,
        key: testKey,
        fetch: paperclip.fetch,
      });

      const answer = await plain.send("getTask", { path: { task: plainTask } });

      expect(answer).toEqual({ kind: "ok", body: { id: plainTask } });
      expect(timings).toEqual([]);
    });
  });
});
