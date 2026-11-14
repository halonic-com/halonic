import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { resolveCredentials } from "./credentials.ts";
import { DeployError } from "./errors.ts";
import { fakeCloudflareApi } from "./fake-api.ts";

const acme = { id: "a1", name: "Acme" };

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((caught: unknown) => caught);
  return error instanceof DeployError ? error.code : undefined;
}

verifies("deploy.credentials", () => {
  it("verifies a cfat_ token at the account endpoint only", async () => {
    const api = fakeCloudflareApi({ accounts: [acme] });
    expect(await resolveCredentials(api, { token: "cfat_x" })).toEqual({
      accountId: "a1",
      kind: "account",
    });
    expect(api.calls).toEqual(["listAccounts", "verifyAccountToken a1"]);
  });

  it("verifies a cfut_ token at the user endpoint only", async () => {
    const api = fakeCloudflareApi({ accounts: [acme] });
    expect(await resolveCredentials(api, { token: "cfut_x" })).toEqual({
      accountId: "a1",
      kind: "user",
    });
    expect(api.calls).toEqual(["listAccounts", "verifyUserToken"]);
  });

  it("tries the account endpoint for a legacy token whose user check fails", async () => {
    const api = fakeCloudflareApi({
      accounts: [acme],
      userToken: new DeployError("cloudflare-request-failed", "refused"),
    });
    const resolved = await resolveCredentials(api, { token: "legacy-x" });
    expect(resolved.kind).toBe("legacy");
    expect(api.calls).toEqual(["listAccounts", "verifyUserToken", "verifyAccountToken a1"]);
  });

  it("stops when the token is inactive", async () => {
    const api = fakeCloudflareApi({ accounts: [acme], userToken: { active: false } });
    expect(await codeOf(resolveCredentials(api, { token: "cfut_x" }))).toBe("token-inactive");
  });

  it("stops when the token sees no account, or the named one is missing", async () => {
    const none = fakeCloudflareApi({ accounts: [] });
    expect(await codeOf(resolveCredentials(none, { token: "cfut_x" }))).toBe("no-account");
    const other = fakeCloudflareApi({ accounts: [acme] });
    expect(await codeOf(resolveCredentials(other, { token: "cfut_x", accountId: "zz" }))).toBe(
      "no-account",
    );
  });

  it("lists the accounts when several are visible and none is named", async () => {
    const api = fakeCloudflareApi({ accounts: [acme, { id: "b2", name: "Beta" }] });
    const error = await resolveCredentials(api, { token: "cfut_x" }).catch(
      (caught: unknown) => caught,
    );
    expect((error as DeployError).code).toBe("ambiguous-account");
    expect((error as DeployError).message).toContain("Acme (a1)");
    expect((error as DeployError).message).toContain("Beta (b2)");
    const named = await resolveCredentials(api, { token: "cfut_x", accountId: "b2" });
    expect(named.accountId).toBe("b2");
  });

  it("does not catch an unexpected error from the legacy user check", async () => {
    const api = fakeCloudflareApi({ accounts: [acme], userToken: new TypeError("bug") });
    await expect(resolveCredentials(api, { token: "legacy-x" })).rejects.toThrow("bug");
  });
});
