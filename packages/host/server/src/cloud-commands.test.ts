import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import type {
  CloudCommandClaim,
  CloudCommandHandler,
  CloudCommandLedger,
  CloudCommandProgress,
  CloudInboxPorts,
  CloudLink,
  CloudLinkStore,
  VerifyCloudRequest,
} from "./cloud-inbox-api.ts";
import { TestClock, testServer, unusedPort } from "./test-server.ts";

const host = "halonic.acme.example";

/** A ledger in memory, with the leases the real one keeps in its table. */
class MemoryLedger implements CloudCommandLedger {
  readonly rows = new Map<string, { state: "running" | "done"; claim: string; leaseUntil: Date }>();

  async claim(id: string, claim: string, now: Date, leaseUntil: Date): Promise<CloudCommandClaim> {
    const row = this.rows.get(id);
    if (row?.state === "done") return "done";
    if (row !== undefined && row.leaseUntil > now) return "running";
    this.rows.set(id, { state: "running", claim, leaseUntil });
    return "claimed";
  }
  async finish(id: string, claim: string): Promise<void> {
    const row = this.rows.get(id);
    if (row?.claim === claim) this.rows.set(id, { ...row, state: "done" });
  }
  async release(id: string, claim: string): Promise<void> {
    if (this.rows.get(id)?.claim === claim) this.rows.delete(id);
  }
}

class MemoryLink implements CloudLinkStore {
  kept: CloudLink | null = null;
  async read(): Promise<CloudLink | null> {
    return this.kept;
  }
  async write(link: CloudLink): Promise<"applied" | "stale"> {
    if (this.kept !== null && this.kept.sequence >= link.sequence) return "stale";
    this.kept = link;
    return "applied";
  }
}

/** A handler for `test.work` whose work the test sets, counting its runs. */
function testHandler(work: () => Promise<CloudCommandProgress>) {
  const handler = {
    runs: 0,
    kind: "test.work",
    leaseMs: 60_000,
    prepare: () => async () => {
      handler.runs += 1;
      return work();
    },
  };
  return handler;
}

/** Accepts every request as signed for the command id in its header. */
const acceptAll: VerifyCloudRequest = async ({ headers }) => ({
  endUser: undefined,
  commandId: headers.get("halonic-command-id") ?? undefined,
});

function setup(options: { verify?: VerifyCloudRequest; handlers?: CloudCommandHandler[] } = {}) {
  const ledger = new MemoryLedger();
  const link = new MemoryLink();
  const clock = new TestClock();
  const inbox: CloudInboxPorts = {
    verify: options.verify ?? acceptAll,
    commands: ledger,
    link,
    handlers: options.handlers ?? [],
  };
  const server = testServer({ passwordHash: "hash", clock, cloudInbox: inbox });
  return { server, ledger, link, clock };
}

function command(id: string, kind: string, sequence: number | null, payload: object) {
  return { id, kind, sequence, payload };
}

function send(server: Server, body: object | string, commandId = "cmd_1"): Promise<Response> {
  return server.handle(
    new Request(`https://${host}/api/cloud/commands`, {
      method: "POST",
      headers: { host, "content-type": "application/json", "halonic-command-id": commandId },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function productState(id: string, state: string, sequence: number) {
  return command(id, "product.state", sequence, { state, changedAt: "2026-11-25T10:00:00.000Z" });
}

const hello = (server: Server) =>
  server.handle(new Request(`https://${host}/api/hello`, { headers: { host } }));

describe("Cloud's commands", () => {
  verifies("server.cloud-commands", () => {
    it("refuses a request the Cloud check refuses, before the ledger is asked", async () => {
      const server = testServer({
        passwordHash: "hash",
        cloudInbox: {
          verify: async () => null,
          commands: unusedPort("commands"),
          link: { read: async () => null, write: unusedPort("write") },
          handlers: [],
        },
      });
      const response = await send(server, productState("cmd_1", "live", 1));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthorized" });
    });

    it("refuses a body whose id isn't the signed command id", async () => {
      const { server, ledger } = setup();
      const response = await send(server, productState("cmd_2", "live", 1), "cmd_1");
      expect(response.status).toBe(400);
      expect(ledger.rows.size).toBe(0);
    });

    it.each([
      ["an unknown kind", command("cmd_1", "nobody.knows", null, {})],
      ["an unknown state", productState("cmd_1", "sleeping", 1)],
      ["a missing sequence", command("cmd_1", "product.state", null, { state: "live" })],
      ["an extra field", { ...productState("cmd_1", "live", 1), extra: true }],
      ["a bad time", command("cmd_1", "product.state", 1, { state: "live", changedAt: "soon" })],
    ])("refuses %s with 400 and acts on nothing", async (_name, body) => {
      const { server, ledger, link } = setup();
      expect((await send(server, body)).status).toBe(400);
      expect(ledger.rows.size).toBe(0);
      expect(link.kept).toBeNull();
    });

    it("refuses a body that isn't JSON", async () => {
      const { server } = setup();
      expect((await send(server, "{not json")).status).toBe(400);
    });

    it("keeps a product state and ignores one with the same or a smaller sequence", async () => {
      const { server, link } = setup();
      expect((await send(server, productState("cmd_1", "live", 5), "cmd_1")).status).toBe(200);
      expect((await send(server, productState("cmd_2", "draft", 5), "cmd_2")).status).toBe(200);
      expect((await send(server, productState("cmd_3", "draft", 4), "cmd_3")).status).toBe(200);
      expect(link.kept).toMatchObject({ state: "live", sequence: 5 });
    });

    it("closes the app while paused, still takes Cloud's commands, and opens again", async () => {
      const { server } = setup();
      expect((await hello(server)).status).toBe(200);
      await send(server, productState("cmd_1", "paused", 3), "cmd_1");
      const paused = await hello(server);
      expect(paused.status).toBe(503);
      expect(await paused.json()).toMatchObject({ code: "app_paused" });
      expect((await send(server, productState("cmd_2", "live", 4), "cmd_2")).status).toBe(200);
      expect((await hello(server)).status).toBe(200);
    });

    it("answers a finished id with 200 without running it again", async () => {
      const handler = testHandler(async () => "done");
      const { server } = setup({ handlers: [handler] });
      const body = command("cmd_1", "test.work", null, {});
      expect((await send(server, body)).status).toBe(200);
      const again = await send(server, body);
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ command: "done" });
      expect(handler.runs).toBe(1);
    });

    it("answers 409 while a try's lease holds, and runs it again once the lease ran out", async () => {
      const handler = testHandler(async () => "pending");
      const { server, clock } = setup({ handlers: [handler] });
      const body = command("cmd_1", "test.work", null, {});
      const first = await send(server, body);
      expect(first.status).toBe(409);
      expect(await first.json()).toMatchObject({ code: "command_running" });
      expect((await send(server, body)).status).toBe(409);
      expect(handler.runs).toBe(1);
      clock.advance(60_001);
      expect((await send(server, body)).status).toBe(409);
      expect(handler.runs).toBe(2);
    });

    it("lets a failed try's id go, so the next try runs it", async () => {
      let fail = true;
      const handler = testHandler(async () => {
        if (fail) throw new Error("the store is down");
        return "done";
      });
      const errors: unknown[] = [];
      const ledger = new MemoryLedger();
      const server = testServer({
        passwordHash: "hash",
        errorLog: { record: (error) => errors.push(error) },
        cloudInbox: {
          verify: acceptAll,
          commands: ledger,
          link: new MemoryLink(),
          handlers: [handler],
        },
      });
      const body = command("cmd_1", "test.work", null, {});
      expect((await send(server, body)).status).toBe(500);
      expect(errors).toHaveLength(1);
      fail = false;
      expect((await send(server, body)).status).toBe(200);
      expect(handler.runs).toBe(2);
    });

    it("can't be built with two handlers for the same kind", () => {
      const handler = testHandler(async () => "done");
      expect(() => setup({ handlers: [handler, { ...handler }] })).toThrow(RangeError);
      expect(() => setup({ handlers: [{ ...handler, kind: "product.state" }] })).toThrow(
        RangeError,
      );
    });
  });
});
