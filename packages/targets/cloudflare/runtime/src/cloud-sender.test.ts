import { importPublicKey, verifyRequest } from "@halonicjs/host-signed-request";
import {
  goldenHeaders,
  goldenPublicKey,
  goldenRandomBytes,
  goldenRequest,
  goldenSigningKey,
  goldenTimeMs,
} from "@halonicjs/host-signed-request/golden";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type CloudAnswer, CloudSender } from "./cloud-sender.ts";

interface SentRequest {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Uint8Array;
}

/** A sender with the golden key, time and nonce, whose fetch answers with `answer`. */
async function goldenSender(answer: () => Promise<Response>) {
  const sent: SentRequest[] = [];
  const sender = new CloudSender({
    cloudUrl: "https://cloud.example.com",
    product: goldenRequest.product,
    key: await goldenSigningKey(),
    clock: { now: () => new Date(goldenTimeMs) },
    randomBytes: goldenRandomBytes,
    fetch: async (url, init) => {
      sent.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: new Uint8Array(await new Response(init?.body).arrayBuffer()),
      });
      return answer();
    },
  });
  return { sender, sent };
}

const answering = (status: number) => async () => new Response(null, { status });

verifies("runtime.cloud-sender", () => {
  it("sends the golden body with exactly the golden signature headers", async () => {
    const { sender, sent } = await goldenSender(answering(202));

    const answer = await sender.send("/v1/usage", goldenRequest.body);

    expect(answer).toEqual({ kind: "delivered" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(goldenRequest.url);
    expect(sent[0]?.body).toEqual(goldenRequest.body);
    for (const [name, value] of Object.entries(goldenHeaders)) {
      expect(sent[0]?.headers.get(name)).toBe(value);
    }
  });

  it("marks a self-test in the query, where the signature covers it", async () => {
    const { sender, sent } = await goldenSender(answering(200));
    const publicKey = await importPublicKey(goldenPublicKey);
    if (!publicKey.ok) throw new Error(publicKey.error);

    await sender.send("/v1/usage", goldenRequest.body, { selfTest: true });
    const request = sent[0];
    if (request === undefined) throw new Error("nothing was sent");
    const verifyAt = (url: string) =>
      verifyRequest(
        { method: "POST", url, headers: request.headers, body: request.body },
        {
          direction: "deployment-to-cloud",
          findKey: async () => ({ publicKey: publicKey.value, product: goldenRequest.product }),
          nonces: { remember: async () => "new" },
          clock: { now: () => new Date(goldenTimeMs) },
        },
      );

    expect(request.url).toBe("https://cloud.example.com/v1/usage?self-test=1");
    expect((await verifyAt(request.url)).ok).toBe(true);
    // Without the mark the signature no longer holds, so the mark can't be stripped.
    expect((await verifyAt("https://cloud.example.com/v1/usage")).ok).toBe(false);
  });

  it("keeps a query the path already has when it adds the self-test mark", async () => {
    const { sender, sent } = await goldenSender(answering(200));

    await sender.send("/v1/usage?batch=7", goldenRequest.body, { selfTest: true });

    expect(sent[0]?.url).toBe("https://cloud.example.com/v1/usage?batch=7&self-test=1");
  });

  it("refuses a path on another host, before it signs or sends anything", async () => {
    const { sender, sent } = await goldenSender(answering(200));

    await expect(
      sender.send("https://elsewhere.example.com/v1/usage", goldenRequest.body),
    ).rejects.toThrow("not on Cloud's origin");
    await expect(
      sender.send("//elsewhere.example.com/v1/usage", goldenRequest.body),
    ).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  describe("says what came of a send", () => {
    const cases: readonly [number, CloudAnswer][] = [
      [200, { kind: "delivered" }],
      [204, { kind: "delivered" }],
      [401, { kind: "key-refused", keyId: "golden-test-key" }],
      [429, { kind: "retry", reason: "server", status: 429 }],
      [503, { kind: "retry", reason: "server", status: 503 }],
      [400, { kind: "retry", reason: "refused", status: 400 }],
      [413, { kind: "retry", reason: "refused", status: 413 }],
    ];
    for (const [status, expected] of cases) {
      it(`answers ${expected.kind} for ${status}`, async () => {
        const { sender } = await goldenSender(answering(status));

        expect(await sender.send("/v1/usage", goldenRequest.body)).toEqual(expected);
      });
    }
  });

  it("answers a network retry for a failed request, without throwing", async () => {
    const { sender } = await goldenSender(async () => {
      throw new TypeError("fetch failed");
    });

    expect(await sender.send("/v1/usage", goldenRequest.body)).toEqual({
      kind: "retry",
      reason: "network",
      error: "TypeError: fetch failed",
    });
  });

  it("answers from the status when the answer's body fails to cancel", async () => {
    const { sender } = await goldenSender(async () => {
      const response = new Response("ok", { status: 202 });
      const body = response.body;
      if (body !== null) {
        body.cancel = async () => {
          throw new TypeError("cancel failed");
        };
      }
      return response;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await sender.send("/v1/usage", goldenRequest.body)).toEqual(
      await (await goldenSender(answering(202))).sender.send("/v1/usage", goldenRequest.body),
    );
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("never puts the signature or the key in an answer", async () => {
    const signature = goldenHeaders["halonic-signature"] ?? "";
    const answers: CloudAnswer[] = [];
    for (const answer of [answering(202), answering(401), answering(500), answering(400)]) {
      const { sender } = await goldenSender(answer);
      answers.push(await sender.send("/v1/usage", goldenRequest.body));
    }
    const { sender: failing } = await goldenSender(async () => {
      throw new TypeError("fetch failed");
    });
    answers.push(await failing.send("/v1/usage", goldenRequest.body));

    const written = JSON.stringify(answers);
    expect(signature).not.toBe("");
    expect(written).not.toContain(signature);
    expect(written).not.toContain("privateKey");
    expect(written).not.toContain(goldenPublicKey);
  });
});
