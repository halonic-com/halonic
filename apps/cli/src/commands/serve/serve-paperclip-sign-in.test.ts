import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingCacheFolder } from "@halonicjs/adapter-agent-messaging-cache";
import { paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acme, canaryKey, writeConnection } from "../../test/fake-paperclip.ts";
import { paperclipKeySecretName } from "./serve-messaging.ts";
import {
  ServePaperclipSignIn,
  serveOpenSignInLimit,
  serveSignInLimitMs,
} from "./serve-paperclip-sign-in.ts";

const challengeId = "69effd29-0000-4000-8000-000000000001";
const challengePath = `/api/cli-auth/challenges/${challengeId}`;
const oldKey = "pcp_board_old-canary-key-for-serve-tests-only";
const secretName = paperclipKeySecretName("halonic");

/** Paperclip's CLI sign-in on Acme's address, as HAL-17423 recorded it, with made-up IDs and keys. */
class FakeSignInPaperclip {
  readonly seen: { method: string; path: string; authorization: string | null }[] = [];
  status = "pending";
  companyIds = [acme.company];
  revokeFails = false;
  cancelFails = false;
  offline = false;
  approvalPath = `/cli-auth/${challengeId}?token=made-up-challenge-secret`;

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("fetch failed");
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const authorization = request.headers.get("authorization");
    this.seen.push({ method: request.method, path, authorization });
    if (path === "/api/cli-auth/challenges") {
      const { approvalPath } = this;
      return Response.json({
        id: challengeId,
        token: "made-up",
        boardApiToken: canaryKey,
        approvalPath,
        // Called on loopback, Paperclip names its loopback address here (live check, HAL-18496).
        approvalUrl: `http://127.0.0.1:3100${approvalPath}`,
      });
    }
    if (path === challengePath) return Response.json({ id: challengeId, status: this.status });
    if (path === `${challengePath}/cancel`) {
      return this.cancelFails
        ? Response.json({ error: "no" }, { status: 500 })
        : Response.json({ status: this.status });
    }
    if (path === "/api/cli-auth/me")
      return Response.json({ userId: "user-ada", companyIds: this.companyIds });
    if (path === "/api/cli-auth/revoke-current") {
      return this.revokeFails
        ? Response.json({ error: "no" }, { status: 500 })
        : Response.json({ revoked: true });
    }
    return Response.json({ error: "API route not found" }, { status: 404 });
  };

  /** The keys `revoke-current` was sent with. */
  revoked(): (string | null)[] {
    return this.seen
      .filter((each) => each.path === "/api/cli-auth/revoke-current")
      .map((each) => each.authorization?.replace(/^Bearer /u, "") ?? null);
  }
}

let folder: string;
let workspace: string;
let cacheFolder: string;
let paperclip: FakeSignInPaperclip;
let store: Map<string, string>;
let now: number;
let timers: (() => void)[];
let signIn: ServePaperclipSignIn;
let reported: unknown[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "serve-paperclip-sign-in-"));
  workspace = join(folder, "acme");
  cacheFolder = join(folder, "profile", "agent-messaging-cache");
  await writeConnection(workspace, "halonic", { label: "Halonic", ...acme });
  paperclip = new FakeSignInPaperclip();
  store = new Map();
  now = Date.parse("2026-11-25T10:00:00Z");
  timers = [];
  reported = [];
  signIn = new ServePaperclipSignIn({
    workspace,
    keys: {
      get: async (name) => store.get(name) ?? null,
      set: async (name, value) => void store.set(name, value),
      remove: async (name) => void store.delete(name),
    },
    cacheFolder,
    warn: () => {},
    report: (error) => void reported.push(error),
    fetch: paperclip.fetch,
    now: () => new Date(now),
    setTimer: (ms, end) => {
      expect(ms).toBe(serveSignInLimitMs);
      timers.push(end);
    },
    newPhrase: () => "amber otter quiet lantern",
  });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function started(): Promise<string> {
  const start = await signIn.start({ address: `${acme.address}/` });
  if (start.outcome !== "started") throw new Error(`the sign-in didn't start: ${start.reason}`);
  return start.signInId;
}

/** Lets the timer's own work, which nobody awaits, finish. */
async function runTimers(): Promise<void> {
  for (const end of timers.splice(0)) end();
  await new Promise((resolve) => setImmediate(resolve));
}

verifies("server.paperclip-sign-in", () => {
  describe("starting", () => {
    it("answers the phrase and the approval page on the connection file's own address, not Paperclip's", async () => {
      const start = await signIn.start({ address: acme.address });

      expect(start).toMatchObject({
        outcome: "started",
        phrase: "amber otter quiet lantern",
        approvalUrl: `${acme.address}/cli-auth/${challengeId}?token=made-up-challenge-secret`,
        expiresAt: "2026-11-25T10:10:00.000Z",
      });
      expect(JSON.stringify(start)).not.toContain(canaryKey);
    });

    it("refuses an address no connection file has, and sends nothing", async () => {
      const start = await signIn.start({ address: "https://paperclip.other.test" });
      const named = await signIn.start({
        address: "https://paperclip.other.test",
        connection: "halonic",
      });

      expect([start, named]).toEqual([
        { outcome: "refused", reason: "address-not-allowed" },
        { outcome: "refused", reason: "address-not-allowed" },
      ]);
      expect(paperclip.seen).toEqual([]);
    });

    it("refuses an approval page on another address and cancels the challenge", async () => {
      paperclip.approvalPath = "//evil.test/cli-auth/x";

      await expect(signIn.start({ address: acme.address })).rejects.toThrow("outside /cli-auth/");
      expect(paperclip.seen.at(-1)?.path).toBe(`${challengePath}/cancel`);
    });
  });

  describe("approval", () => {
    it("stores the record with the address and company, and answers no key", async () => {
      const id = await started();
      paperclip.status = "approved";

      const state = await signIn.poll(id);

      expect(state).toEqual({ status: "connected", connection: "halonic", ...acme });
      expect(JSON.parse(store.get(secretName) ?? "{}")).toEqual({ key: canaryKey, ...acme });
      expect(await signIn.poll(id)).toEqual({ status: "unknown" });
    });

    it("revokes the key it replaced", async () => {
      store.set(secretName, JSON.stringify({ key: oldKey, ...acme }));
      const id = await started();
      paperclip.status = "approved";

      await signIn.poll(id);

      expect(paperclip.revoked()).toEqual([oldKey]);
    });

    it("refuses a key whose user is in another company: revoked, nothing stored", async () => {
      paperclip.companyIds = ["globex-company"];
      const id = await started();
      paperclip.status = "approved";

      expect(await signIn.poll(id)).toEqual({ status: "wrong-company" });
      expect(store.size).toBe(0);
      expect(paperclip.revoked()).toEqual([canaryKey]);
    });

    it("says the refused key may work when its revoke fails, and stores nothing", async () => {
      paperclip.companyIds = ["globex-company"];
      paperclip.revokeFails = true;
      const id = await started();
      paperclip.status = "approved";

      expect(await signIn.poll(id)).toEqual({ status: "wrong-company", keyMayWork: true });
      expect(store.size).toBe(0);
    });
  });

  describe("cancel and expiry", () => {
    it("drops the pending key on cancel: the challenge is cancelled and nothing is stored", async () => {
      const id = await started();

      expect(await signIn.cancel(id)).toEqual({ status: "cancelled" });
      paperclip.status = "approved";
      expect(await signIn.poll(id)).toEqual({ status: "unknown" });
      expect(store.size).toBe(0);
      expect(paperclip.seen.map((each) => each.path)).toContain(`${challengePath}/cancel`);
    });

    it("drops the pending key at the end time even when nobody polls", async () => {
      const id = await started();
      now += serveSignInLimitMs;

      await runTimers();

      expect(paperclip.seen.at(-1)?.path).toBe(`${challengePath}/cancel`);
      expect(await signIn.poll(id)).toEqual({ status: "unknown" });
    });

    it("revokes the key when the board approved just before the cancel", async () => {
      const id = await started();
      paperclip.status = "approved";

      expect(await signIn.cancel(id)).toEqual({ status: "cancelled" });
      expect(paperclip.revoked()).toEqual([canaryKey]);
      expect(store.size).toBe(0);
    });
  });

  describe("disconnect", () => {
    beforeEach(async () => {
      store.set(secretName, JSON.stringify({ key: canaryKey, ...acme }));
      const cache = new MessagingCacheFolder(cacheFolder, [workspace], () => {});
      await cache.saveList(paperclipSourceId("halonic"), "agents", { asOf: "now", items: [] });
    });

    async function cacheIsGone(): Promise<boolean> {
      const cache = new MessagingCacheFolder(cacheFolder, [workspace], () => {});
      return (await cache.lastLiveRead(paperclipSourceId("halonic"))) === undefined;
    }

    it("revokes the key at its address, then deletes the record and the cache", async () => {
      expect(await signIn.disconnect("halonic")).toEqual({
        outcome: "disconnected",
        revoked: true,
      });
      expect(paperclip.revoked()).toEqual([canaryKey]);
      expect(store.has(secretName)).toBe(false);
      expect(await cacheIsGone()).toBe(true);
    });

    it("deletes both also when the revoke fails, and says the key stays valid", async () => {
      paperclip.revokeFails = true;

      expect(await signIn.disconnect("halonic")).toEqual({
        outcome: "disconnected",
        revoked: false,
      });
      expect(store.has(secretName)).toBe(false);
      expect(await cacheIsGone()).toBe(true);
    });

    it("answers unknown for a connection with no stored key", async () => {
      expect(await signIn.disconnect("other")).toEqual({ outcome: "unknown" });
      expect(paperclip.seen).toEqual([]);
    });
  });
});

/** Every reported error's message and its causes' messages, as the debug log could show them. */
function reportedText(): string[] {
  const texts: string[] = [];
  for (let each of reported) {
    while (each instanceof Error) {
      texts.push(each.message);
      each = each.cause;
    }
  }
  return texts;
}

verifies("server.paperclip-sign-in-failures", () => {
  it("reports a failed cancel, then revokes the key and says nothing more", async () => {
    paperclip.cancelFails = true;
    const id = await started();

    expect(await signIn.cancel(id)).toEqual({ status: "cancelled" });
    expect(paperclip.revoked()).toEqual([canaryKey]);
    expect(reportedText()[0]).toBe(
      "Paperclip didn't cancel an ended sign-in's challenge, so its key is revoked instead.",
    );
    expect(reported).toHaveLength(1);
    expect(reportedText().join("\n")).not.toContain(canaryKey);
  });

  it("reports a failed revoke after an approval the cancel found, with no key in it", async () => {
    const id = await started();
    paperclip.status = "approved";
    paperclip.revokeFails = true;

    expect(await signIn.cancel(id)).toEqual({ status: "cancelled", keyMayWork: true });
    expect(reportedText()[0]).toBe(
      "The key of an ended Paperclip sign-in couldn't be revoked, so it may work until it expires. Revoke it in Paperclip.",
    );
    expect(reportedText().join("\n")).not.toContain(canaryKey);
  });

  it("reports both when an expired sign-in's cancel and revoke fail", async () => {
    paperclip.cancelFails = true;
    paperclip.revokeFails = true;
    await started();
    now += serveSignInLimitMs;

    await runTimers();

    expect(reported).toHaveLength(2);
    expect(reportedText().join("\n")).not.toContain(canaryKey);
  });

  it("reports a failed revoke of another company's key, with no key in it", async () => {
    paperclip.companyIds = ["globex-company"];
    paperclip.revokeFails = true;
    const id = await started();
    paperclip.status = "approved";

    expect(await signIn.poll(id)).toEqual({ status: "wrong-company", keyMayWork: true });
    expect(reported).toHaveLength(1);
    expect(reportedText().join("\n")).not.toContain(canaryKey);
  });
});

verifies("server.paperclip-sign-in-cap", () => {
  /** How many challenges the server asked Paperclip for. */
  function challengesMade(): number {
    return paperclip.seen.filter((each) => each.path === "/api/cli-auth/challenges").length;
  }

  it("refuses one sign-in past the cap, asks Paperclip nothing and holds nothing new", async () => {
    const ids: string[] = [];
    for (let count = 0; count < serveOpenSignInLimit; count += 1) ids.push(await started());

    const refused = await signIn.start({ address: acme.address });

    expect(serveOpenSignInLimit).toBe(8);
    expect(refused).toEqual({ outcome: "refused", reason: "too-many-sign-ins" });
    expect(challengesMade()).toBe(serveOpenSignInLimit);
    expect(timers).toHaveLength(serveOpenSignInLimit);
  });

  it("lets only as many starts through as the cap when they come at once", async () => {
    const starts = await Promise.all(
      Array.from({ length: serveOpenSignInLimit + 3 }, () =>
        signIn.start({ address: acme.address }),
      ),
    );

    expect(starts.filter((start) => start.outcome === "started")).toHaveLength(8);
    expect(starts.filter((start) => start.outcome === "refused")).toEqual(
      Array.from({ length: 3 }, () => ({ outcome: "refused", reason: "too-many-sign-ins" })),
    );
    expect(challengesMade()).toBe(serveOpenSignInLimit);
  });

  it("starts again once a sign-in ends", async () => {
    const ids: string[] = [];
    for (let count = 0; count < serveOpenSignInLimit; count += 1) ids.push(await started());

    await signIn.cancel(ids[0] ?? "");

    expect(await signIn.start({ address: acme.address })).toMatchObject({ outcome: "started" });
  });

  it("frees the place of a start Paperclip didn't answer", async () => {
    paperclip.offline = true;
    for (let count = 0; count < serveOpenSignInLimit; count += 1) {
      expect(await signIn.start({ address: acme.address })).toMatchObject({
        reason: "unreachable",
      });
    }
    paperclip.offline = false;

    expect(await signIn.start({ address: acme.address })).toMatchObject({ outcome: "started" });
  });
});
