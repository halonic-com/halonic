import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  type ApiAnswer,
  cloudflareApiBase,
  cloudflareGet,
  freeAccountChecks,
  probeAccount,
  tokenKind,
} from "../lib/live-probe.ts";
import { probeSummary } from "./live-probe.ts";

const accountId = "0123456789abcdef0123456789abcdef";
const accountToken = "cfat_example";
const userToken = "cfut_example";

const ok = (result: unknown): ApiAnswer => ({
  status: 200,
  body: { success: true, errors: [], result },
});

/** A fake API: the answer for each path, everything else 404; records the paths asked. */
function fakeApi(overrides: Record<string, ApiAnswer> = {}) {
  const asked: string[] = [];
  const answers: Record<string, ApiAnswer> = {
    "/accounts": ok([{ id: accountId, name: "CI account" }]),
    [`/accounts/${accountId}/tokens/verify`]: ok({ status: "active" }),
    "/user/tokens/verify": ok({ status: "active" }),
    [`/accounts/${accountId}/workers/scripts`]: ok([]),
    [`/accounts/${accountId}/d1/database`]: ok([]),
    [`/accounts/${accountId}/r2/buckets`]: ok({ buckets: [] }),
    ...overrides,
  };
  const get = async (path: string): Promise<ApiAnswer> => {
    asked.push(path);
    return answers[path] ?? { status: 404, body: { success: false, errors: [] } };
  };
  return { get, asked };
}

const outcomes = (results: readonly { check: string; outcome: string }[]) =>
  Object.fromEntries(results.map(({ check, outcome }) => [check, outcome]));

verifies("check.live-probe", () => {
  describe("tokenKind", () => {
    test("reads the kind from the prefix", () => {
      expect(tokenKind(accountToken)).toBe("account");
      expect(tokenKind(userToken)).toBe("user");
      expect(tokenKind("abc")).toBeUndefined();
    });
  });

  describe("probeAccount", () => {
    test("passes with an account token and skips the user endpoint", async () => {
      const { get, asked } = fakeApi();
      const results = await probeAccount(get, accountId, accountToken);
      expect(outcomes(results)).toEqual({
        "GET /accounts": "pass",
        "GET /accounts/{id}/tokens/verify (cfat_)": "pass",
        "GET /user/tokens/verify (cfut_)": "skip",
        "GET /accounts/{id}/workers/scripts": "pass",
        "GET /accounts/{id}/d1/database": "pass",
        "GET /accounts/{id}/r2/buckets": "pass",
        ...Object.fromEntries(freeAccountChecks.map((check) => [check, "skip"])),
      });
      expect(asked).not.toContain("/user/tokens/verify");
      expect(probeSummary(results).failed).toBe(false);
    });

    test("verifies a user token on /user/tokens/verify", async () => {
      const { get, asked } = fakeApi();
      const results = await probeAccount(get, accountId, userToken);
      expect(outcomes(results)).toMatchObject({
        "GET /user/tokens/verify (cfut_)": "pass",
        "GET /accounts/{id}/tokens/verify (cfat_)": "skip",
      });
      expect(asked).not.toContain(`/accounts/${accountId}/tokens/verify`);
    });

    test("fails on a refused read and names the status and error code", async () => {
      const { get } = fakeApi({
        [`/accounts/${accountId}/r2/buckets`]: {
          status: 403,
          body: { success: false, errors: [{ code: 10042, message: "Please enable R2" }] },
        },
      });
      const results = await probeAccount(get, accountId, accountToken);
      const r2 = results.find(({ check }) => check === "GET /accounts/{id}/r2/buckets");
      expect(r2).toEqual({
        check: "GET /accounts/{id}/r2/buckets",
        outcome: "fail",
        detail: "HTTP 403: 10042 Please enable R2",
      });
      expect(probeSummary(results).failed).toBe(true);
    });

    test.each([
      ["missing", ok([{ id: "another", name: "Other" }]), "the CI account is not in the list."],
      ["nameless", ok([{ id: accountId, name: "" }]), "the CI account has no name."],
      ["not a list", ok({}), "the CI account is not in the list."],
    ])("fails when the account is %s in GET /accounts", async (_, answer, detail) => {
      const { get } = fakeApi({ "/accounts": answer });
      const [accounts] = await probeAccount(get, accountId, accountToken);
      expect(accounts).toMatchObject({ outcome: "fail", detail });
    });

    test("fails on an inactive token", async () => {
      const { get } = fakeApi({
        [`/accounts/${accountId}/tokens/verify`]: ok({ status: "expired" }),
      });
      const results = await probeAccount(get, accountId, accountToken);
      expect(outcomes(results)["GET /accounts/{id}/tokens/verify (cfat_)"]).toBe("fail");
    });

    test("fails on a token of no known kind, and on a network error", async () => {
      const results = await probeAccount(
        async () => {
          throw new Error("fetch failed");
        },
        accountId,
        "legacy",
      );
      expect(results.slice(0, 2)).toEqual([
        { check: "GET /accounts", outcome: "fail", detail: "fetch failed" },
        {
          check: "token verify",
          outcome: "fail",
          detail: "the token starts with neither cfat_ (account) nor cfut_ (user).",
        },
      ]);
    });

    test("never puts the token, account ID or name in what it prints", async () => {
      const { get } = fakeApi({
        "/accounts": {
          status: 500,
          body: { success: false, errors: [{ code: 1000, message: "Internal error" }] },
        },
      });
      const { lines } = probeSummary(await probeAccount(get, accountId, accountToken));
      const printed = lines.join("\n");
      expect(printed).not.toContain(accountToken);
      expect(printed).not.toContain(accountId);
      expect(printed).not.toContain("CI account");
    });
  });

  describe("redaction", () => {
    test("replaces the account ID in an error that repeats the request path", async () => {
      const path = `/accounts/${accountId}/d1/database`;
      const { get } = fakeApi({
        [path]: {
          status: 403,
          body: { success: false, errors: [{ code: 10000, message: `GET ${path} is forbidden` }] },
        },
      });
      const results = await probeAccount(get, accountId, accountToken);
      const d1 = results.find(({ check }) => check === "GET /accounts/{id}/d1/database");
      expect(d1?.detail).toBe(
        "HTTP 403: 10000 GET /accounts/<account-id>/d1/database is forbidden",
      );
      expect(JSON.stringify(results)).not.toContain(accountId);
    });

    test("replaces the account ID in a thrown error too", async () => {
      const get = async (path: string): Promise<ApiAnswer> => {
        throw new Error(`fetch failed for ${path}`);
      };
      const results = await probeAccount(get, accountId, accountToken);
      expect(JSON.stringify(results)).not.toContain(accountId);
      expect(results[1]?.detail).toContain("<account-id>");
    });
  });

  describe("cloudflareGet", () => {
    test("fails with a plain message when a request hangs past the timeout", async () => {
      const hangingFetch = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })) as typeof fetch;
      await expect(cloudflareGet(accountToken, hangingFetch, 20)("/accounts")).rejects.toThrow(
        "the request timed out after 0.02 s.",
      );
    });

    test("sends the token as a bearer header and parses the body", async () => {
      const calls: { url: string; auth: string | null }[] = [];
      const fakeFetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
        return new Response('{"success":true,"result":[]}', { status: 200 });
      }) as typeof fetch;
      const answer = await cloudflareGet(accountToken, fakeFetch)("/accounts");
      expect(calls).toEqual([
        { url: `${cloudflareApiBase}/accounts`, auth: `Bearer ${accountToken}` },
      ]);
      expect(answer).toEqual({ status: 200, body: { success: true, result: [] } });
    });

    test("keeps a body that isn't JSON as undefined", async () => {
      const fakeFetch = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
      expect(await cloudflareGet(accountToken, fakeFetch)("/accounts")).toEqual({
        status: 502,
        body: undefined,
      });
    });
  });
});
