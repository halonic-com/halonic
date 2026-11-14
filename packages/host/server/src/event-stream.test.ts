import type {
  Coordination,
  RunEventListener,
  RunExecutor,
  RunStore,
  RunSubscription,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";

/** How a fake run ends once its stored events are sent. */
type Ending = "ended" | "broke" | "open";

interface Subscribed {
  runId: string;
  after: number;
  closed: boolean;
}

function setup(options: { ending?: Ending; passwordHash?: string | null } = {}) {
  const subscribed: Subscribed[] = [];
  const logged: unknown[] = [];
  const lookups: string[] = [];
  const stored = [1, 2, 3].map((seq) => ({ seq, runId: "run_1", type: "step.done" }));
  let listener: RunEventListener | null = null;
  const runs = {
    subscribe(runId: string, after: number, next: RunEventListener): RunSubscription {
      const entry: Subscribed = { runId, after, closed: false };
      subscribed.push(entry);
      listener = next;
      // The port never calls the listener before `subscribe` returns.
      queueMicrotask(() => {
        for (const event of stored.filter((one) => one.seq > after)) {
          next.onEvent(event as never);
        }
        if (options.ending === "broke") next.onClose(new Error("disk path /secret/db is gone"));
        else if (options.ending !== "open") next.onClose();
      });
      return {
        close() {
          entry.closed = true;
        },
      };
    },
  } as unknown as RunExecutor;
  const runStore = {
    list: async () => [],
    get: async (runId: string) => {
      lookups.push(runId);
      return runId === "run_1" ? { id: "run_1" } : null;
    },
  } as unknown as Pick<RunStore, "list" | "get">;
  const clock = new TestClock();
  const hasPassword = options.passwordHash !== undefined && options.passwordHash !== null;
  const server: Server = testServer({
    passwordHash: options.passwordHash ?? null,
    clock,
    runs,
    runStore,
    errorLog: { record: (error) => logged.push(error) },
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
  });
  return {
    server,
    subscribed,
    logged,
    lookups,
    host: hasPassword ? host : "localhost",
    emit: (event: unknown) => listener?.onEvent(event as never),
    finish: () => listener?.onClose(),
  };
}

function get(
  setupResult: { server: Server; host: string },
  path: string,
  options: { cookie?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const headers: Record<string, string> = { host: setupResult.host };
  if (options.cookie !== undefined) headers["cookie"] = options.cookie;
  return setupResult.server.handle(
    new Request(`https://${setupResult.host}${path}`, {
      method: "GET",
      headers,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
  );
}

/** Splits a stream body into its messages: `{ id, event, data }` for each. */
function messages(text: string): { id?: string; event?: string; data?: string }[] {
  return text
    .split("\n\n")
    .filter((block) => block !== "")
    .map((block) => {
      const fields: Record<string, string> = {};
      for (const line of block.split("\n")) {
        const at = line.indexOf(": ");
        fields[line.slice(0, at)] = line.slice(at + 2);
      }
      return fields;
    });
}

describe("run event stream", () => {
  verifies("server.event-stream", () => {
    it("sends each event with its seq as the id, then an end message", async () => {
      const ctx = setup();
      const response = await get(ctx, "/api/runs/run_1/events");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const sent = messages(await response.text());
      expect(sent.map((one) => [one.event, one.id])).toEqual([
        ["run", "1"],
        ["run", "2"],
        ["run", "3"],
        ["end", undefined],
      ]);
      expect(JSON.parse(sent[1]?.data ?? "")).toEqual({
        seq: 2,
        runId: "run_1",
        type: "step.done",
      });
      expect(ctx.subscribed).toEqual([{ runId: "run_1", after: 0, closed: true }]);
    });

    it("starts after the seq the caller names", async () => {
      const ctx = setup();
      const sent = messages(await (await get(ctx, "/api/runs/run_1/events?after=2")).text());
      expect(sent.map((one) => one.id)).toEqual(["3", undefined]);
      expect(ctx.subscribed[0]?.after).toBe(2);
    });

    it("follows new events until the run ends", async () => {
      const ctx = setup({ ending: "open" });
      const response = await get(ctx, "/api/runs/run_1/events?after=3");
      const reader = response.body?.getReader();
      ctx.emit({ seq: 4, runId: "run_1", type: "run.finished" });
      const first = await reader?.read();
      expect(new TextDecoder().decode(first?.value)).toContain("id: 4\n");
      ctx.finish();
      const end = await reader?.read();
      expect(new TextDecoder().decode(end?.value)).toContain("event: end");
      expect((await reader?.read())?.done).toBe(true);
    });

    it("closes with no end message when the stream breaks, and keeps the cause in the log", async () => {
      const ctx = setup({ ending: "broke" });
      const text = await (await get(ctx, "/api/runs/run_1/events")).text();
      expect(messages(text).map((one) => one.event)).toEqual(["run", "run", "run"]);
      expect(text).not.toContain("secret");
      expect(ctx.logged).toHaveLength(1);
    });

    it("refuses an after that isn't a whole number in digits, and subscribes to nothing", async () => {
      const ctx = setup();
      for (const after of ["-1", "1e3", "x", "", "1.5", "99999999999999999999", "%202"]) {
        const response = await get(ctx, `/api/runs/run_1/events?after=${after}`);
        expect(response.status).toBe(400);
        expect(((await response.json()) as { code: string }).code).toBe("bad_request");
      }
      expect(ctx.subscribed).toEqual([]);
    });

    it("answers 404 run_not_found for an unknown run, naming nothing", async () => {
      const ctx = setup();
      const response = await get(ctx, "/api/runs/other/events");
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ code: "run_not_found", message: expect.any(String) });
      expect(JSON.stringify(body)).not.toContain("other");
      expect(ctx.subscribed).toEqual([]);
    });

    it("closes the subscription when the caller aborts the request", async () => {
      const ctx = setup({ ending: "open" });
      const abort = new AbortController();
      await get(ctx, "/api/runs/run_1/events", { signal: abort.signal });
      abort.abort();
      expect(ctx.subscribed[0]?.closed).toBe(true);
    });

    it("closes the subscription when the caller cancels the body", async () => {
      const ctx = setup({ ending: "open" });
      const response = await get(ctx, "/api/runs/run_1/events");
      await response.body?.cancel();
      expect(ctx.subscribed[0]?.closed).toBe(true);
    });

    it("needs a sign-in when a password is set, and asks nothing before it", async () => {
      const ctx = setup({ passwordHash: "hash:correct horse" });
      const response = await get(ctx, "/api/runs/run_1/events");
      expect(response.status).toBe(401);
      expect(ctx.lookups).toEqual([]);
      expect(ctx.subscribed).toEqual([]);

      const login = await ctx.server.handle(
        new Request(`https://${host}/api/login`, {
          method: "POST",
          headers: { host, "content-type": "application/json" },
          body: JSON.stringify({ password: "correct horse" }),
        }),
      );
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const signedIn = await get(ctx, "/api/runs/run_1/events", { cookie });
      expect(signedIn.status).toBe(200);
      await signedIn.text();
    });

    it("refuses a foreign Host before anything is read", async () => {
      const ctx = setup({ passwordHash: "hash:correct horse" });
      const response = await ctx.server.handle(
        new Request("https://evil.example/api/runs/run_1/events", {
          headers: { host: "evil.example" },
        }),
      );
      expect(response.status).toBe(421);
      expect(ctx.lookups).toEqual([]);
    });
  });
});
