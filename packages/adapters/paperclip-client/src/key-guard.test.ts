import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { FakePaperclip, testNow } from "./fake-paperclip.test-helper.ts";
import { paperclipSourceId } from "./ids.ts";
import type { PaperclipKeyGuard } from "./transport.ts";

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = new FakePaperclip().serveAcme();
});

/** A client whose key comes from `guard`, as the engine's is. */
function guarded(guard: PaperclipKeyGuard): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: guard,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    now: () => testNow,
    fetch: paperclip.fetch,
  });
}

verifies("agent-host.paperclip-key", () => {
  describe("a key from the engine's guard", () => {
    it("is sent only in the Authorization header of the request the guard lets through", async () => {
      const client = guarded((request) => request(testKey));

      await client.listAgents();

      expect(paperclip.seen).toHaveLength(1);
      expect(paperclip.seen[0]?.headers.get("authorization")).toBe(`Bearer ${testKey}`);
    });

    it("sends nothing when the guard answers signed-out, and the source reads as signed out", async () => {
      const client = guarded(async () => ({ kind: "failed", failure: "signed-out" }));

      await expect(client.listAgents()).rejects.toMatchObject({ reason: "signed-out" });

      expect(paperclip.seen).toEqual([]);
      expect(await client.listSources()).toMatchObject([{ state: { kind: "signed-out" } }]);
    });

    it("refuses a key a header can't carry before anything is sent", async () => {
      const client = guarded((request) => request(`${testKey}\nx`));

      await expect(client.listAgents()).rejects.toMatchObject({ reason: "bad-key" });
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("revoke", () => {
    it("revokes the key in use with revoke-current, and says whether Paperclip did", async () => {
      paperclip.on("POST", "/api/cli-auth/revoke-current", { body: { revoked: true } });

      expect(await guarded((request) => request(testKey)).revoke()).toBe(true);
      expect(paperclip.seen.map((seen) => `${seen.method} ${seen.path}`)).toEqual([
        "POST /api/cli-auth/revoke-current",
      ]);
    });

    it("says it didn't when Paperclip can't be reached", async () => {
      const offline = new PaperclipMessaging({
        address: paperclip.address,
        key: testKey,
        connection: "acme",
        company,
        label: "Paperclip · Acme",
        fetch: () => Promise.reject(new TypeError("fetch failed")),
      });

      expect(await offline.revoke()).toBe(false);
    });
  });

  it("names a connection's source as its provider lists it", async () => {
    const [source] = await guarded((request) => request(testKey)).listSources();

    expect(paperclipSourceId("acme")).toBe(source?.id);
  });
});
