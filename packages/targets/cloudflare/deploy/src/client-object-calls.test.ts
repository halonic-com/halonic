import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createCloudflareClient } from "./client.ts";

// Built while the test runs, so this file holds no secret-shaped text for the leak guard or `gitleaks`.
const token = ["cfut", "abcdef0123456789"].join("_");

/** A fetch that answers every request with `status` and `body`, and records what was sent. */
function client(status: number, body: string) {
  const sent: { key: string; bytes: string; type: string | null }[] = [];
  const fetched = (async (input, init) => {
    const blob = init?.body as Blob;
    sent.push({
      key: `${init?.method} ${String(input).replace("https://cf.test", "")}`,
      bytes: await blob.text(),
      type: blob.type,
    });
    return new Response(body, { status });
  }) as typeof fetch;
  return {
    api: createCloudflareClient({ token, fetch: fetched, baseUrl: "https://cf.test" }),
    sent,
  };
}

verifies("deploy.definitions", () => {
  it("puts an object's bytes at its encoded key", async () => {
    const { api, sent } = client(200, JSON.stringify({ success: true, result: {} }));
    await api.putObject("a1", "w-defs", "definitions/v1/a b.yaml", "id: orders");
    await api.putObject("a1", "w-defs", "definitions/current", new TextEncoder().encode("v1"));
    expect(sent).toEqual([
      {
        key: "PUT /accounts/a1/r2/buckets/w-defs/objects/definitions%2Fv1%2Fa%20b.yaml",
        bytes: "id: orders",
        type: "application/octet-stream",
      },
      {
        key: "PUT /accounts/a1/r2/buckets/w-defs/objects/definitions%2Fcurrent",
        bytes: "v1",
        type: "application/octet-stream",
      },
    ]);
  });

  it("accepts a write that answers without an envelope", async () => {
    const { api } = client(200, "");
    await expect(api.putObject("a1", "w-defs", "k", "v")).resolves.toBeUndefined();
  });

  it("fails a refused write and names the call, not the token", async () => {
    const { api } = client(403, JSON.stringify({ success: false, errors: [] }));
    const error = await api.putObject("a1", "w-defs", "k", "v").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "cloudflare-request-failed" });
    expect(String((error as Error).message)).toContain("HTTP 403");
    expect(String((error as Error).message)).not.toContain(token);
  });
});
