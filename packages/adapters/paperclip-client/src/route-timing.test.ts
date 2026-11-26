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

/**
 * A `fetch` answering with `status`, which may lie outside the 200–599 a `Response` can be built
 * with: Node's `fetch` passes such statuses through.
 */
function statusFetch(status: number): typeof fetch {
  return () =>
    Promise.resolve(
      Object.defineProperties(new Response("{}"), {
        status: { value: status },
        ok: { value: false },
      }),
    );
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

    it("records a status a Response can't be built with, and still answers refused", async () => {
      const answer = await transport(statusFetch(600)).send("getTask", {
        path: { task: plainTask },
      });

      expect(answer).toEqual({ kind: "failed", failure: "refused", status: 600 });
      expect(timings).toEqual([
        { method: "GET", route: "issues/:task", status: 600, ms: 25, bytes: 0 },
      ]);
    });

    it("without a sink, reads no clock and hands the reader fetch's own answer", async () => {
      const fetched = new Response("acme");
      const plain = new PaperclipTransport({
        address: paperclip.address,
        key: testKey,
        fetch: () => Promise.resolve(fetched),
        clock: () => {
          throw new Error("The clock was read without a sink.");
        },
      });
      const read: Response[] = [];

      const answer = await plain.sendReading(
        "getTask",
        { path: { task: plainTask } },
        {
          accept: "text/plain",
          read: (_name, response) => {
            read.push(response);
            return Promise.resolve({ kind: "ok", body: null });
          },
        },
      );

      expect(answer).toEqual({ kind: "ok", body: null });
      expect(read).toHaveLength(1);
      expect(read[0]).toBe(fetched);
    });

    it("without a sink, still answers refused for a status outside 200 to 599", async () => {
      const plain = new PaperclipTransport({
        address: paperclip.address,
        key: testKey,
        fetch: statusFetch(600),
      });

      const answer = await plain.send("getTask", { path: { task: plainTask } });

      expect(answer).toEqual({ kind: "failed", failure: "refused", status: 600 });
    });
  });
});
