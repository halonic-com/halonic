import { createHmac } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { deliver, signDelivery, type WebhookTarget, webhookChecks } from "./webhook-checks.ts";

const secret = "a webhook secret made up for this test";
const rejected = {
  code: "webhook_rejected",
  message: "The request isn't a valid, signed webhook.",
};

/**
 * A Worker in memory that answers as `host/server` does, with its own HMAC check written
 * independently of `signDelivery`. `starts` is what a correctly signed delivery gets.
 */
function fakeWorker(starts: "501" | "202" | "202-never-replays" = "501"): WebhookTarget {
  const accepted = new Set<string>();
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const delivery = headers.get("x-halonic-delivery") ?? "";
    const timestamp = headers.get("x-halonic-timestamp") ?? "";
    const expected = createHmac("sha256", secret)
      .update(`${delivery}.${timestamp}.${String(init?.body)}`)
      .digest("hex");
    const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
    const signed = headers.get("x-halonic-signature") === `sha256=${expected}`;
    if (url.pathname !== "/api/webhooks/acme/orders" || !fresh || !signed) {
      return Response.json(rejected, { status: 401 });
    }
    if (starts === "501") return Response.json({ code: "not_implemented" }, { status: 501 });
    if (accepted.has(delivery) && starts === "202") {
      return Response.json({ code: "webhook_replayed" }, { status: 409 });
    }
    accepted.add(delivery);
    return Response.json({ runId: "run_1" }, { status: 202 });
  };
  return {
    baseUrl: "https://hlt-1-1.example.workers.dev",
    address: "acme/orders",
    secret,
    fetch: send,
  };
}

verifies("live.webhooks", () => {
  describe("a delivery", () => {
    it("is signed over the delivery id, the timestamp and the body", async () => {
      const signature = await signDelivery(secret, "d-1", 1700000000, '{"id":"o-7"}');
      expect(signature).toBe(
        createHmac("sha256", secret).update('d-1.1700000000.{"id":"o-7"}').digest("hex"),
      );
    });

    it("is accepted by a Worker that checks the signature, and carries a fresh id each time", async () => {
      const target = fakeWorker("202");
      const first = await deliver(target);
      const second = await deliver(target);
      expect([first.status, second.status]).toEqual([202, 202]);
    });

    it("reads the code of the error body, and nothing from a body that isn't one", async () => {
      const wrong = await deliver(fakeWorker(), { signature: "0".repeat(64) });
      expect(wrong).toMatchObject({ status: 401, code: "webhook_rejected" });
      const html: WebhookTarget = {
        ...fakeWorker(),
        fetch: async () => new Response("<html>", { status: 502 }),
      };
      expect(await deliver(html)).toEqual({ status: 502, code: undefined, text: "<html>" });
    });
  });

  describe("the checks against a Worker that starts no runs yet", () => {
    it.each(Object.keys(webhookChecks) as (keyof typeof webhookChecks)[])(
      "pass %s",
      async (name) => {
        await expect(webhookChecks[name](fakeWorker())).resolves.toBeUndefined();
      },
    );
  });

  describe("the checks against a Worker that answers wrongly", () => {
    it("fails the bad-signature check for a Worker that accepts it", async () => {
      const lenient: WebhookTarget = {
        ...fakeWorker(),
        fetch: async () => Response.json({ runId: "x" }, { status: 202 }),
      };
      await expect(webhookChecks.badSignature(lenient)).rejects.toThrow(
        "a wrong signature was answered 202, expected 401.",
      );
    });

    it("fails the unknown-address check for a Worker that tells the address apart", async () => {
      const base = fakeWorker();
      const talkative: WebhookTarget = {
        ...base,
        fetch: async (input, init) => {
          const answer = await (base.fetch ?? fetch)(input, init);
          return String(input).includes("no-such-routine")
            ? Response.json({ code: "not_found" }, { status: 401 })
            : answer;
        },
      };
      await expect(webhookChecks.unknownAddress(talkative)).rejects.toThrow(
        "different body than a bad signature",
      );
    });

    it("fails the stale-timestamp check for a Worker with no time window", async () => {
      const noWindow: WebhookTarget = {
        ...fakeWorker(),
        fetch: async () => Response.json({ code: "x" }, { status: 501 }),
      };
      await expect(webhookChecks.staleTimestamp(noWindow)).rejects.toThrow("expected 401");
    });

    it.each(["runStartPending", "replayPending"] as const)(
      "fails %s the day a signed delivery starts a run",
      async (name) => {
        await expect(webhookChecks[name](fakeWorker("202"))).rejects.toThrow("expected 501");
      },
    );
  });
});
