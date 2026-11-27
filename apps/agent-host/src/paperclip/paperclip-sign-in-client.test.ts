import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { PaperclipSignInClient } from "@halonicjs/adapter-paperclip-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PaperclipSignIn, signInLimitMs } from "./paperclip-sign-in.ts";
import { FakeKeyStore, fakeBoardKey } from "./sign-in-calls.test-helper.ts";
import type { SignInCalls } from "./sign-in-calls.ts";

// The wiring (HAL-17439): the flow with the Paperclip client's real calls,
// against a Paperclip stand-in that answers as HAL-17423 recorded.

const address = "https://paperclip.acme.test";
const connection = { address, companyId: "acme", workspace: "/work/acme", name: "acme" };
const challengeId = "c0000000-0000-4000-8000-000000000001";
const challengePath = `/api/cli-auth/challenges/${challengeId}`;

interface Seen {
  method: string;
  path: string;
  body: unknown;
}

/** Paperclip's sign-in routes in memory; the poll answers `status`, `me` answers `companyIds`. */
class FakeSignInPaperclip {
  readonly seen: Seen[] = [];
  status = "pending";
  companyIds = ["acme"];

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const text = await request.text();
    const { pathname } = new URL(request.url);
    this.seen.push({
      method: request.method,
      path: pathname,
      body: text === "" ? undefined : JSON.parse(text),
    });
    return Response.json(...this.#answer(`${request.method} ${pathname}`));
  };

  #answer(route: string): [unknown, ResponseInit?] {
    switch (route) {
      case "POST /api/cli-auth/challenges":
        return [
          {
            id: challengeId,
            token: "challenge-secret",
            boardApiToken: fakeBoardKey,
            approvalPath: `/cli-auth/${challengeId}?token=challenge-secret`,
          },
          { status: 201 },
        ];
      case `GET ${challengePath}`:
        return [{ id: challengeId, status: this.status }];
      case `POST ${challengePath}/cancel`:
        return this.status === "pending"
          ? [{ status: "cancelled", cancelled: true }]
          : [{ error: "not pending" }, { status: 409 }];
      case "GET /api/cli-auth/me":
        return [{ userId: "user-ada", companyIds: this.companyIds }];
      case "POST /api/cli-auth/revoke-current":
        return [{ revoked: true }];
      default:
        return [{ error: "API route not found" }, { status: 404 }];
    }
  }

  /** The requests sent, as `METHOD path`. */
  sent(): string[] {
    return this.seen.map((seen) => `${seen.method} ${seen.path}`);
  }
}

function setUp() {
  const paperclip = new FakeSignInPaperclip();
  const keyStore = new FakeKeyStore();
  const clock = new ManualClock();
  let flow: PaperclipSignIn | undefined;
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => flow?.onTimer(timer), onTick: async () => undefined },
    clock,
  );
  const addresses: string[] = [];
  const callsFor = (forAddress: string): SignInCalls => {
    addresses.push(forAddress);
    return new PaperclipSignInClient({ address: forAddress, fetch: paperclip.fetch });
  };
  flow = new PaperclipSignIn({ callsFor, keyStore, scheduler, clock });
  return { paperclip, keyStore, clock, scheduler, flow, addresses };
}

verifies("agent-host.paperclip-sign-in", () => {
  describe("PaperclipSignIn with the Paperclip client", () => {
    it("sends the phrase Studio shows, to the connection's address, and stores nothing yet", async () => {
      const { paperclip, keyStore, flow, addresses } = setUp();
      const started = await flow.start(connection);
      expect(addresses).toEqual([address]);
      expect(paperclip.seen[0]).toMatchObject({
        method: "POST",
        path: "/api/cli-auth/challenges",
        body: { command: started.phrase, requestedCompanyId: "acme" },
      });
      expect(started.approvalUrl).toBe(`${address}/cli-auth/${challengeId}?token=challenge-secret`);
      await expect(flow.poll(started.signInId)).resolves.toEqual({ status: "pending" });
      expect(flow.holdsKey(started.signInId)).toBe(true);
      expect(keyStore.saved).toEqual([]);
    });

    it("stores the key once the board approves and `me` lists the company", async () => {
      const { paperclip, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      paperclip.status = "approved";
      await expect(flow.poll(started.signInId)).resolves.toEqual({
        status: "connected",
        userId: "user-ada",
        companyId: "acme",
        key: fakeBoardKey,
        name: connection.name,
        address: connection.address,
        workspace: connection.workspace,
      });
      expect(keyStore.saved).toEqual([{ ...connection, key: fakeBoardKey }]);
      expect(await flow.confirm(started.signInId)).toBe(true);
      expect(flow.holdsKey(started.signInId)).toBe(false);
    });

    it("refuses and revokes a key whose user isn't in the connection's company", async () => {
      const { paperclip, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      paperclip.status = "approved";
      paperclip.companyIds = ["globex"];
      await expect(flow.poll(started.signInId)).resolves.toEqual({ status: "wrong-company" });
      expect(keyStore.saved).toEqual([]);
      expect(paperclip.sent()).toContain("POST /api/cli-auth/revoke-current");
    });

    it("drops the key and cancels the challenge when the dialog closes", async () => {
      const { paperclip, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      await flow.cancel(started.signInId);
      expect(flow.holdsKey(started.signInId)).toBe(false);
      expect(paperclip.sent()).toContain(`POST ${challengePath}/cancel`);
      expect(paperclip.sent()).not.toContain("POST /api/cli-auth/revoke-current");
      expect(keyStore.saved).toEqual([]);
    });

    it("revokes the key when the board approved before the dialog closed", async () => {
      const { paperclip, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      paperclip.status = "approved";
      await flow.cancel(started.signInId);
      expect(paperclip.sent().slice(-3)).toEqual([
        `POST ${challengePath}/cancel`,
        `GET ${challengePath}`,
        "POST /api/cli-auth/revoke-current",
      ]);
      expect(keyStore.saved).toEqual([]);
    });

    it("drops the key when the 10 minutes pass", async () => {
      const { clock, scheduler, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      clock.advance(signInLimitMs);
      await scheduler.runDue();
      expect(flow.holdsKey(started.signInId)).toBe(false);
      expect(keyStore.saved).toEqual([]);
    });

    it("never sends a request to `/api/board-api-keys`", async () => {
      const { paperclip, flow } = setUp();
      const approved = await flow.start(connection);
      paperclip.status = "approved";
      await flow.poll(approved.signInId);
      const cancelled = await flow.start(connection);
      await flow.cancel(cancelled.signInId);
      expect(paperclip.seen.length).toBeGreaterThan(0);
      expect(paperclip.sent().filter((sent) => sent.includes("board-api-keys"))).toEqual([]);
    });
  });
});
