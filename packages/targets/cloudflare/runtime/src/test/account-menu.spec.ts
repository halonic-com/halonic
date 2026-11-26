/**
 * The account menu's usage banner from a real `UsageObject`, through `host/server`'s
 * `GET /api/account-menu` on a many-user server with Cloud sign-in, inside workerd. Run by
 * `account-usage.test.ts`.
 */

import { env } from "cloudflare:workers";
import type { UsageLimits } from "@halonicjs/adapter-cloudflare-durable";
import { CloudSessionVerifier, createServer, type ServerPorts } from "@halonicjs/host-server";
import { encodeBase64url } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { createAccountUsage } from "../account-usage.ts";
import type { RuntimeEnv } from "../env.ts";

export { UsageObject } from "../index.ts";

const host = "deploy.acme.example";
const signInOrigin = "https://signin.acme.example";
const product = "prod_acmeAAAAAAAAAAAAAAAA";
const customer = "eu_acme0000000000003";
const scope = `u/${customer}`;

/** A generated key pair; the test libraries don't name WebCrypto's type. */
interface KeyPair {
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
}

/** A port this test doesn't expect the server to touch: any call fails the test loudly. */
function unusedPort<Port extends object>(name: string): Port {
  return new Proxy({} as Port, {
    get: (_target, property) => {
      if (property === "then") return undefined;
      return () => {
        throw new Error(`The test didn't expect ${name}.${String(property)} to be called.`);
      };
    },
  });
}

function encodeJson(value: unknown): string {
  return encodeBase64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** A Cloud session token for {@link customer}, signed by `keys`, with their profile. */
async function sessionToken(keys: KeyPair): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "EdDSA", typ: "JWT", kid: "s1" });
  const payload = encodeJson({
    iss: signInOrigin,
    sub: customer,
    aud: product,
    sid: "ses_acme",
    session_audience: "app",
    token_use: "access",
    iat: now - 10,
    nbf: now - 10,
    exp: now + 600,
    name: "Acme Customer",
    account: `https://account.acme.example/${product}`,
    product_name: "Acme Agents",
  });
  const signed = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("Ed25519", keys.privateKey, signed);
  return `${header}.${payload}.${encodeBase64url(new Uint8Array(signature))}`;
}

/** A many-user server whose only usage hook is the runtime's, over the real `USAGE` binding. */
function menuServer(keys: KeyPair) {
  const accountUsage = createAccountUsage(env as unknown as RuntimeEnv);
  if (accountUsage === undefined) throw new Error("The test's env has no USAGE binding.");
  const ports: ServerPorts = {
    runs: unusedPort("runs"),
    runStore: unusedPort("runStore"),
    secrets: unusedPort("secrets"),
    passwordHasher: unusedPort("passwordHasher"),
    coordination: unusedPort("coordination"),
    modelSettings: unusedPort("modelSettings"),
    webhooks: unusedPort("webhooks"),
    requestCounts: unusedPort("requestCounts"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    errorLog: {
      record: (error) => {
        throw error;
      },
    },
    clock: { now: () => new Date() },
    ids: { next: (prefix) => `${prefix}${crypto.randomUUID()}` },
  };
  const verifier = new CloudSessionVerifier({
    signInOrigin,
    product,
    keySet: { key: async (id) => (id === "s1" ? { id, job: "session", ...keys } : null) },
    revokedSessions: { isRevoked: async () => false },
  });
  return createServer({
    config: {
      deploymentId: "acme",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      allowedHosts: [host],
      maxBodyBytes: 4096,
    },
    ports,
    manyUsers: {
      verifier,
      cookieName: "__Host-acme-session",
      scopedRuns: () => unusedPort("the scoped run ports"),
      cloudSignIn: {
        signInOrigin,
        product,
        exchange: unusedPort("exchange"),
        refresh: unusedPort("refresh"),
        signOut: unusedPort("signOut"),
      },
      accountUsage,
    },
  });
}

describe("the account menu's usage banner", () => {
  it("warns of agent time at 82% of its limit, until the period ends", async () => {
    const start = Date.now();
    const limits: UsageLimits = {
      version: 1,
      status: "active",
      period: { start, end: start + 24 * 60 * 60 * 1000 },
      limits: { cost: 1_000, harnessMs: 1_000 },
      defaultReserve: { cost: 100 },
      maxRunning: 1,
      plan: { id: "pro", version: 1, name: "Pro" },
    };
    const { USAGE } = env as unknown as Required<Pick<RuntimeEnv, "USAGE">>;
    const usage = USAGE.get(USAGE.idFromName(scope));
    await usage.applyLimits(scope, limits);
    await usage.record({ actor: customer, scope }, "run_1", "run_1", "run", { harnessMs: 820 });
    const keys = (await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"])) as KeyPair;
    const token = await sessionToken(keys);
    const response = await menuServer(keys).handle(
      new Request(`https://${host}/api/account-menu`, {
        headers: { host, authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const resetsAt = new Date(limits.period.end).toISOString();
    expect(await response.json()).toMatchObject({
      plan: "Pro",
      usedPercent: 0,
      warnings: [{ unit: "harnessMs", percent: 82, resetsAt }],
    });
  });
});
