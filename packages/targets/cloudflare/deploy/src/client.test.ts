import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";
import { DeployError } from "./errors.ts";

// Built while the test runs, so this file holds no secret-shaped text for the leak guard or `gitleaks`.
const token = ["cfut", "abcdef0123456789"].join("_");

function replying(status: number, body: unknown, seen: string[] = []): typeof fetch {
  return async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify(body), { status });
  };
}

verifies("deploy.credentials", () => {
  it("sends the token as a bearer header and reads the accounts", async () => {
    let header = "";
    const client = createCloudflareClient({
      token,
      fetch: async (_input, init) => {
        header = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "a1", name: "Acme" }] }),
        );
      },
    });
    expect(await client.listAccounts()).toEqual([{ id: "a1", name: "Acme" }]);
    expect(header).toBe(`Bearer ${token}`);
  });

  it("reads the verify status from the right endpoint", async () => {
    const seen: string[] = [];
    const client = createCloudflareClient({
      token,
      baseUrl: "https://cf.test",
      fetch: replying(200, { success: true, result: { status: "active" } }, seen),
    });
    expect(await client.verifyAccountToken("a1")).toEqual({ active: true });
    expect(await client.verifyUserToken()).toEqual({ active: true });
    expect(seen).toEqual([
      "https://cf.test/accounts/a1/tokens/verify",
      "https://cf.test/user/tokens/verify",
    ]);
  });

  it("treats a status other than active as inactive", async () => {
    const client = createCloudflareClient({
      token,
      fetch: replying(200, { success: true, result: { status: "expired" } }),
    });
    expect(await client.verifyUserToken()).toEqual({ active: false });
  });

  it("replaces the token in the error when Cloudflare echoes it", async () => {
    const client = createCloudflareClient({
      token,
      fetch: replying(403, { success: false, errors: [{ code: 9109, message: `bad ${token}` }] }),
    });
    const error = await client.listAccounts().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeployError);
    expect((error as DeployError).code).toBe("cloudflare-request-failed");
    expect((error as DeployError).message).toContain("9109");
    expect((error as DeployError).message).not.toContain(token);
    expect((error as DeployError).message).toContain("[redacted]");
  });

  it("replaces the token in the error when the network fails", async () => {
    const client = createCloudflareClient({
      token,
      fetch: async () => {
        throw new Error(`connect failed for ${token}`);
      },
    });
    const error = await client.listAccounts().catch((caught: unknown) => caught);
    expect((error as DeployError).message).not.toContain(token);
  });
});
