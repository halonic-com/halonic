import type { UsageLimits } from "@halonicjs/adapter-cloudflare-durable";
import {
  importSigningKey,
  type KeyUse,
  readPublicKeySet,
  signRequest,
} from "@halonicjs/host-signed-request";
import { encodeBase64url, fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "./env.ts";
import {
  answerLimitsPush,
  answerLimitsPushOf,
  type LimitsPushContext,
  type LimitsPushTarget,
} from "./limits-push.ts";

const product = "prod_acme";
const signedAt = new Date(Date.UTC(2026, 10, 24, 12));
const clock = fixedClock(signedAt.getTime());

const limits: UsageLimits = {
  version: 2,
  status: "active",
  period: { start: signedAt.getTime(), end: signedAt.getTime() + 86_400_000 },
  limits: { cost: 1_000 },
  defaultReserve: { cost: 100 },
  maxRunning: 1,
};

/** A fresh Ed25519 key, in memory only, published under `id` for `use`. */
async function makeKey(id: string, use: KeyUse) {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  if (!("privateKey" in pair)) throw new Error("Ed25519 gave one key instead of a pair");
  // workerd's types give `exportKey` one return type for every format; these two are bytes.
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const signing = await importSigningKey(id, encodeBase64url(new Uint8Array(pkcs8)));
  if (!signing.ok) throw new Error("a fresh key didn't read back");
  return {
    signing: signing.value,
    published: { id, use, publicKey: encodeBase64url(new Uint8Array(raw)) },
  };
}

/** Usage objects in memory, one per scope, that write down every call. */
function memoryUsage() {
  const calls: string[] = [];
  const nonces = new Set<string>();
  const kept = new Map<string, UsageLimits>();
  const usageOf = (scope: string): LimitsPushTarget => ({
    rememberNonce: async (called, keyId, nonce) => {
      calls.push(`nonce ${scope} ${called}`);
      const key = `${called} ${keyId} ${nonce}`;
      if (nonces.has(key)) return "seen";
      nonces.add(key);
      return "new";
    },
    applyLimits: async (called, document) => {
      calls.push(`apply ${scope} ${called}`);
      if (typeof document.version !== "number") throw new RangeError("not a limits document");
      const current = kept.get(called);
      if (current !== undefined && document.version <= current.version) return "stale";
      kept.set(called, document);
      return "applied";
    },
  });
  return { calls, kept, usageOf };
}

async function setUp() {
  const command = await makeKey("cloud-command-1", "command");
  const session = await makeKey("cloud-session-1", "session");
  const keys = await readPublicKeySet({ keys: [command.published, session.published] });
  if (!keys.ok) throw new Error("the test key set didn't read");
  const usage = memoryUsage();
  const context: LimitsPushContext = { keys: keys.value, product, clock, usageOf: usage.usageOf };
  return { command, session, usage, context };
}

interface PushOptions {
  readonly signedPath?: string;
  readonly sentPath?: string;
  readonly endUser?: string;
  readonly direction?: "cloud-to-deployment" | "deployment-to-cloud";
  readonly signedProduct?: string;
  readonly document?: unknown;
}

async function signedPush(key: Awaited<ReturnType<typeof makeKey>>, options: PushOptions = {}) {
  const base = "https://halonic.example.com";
  const signedPath = options.signedPath ?? "/cloud/limits/u/eu_acme0123456789abcdef";
  const body = new TextEncoder().encode(JSON.stringify(options.document ?? limits));
  const headers = await signRequest(
    {
      direction: options.direction ?? "cloud-to-deployment",
      method: "POST",
      url: `${base}${signedPath}`,
      body,
      product: options.signedProduct ?? product,
      endUser: options.endUser,
    },
    {
      key: key.signing,
      clock,
      randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
    },
  );
  return new Request(`${base}${options.sentPath ?? signedPath}`, { method: "POST", headers, body });
}

verifies("runtime.limits-push", () => {
  describe("the limits push route", () => {
    it("hands a push signed by Cloud's command key to the scope's object", async () => {
      const { command, usage, context } = await setUp();
      const answer = await answerLimitsPush(await signedPush(command), context);
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ limits: "applied" });
      expect(usage.calls).toEqual([
        "nonce u/eu_acme0123456789abcdef u/eu_acme0123456789abcdef",
        "apply u/eu_acme0123456789abcdef u/eu_acme0123456789abcdef",
      ]);
      expect(usage.kept.get("u/eu_acme0123456789abcdef")).toEqual(limits);
    });

    it("answers stale for a version the object already has", async () => {
      const { command, context } = await setUp();
      await answerLimitsPush(await signedPush(command), context);
      const answer = await answerLimitsPush(await signedPush(command), context);
      expect(await answer.json()).toEqual({ limits: "stale" });
    });

    it("refuses the same request sent again", async () => {
      const { command, context } = await setUp();
      const request = await signedPush(command);
      await answerLimitsPush(request.clone(), context);
      const answer = await answerLimitsPush(request, context);
      expect(answer.status).toBe(401);
    });

    it("refuses a push signed for one scope and sent to another, reaching no object", async () => {
      const { command, usage, context } = await setUp();
      const request = await signedPush(command, {
        sentPath: "/cloud/limits/o/org_acme0123456789abcdef",
      });
      const answer = await answerLimitsPush(request, context);
      expect(answer.status).toBe(401);
      expect(usage.calls).toEqual([]);
    });

    it("refuses every request the signature check refuses, with one answer", async () => {
      const { command, session, usage, context } = await setUp();
      const refused = [
        await signedPush(session),
        await signedPush(command, { direction: "deployment-to-cloud" }),
        await signedPush(command, { signedProduct: "prod_other" }),
        await signedPush(command, { endUser: "o/org_acme0123456789abcdef" }),
        new Request("https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef", {
          method: "POST",
          body: JSON.stringify(limits),
        }),
      ];
      for (const request of refused) {
        const answer = await answerLimitsPush(request, context);
        expect(answer.status).toBe(401);
        expect(await answer.json()).toEqual({
          code: "unauthorized",
          message: "The request isn't signed by Halonic Cloud.",
        });
      }
      expect(usage.calls.filter((call) => call.startsWith("apply"))).toEqual([]);
    });

    it("takes a signed end-user header that names the same scope", async () => {
      const { command, context } = await setUp();
      const answer = await answerLimitsPush(
        await signedPush(command, { endUser: "u/eu_acme0123456789abcdef" }),
        context,
      );
      expect(answer.status).toBe(200);
    });

    it("refuses a signed document that isn't a limits document", async () => {
      const { command, context } = await setUp();
      for (const document of [[1, 2], { version: "two" }]) {
        const answer = await answerLimitsPush(await signedPush(command, { document }), context);
        expect(answer.status).toBe(400);
        expect(await answer.json()).toMatchObject({ code: "bad_limits" });
      }
    });

    it("refuses a body that is too large before reading it, and a path that isn't a scope", async () => {
      const { context } = await setUp();
      const large = new Request(
        "https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef",
        {
          method: "POST",
          headers: { "content-length": "70000" },
          body: "x".repeat(70_000),
        },
      );
      expect((await answerLimitsPush(large, context)).status).toBe(413);
      // A chunked body has no length to check first, so the read itself stops over the limit.
      const chunk = new TextEncoder().encode("x".repeat(16_384));
      let sent = 0;
      const streamed = new Request(
        "https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef",
        {
          method: "POST",
          body: new ReadableStream<Uint8Array>({
            pull(controller) {
              sent += 1;
              controller.enqueue(chunk);
            },
          }),
          duplex: "half",
        } as RequestInit,
      );
      expect((await answerLimitsPush(streamed, context)).status).toBe(413);
      expect(sent).toBeLessThan(10);
      const notScope = new Request("https://halonic.example.com/cloud/limits/acme", {
        method: "POST",
      });
      expect((await answerLimitsPush(notScope, context)).status).toBe(404);
      const get = new Request("https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef");
      expect((await answerLimitsPush(get, context)).status).toBe(405);
    });
  });

  describe("the limits push route's configuration", () => {
    const push = new Request("https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef", {
      method: "POST",
    });

    it("is absent from a deployment Cloud doesn't sell through, and for other paths", async () => {
      expect(await answerLimitsPushOf(push, {} as RuntimeEnv)).toBeUndefined();
      const other = new Request("https://halonic.example.com/api/hello");
      expect(await answerLimitsPushOf(other, {} as RuntimeEnv)).toBeUndefined();
    });

    it("answers 503 without naming what is missing when only part is there", async () => {
      const env = { HALONIC_CLOUD_PRODUCT: product } as unknown as RuntimeEnv;
      const answer = await answerLimitsPushOf(push, env);
      expect(answer?.status).toBe(503);
      expect(await answer?.json()).toEqual({
        code: "unavailable",
        message: "The server isn't ready.",
      });
    });

    it("verifies with the pinned key set and names the scope's object from the path", async () => {
      const { command } = await setUp();
      const usage = memoryUsage();
      const named: string[] = [];
      const USAGE = {
        idFromName: (name: string) => {
          named.push(name);
          return name;
        },
        get: (name: string) => usage.usageOf(name),
      };
      const env = {
        HALONIC_CLOUD_PRODUCT: product,
        HALONIC_CLOUD_KEYS: JSON.stringify({ keys: [command.published] }),
        USAGE,
      } as unknown as RuntimeEnv;
      // The route reads the real clock here, so the push is signed now.
      const now = { now: () => new Date() };
      const body = new TextEncoder().encode(JSON.stringify(limits));
      const url = "https://halonic.example.com/cloud/limits/u/eu_acme0123456789abcdef";
      const headers = await signRequest(
        { direction: "cloud-to-deployment", method: "POST", url, body, product },
        {
          key: command.signing,
          clock: now,
          randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
        },
      );
      const answer = await answerLimitsPushOf(
        new Request(url, { method: "POST", headers, body }),
        env,
      );
      expect(answer?.status).toBe(200);
      expect(named).toEqual(["u/eu_acme0123456789abcdef"]);
    });

    it("answers 503 for a key set that isn't one", async () => {
      const env = {
        HALONIC_CLOUD_PRODUCT: product,
        HALONIC_CLOUD_KEYS: JSON.stringify({ keys: [{ id: "k1" }] }),
        USAGE: {},
      } as unknown as RuntimeEnv;
      expect((await answerLimitsPushOf(push, env))?.status).toBe(503);
    });

    it("answers 503 for a key set that can't be read", async () => {
      const env = {
        HALONIC_CLOUD_PRODUCT: product,
        HALONIC_CLOUD_KEYS: "{not json",
        USAGE: {},
      } as unknown as RuntimeEnv;
      expect((await answerLimitsPushOf(push, env))?.status).toBe(503);
    });
  });
});
