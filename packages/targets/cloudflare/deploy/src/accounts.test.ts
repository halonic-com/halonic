import type { DeployFailure, DeployTargetContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";
import { createCloudflareDeployTarget, tokenName } from "./deploy-target-entry.ts";
import { DeployError } from "./errors.ts";
import { type FakeCloudflareState, fakeCloudflareApi } from "./fake-api.ts";

const accounts = [
  { id: "a1", name: "sam@example.com's Account" },
  { id: "a2", name: "Acme" },
];
const refused = new DeployError(
  "cloudflare-request-failed",
  "GET /accounts was refused (HTTP 403)",
  { status: 403 },
);
const down = new DeployError("cloudflare-request-failed", "GET /accounts was refused (HTTP 503)", {
  status: 503,
});

function setup(state: Partial<FakeCloudflareState> = {}, saved: string | null = "saved-token") {
  const api = fakeCloudflareApi({ accounts, ...state });
  const usedTokens: string[] = [];
  const context: DeployTargetContext = {
    http: { fetch: async () => new Response(null, { status: 204 }) },
    tokens: {
      get: async (name) => (name === tokenName ? saved : null),
      set: async () => {},
      remove: async () => {},
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
  return { api, usedTokens, make };
}

async function failureOf(promise: Promise<unknown>): Promise<DeployFailure> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  return error as DeployFailure;
}

verifies("deploy.target-accounts", () => {
  it("keeps the HTTP status of a refused request, so a refusal is told from an outage", async () => {
    for (const status of [403, 503]) {
      const client = createCloudflareClient({
        token: "test-token",
        fetch: async () => Response.json({ success: false, errors: [] }, { status }),
      });
      const error = await client.listAccounts().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DeployError);
      expect(error).toMatchObject({ code: "cloudflare-request-failed", status });
    }
  });

  it("lists every account the token reaches, by id and name, and changes nothing", async () => {
    const { api, make } = setup({ failOnWrite: true });
    expect(await make().accounts()).toEqual(accounts);
    expect(api.calls).toEqual(["listAccounts"]);
  });

  it("uses the token from the environment first, then the saved one", async () => {
    const { make, usedTokens } = setup();
    await make({ environmentToken: "ci-token" }).accounts();
    await make({ environmentToken: "" }).accounts();
    expect(usedTokens).toEqual(["ci-token", "saved-token"]);
  });

  it("asks for a login when there's no token, before calling Cloudflare", async () => {
    const { make, usedTokens } = setup({}, null);
    const failure = await failureOf(make().accounts());
    expect(failure).toMatchObject({ code: "token-missing", kind: "unauthenticated" });
    expect(usedTokens).toEqual([]);
  });

  it("says why Cloudflare refused the list: an inactive token, or one without the permission", async () => {
    const inactive = setup({ listAccountsFails: refused, userToken: { active: false } });
    expect(await failureOf(inactive.make().accounts())).toMatchObject({
      code: "token-inactive",
      kind: "unauthenticated",
      message:
        "Cloudflare doesn't accept the saved token any more. It may have expired or been removed. Nothing changed on Cloudflare.",
      fix: "Make a new one and save it: halonic deploy login cloudflare",
    });

    const unpermitted = setup({ listAccountsFails: refused });
    expect(await failureOf(unpermitted.make().accounts())).toMatchObject({
      code: "missing-permission",
      kind: "denied",
      message:
        "The token can't list the Cloudflare accounts it reaches. Nothing changed on Cloudflare.",
      fix: "Add Account · Account Settings · Read to the token in the Cloudflare dashboard, then run again.",
    });
  });

  it("names the variable, not login, when the inactive token came from the environment", async () => {
    const inactive = setup({ listAccountsFails: refused, userToken: { active: false } });
    expect(
      await failureOf(inactive.make({ environmentToken: "ci-token" }).accounts()),
    ).toMatchObject({
      code: "token-inactive",
      message:
        "Cloudflare doesn't accept the token in HALONIC_CLOUDFLARE_API_TOKEN. It may have expired or been removed. Nothing changed on Cloudflare.",
      fix: "Make a new one and put it in HALONIC_CLOUDFLARE_API_TOKEN.",
    });
  });

  it("keeps the list's own failure when Cloudflare is down, or the token can't be verified", async () => {
    const unverified = setup({ listAccountsFails: refused, userToken: new Error("offline") });
    expect(await failureOf(unverified.make().accounts())).toMatchObject({
      code: "host-request-failed",
      kind: "unavailable",
    });

    const unavailable = setup({ listAccountsFails: down });
    expect(await failureOf(unavailable.make().accounts())).toMatchObject({
      code: "host-request-failed",
      kind: "unavailable",
    });
    expect(unavailable.api.calls).toEqual(["listAccounts"]);

    const accountToken = setup({ listAccountsFails: refused }, "cfat_saved");
    expect(await failureOf(accountToken.make().accounts())).toMatchObject({
      code: "host-request-failed",
    });
    expect(accountToken.api.calls).toEqual(["listAccounts"]);
  });
});
