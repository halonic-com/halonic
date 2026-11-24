import type { DeployFailure, DeploymentRef, DeployTargetContext } from "@halonicjs/ports";
import { deployTargetVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  createCloudflareDeployTarget,
  deployTarget,
  fetchThrough,
  tokenName,
} from "./deploy-target-entry.ts";
import { type FakeCloudflareState, fakeCloudflareApi } from "./fake-api.ts";

const web: DeploymentRef = {
  name: "web",
  accountId: "a1",
  service: "acme",
  environment: "production",
};
const accounts = [{ id: "a1", name: "sam@example.com's Account" }];
const database = { "database acme-data": { marked: true } };

function setup(state: Partial<FakeCloudflareState> = {}, saved: string | null = "saved-token") {
  const api = fakeCloudflareApi({ accounts, resources: database, ...state });
  const tokens = new Map<string, string>(saved === null ? [] : [[tokenName, saved]]);
  const usedTokens: string[] = [];
  const context: DeployTargetContext = {
    http: { fetch: async () => Response.json({ status: "ok" }) },
    tokens: {
      get: async (name) => tokens.get(name) ?? null,
      set: async (name, value) => void tokens.set(name, value),
      remove: async (name) => void tokens.delete(name),
    },
    environmentToken: undefined,
    who: "sam@example.com",
  };
  const make = (overrides: Partial<DeployTargetContext> = {}) =>
    createCloudflareDeployTarget(
      { ...context, ...overrides },
      {
        api: (token) => {
          usedTokens.push(token);
          return api;
        },
      },
    );
  return { api, tokens, usedTokens, target: make(), make };
}

async function failureOf(promise: Promise<unknown>): Promise<DeployFailure> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  return error as DeployFailure;
}

verifies("deploy.target-entry", () => {
  it("is the Cloudflare entry of this port version, with every method", () => {
    expect(deployTarget.host).toBe("cloudflare");
    expect(deployTarget.version).toBe(deployTargetVersion);
    const { target } = setup();
    for (const method of [
      "login",
      "accounts",
      "plan",
      "deploy",
      "status",
      "rollback",
      "export",
      "import",
      "unlock",
      "revokeSessions",
      "destroy",
    ]) {
      expect(typeof (target as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("asks for a login when there's no token, before calling Cloudflare", async () => {
    const { target, usedTokens } = setup({}, null);
    const failure = await failureOf(target.status(web));
    expect(failure).toMatchObject({ code: "token-missing", kind: "unauthenticated" });
    expect(failure.fix).toContain("halonic deploy login");
    expect(usedTokens).toEqual([]);
  });

  it("uses the token from the environment over the saved one", async () => {
    const { make, usedTokens } = setup({ deployment: [{ id: "B", percentage: 100 }] });
    await make({ environmentToken: "ci-token" }).status(web);
    expect(usedTokens).toEqual(["ci-token"]);
  });

  it("takes an empty token in the environment as none, so the saved one is used", async () => {
    const { make, usedTokens } = setup({ deployment: [{ id: "B", percentage: 100 }] });
    await make({ environmentToken: "" }).status(web);
    expect(usedTokens).toEqual(["saved-token"]);
  });

  it("sends a Request over the context's client whole, not only its URL", async () => {
    const sent: { url: string; init: RequestInit | undefined }[] = [];
    const through = fetchThrough({
      fetch: async (url, init) => {
        sent.push({ url, init });
        return new Response(null, { status: 204 });
      },
    });
    const body = JSON.stringify({ a: 1 });
    await through(
      new Request("https://acme.test/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    const [first] = sent;
    expect(first?.url).toBe("https://acme.test/admin");
    expect(first?.init?.method).toBe("POST");
    expect(new Headers(first?.init?.headers).get("content-type")).toBe("application/json");
    expect(await new Response(first?.init?.body).text()).toBe(body);

    await through("https://acme.test/health", { method: "HEAD" });
    expect(sent[1]).toEqual({ url: "https://acme.test/health", init: { method: "HEAD" } });
  });

  it("saves a token on login only after Cloudflare accepts it", async () => {
    const { target, tokens } = setup({}, null);
    expect(await target.login("new-token")).toEqual({ accounts });
    expect(tokens.get(tokenName)).toBe("new-token");

    const refused = setup({ userToken: { active: false }, accountToken: { active: false } }, null);
    const failure = await failureOf(refused.target.login("bad-token"));
    expect(failure).toMatchObject({ code: "token-inactive", kind: "unauthenticated" });
    expect(refused.tokens.has(tokenName)).toBe(false);
  });

  it("says which version is live, from which commit, and the one before it", async () => {
    const commit = "0123456789ab";
    const { target } = setup({
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
      versionMessages: {
        B: `halonic ${commit} ffffffffffff`,
        A: "halonic aaaaaaaaaaaa eeeeeeeeeeee",
      },
    });
    expect(await target.status(web)).toMatchObject({
      account: accounts[0],
      url: "https://acme.test.workers.dev",
      live: { number: 2, id: "B", commit },
      previous: { number: 1, id: "A", commit: "aaaaaaaaaaaa" },
      health: { answering: true },
    });
  });

  it("says nothing is live for a Worker never deployed", async () => {
    const { target } = setup();
    expect(await target.status(web)).toMatchObject({ live: undefined, previous: undefined });
  });

  it("rolls back one version and names both", async () => {
    const { target, api } = setup({
      deployment: [{ id: "B", percentage: 100 }],
      earlier: [[{ id: "A", percentage: 100 }]],
    });
    expect(await target.rollback(web)).toMatchObject({
      mode: "rolled-back",
      from: { number: 2, id: "B" },
      to: { number: 1, id: "A" },
    });
    expect(api.calls).toContain("deployVersions A:100");
  });

  it("rejects with the port's failure when there's nothing to roll back", async () => {
    const { target } = setup({ deployment: [{ id: "A", percentage: 100 }] });
    const failure = await failureOf(target.rollback(web));
    expect(failure).toMatchObject({ code: "nothing-to-roll-back", kind: "conflict" });
  });

  it("frees a stuck lock and says whose it was", async () => {
    const { target, api } = setup({
      lock: {
        id: "theirs",
        label: "kim@example.com",
        startedAt: 1_000,
        expiresAt: Date.UTC(2100, 0, 1),
      },
    });
    expect(await target.unlock(web)).toEqual({
      freed: {
        who: "kim@example.com",
        startedAt: new Date(1_000).toISOString(),
        expiresAt: new Date(Date.UTC(2100, 0, 1)).toISOString(),
      },
    });
    expect(api.calls).toContain("releaseDeployLock theirs");
  });

  it("frees nothing when no deploy holds the lock", async () => {
    const { target } = setup();
    expect(await target.unlock(web)).toEqual({ freed: undefined });
  });

  it("lists what destroy removes in the dashboard's words before removing it", async () => {
    const { target } = setup({
      resources: {
        ...database,
        "worker acme": { marked: true },
        "bucket acme-blobs": { marked: true },
      },
    });
    const shown: unknown[] = [];
    const result = await target.destroy(web, {
      confirm: async (items) => {
        shown.push(...items);
        return false;
      },
    });
    expect(result).toMatchObject({ mode: "cancelled", left: [] });
    expect(shown).toContainEqual({ resource: { kind: "service", name: "acme" } });
    expect(shown).toContainEqual({ resource: { kind: "bucket", name: "acme-blobs" } });
  });

  it("refuses the methods of the next part with an internal failure", async () => {
    const { target } = setup();
    const failure = await failureOf(target.revokeSessions(web));
    expect(failure).toMatchObject({ code: "unexpected", kind: "internal" });
  });
});

verifies("deploy.lock-read", () => {
  const until = Date.UTC(2100, 0, 1);

  it("names who holds the lock in status, and takes no lock to find out", async () => {
    const { target, api } = setup({
      deployment: [{ id: "B", percentage: 100 }],
      lock: { id: "theirs", label: "kim@example.com", startedAt: 1_000, expiresAt: until },
    });
    expect((await target.status(web)).lockedBy).toEqual({
      who: "kim@example.com",
      startedAt: new Date(1_000).toISOString(),
      expiresAt: new Date(until).toISOString(),
    });
    expect(api.calls.filter((call) => /DeployLock /.test(call))).toEqual([]);
  });

  it("names no one when the lease ran out", async () => {
    const { target } = setup({
      deployment: [{ id: "B", percentage: 100 }],
      lock: { id: "theirs", label: "kim@example.com", startedAt: 1_000, expiresAt: 2_000 },
    });
    expect((await target.status(web)).lockedBy).toBeUndefined();
  });
});
