// A hostile runner's request that is too large, or whose refusal would be
// too large to send back (HAL-4354, found by the attack tests on HAL-4338).

import {
  createLimitedHttpClient,
  IntegrationRefusedError,
  RequestLog,
} from "@halonicjs/integration-kit";
import type { IntegrationHttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { maxFrameBytes } from "../frames.ts";
import {
  bridgeOptions,
  fakeKitClient,
  fakeRunnerProcess,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { connectRunner } from "./connect-runner.ts";
import type { RunnerLimits } from "./limits.ts";

/** The kit's real client for an integration with a long name. */
function realKitClient(): IntegrationHttpClient {
  return createLimitedHttpClient({
    policy: {
      name: "acme-customer-relations-management-crm",
      hosts: ["api.example.com"],
      secrets: {},
      tokens: [],
    },
    transport: { fetch: async () => new Response("{}") },
    secrets: { get: async () => null },
    log: new RequestLog(),
  });
}

/** A started connection with one running call, driven frame by frame. */
async function runningCall(http: IntegrationHttpClient, limits: Partial<RunnerLimits> = {}) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, { http, limits });
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  connection.callTool("forecast", {}).catch(() => undefined);
  const frame = await runner.next();
  if (frame.type !== "call") throw new Error(`expected a call, got ${frame.type}`);
  return { options, runner, connection, call: frame.call };
}

/** A `fetch` frame with the given headers and secret placements. */
function fetchFrame(
  call: number,
  parts: { headers?: [string, string][]; auth?: { secret: string; as: "bearer" }[] },
) {
  return {
    type: "fetch",
    id: 0,
    call,
    url: "https://api.example.com/",
    method: "GET",
    headers: parts.headers ?? [],
    body: null,
    auth: parts.auth ?? [],
  };
}

/** A `fetch` frame of exactly one full frame, naming one undeclared secret. */
function fullFrameWithHugeSecretName(call: number) {
  const frame = (name: string) => fetchFrame(call, { auth: [{ secret: name, as: "bearer" }] });
  const overhead = new TextEncoder().encode(`${JSON.stringify(frame(""))}\n`).byteLength;
  return frame("a".repeat(maxFrameBytes - overhead));
}

verifies("integration-runner.requests", () => {
  describe("a refusal too large for a frame", () => {
    it("refuses a full frame that names a huge secret as too large, without an unhandled error (A21)", async () => {
      const { options, runner, connection, call } = await runningCall(realKitClient());
      await runner.send(fullFrameWithHugeSecretName(call));
      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "request-too-large",
      });
      expect(options.blocks).toEqual([]);
      await connection.close();
      expect(await connection.stopped).toEqual({ reason: "closed" });
    });

    it("answers with the kit's code and a short message when the kit's message doesn't fit", async () => {
      // The kit shortens the names it repeats, so a kit whose message is
      // larger than a frame stands in for any refusal that still grows.
      const kit = fakeKitClient(() => {
        throw new IntegrationRefusedError("secret-not-declared", "x".repeat(maxFrameBytes));
      });
      const { options, runner, connection, call } = await runningCall(kit);
      await runner.send(fetchFrame(call, {}));
      const answer = await runner.next();
      expect(answer).toEqual({
        type: "error",
        id: 0,
        code: "secret-not-declared",
        message: "the request was refused; the reason is too long to send",
      });
      expect(options.blocks).toEqual([]);
      await connection.close();
      expect(await connection.stopped).toEqual({ reason: "closed" });
    });
  });

  describe("the 32 KiB cap on URL, headers and secret placements (section 3.3)", () => {
    const limit = 32 * 1024;
    /**
     * The size of `fetchFrame`'s URL, `x-a` and the placement's `bearer` and
     * `k`, with 4 bytes each for the one header and the one placement.
     */
    const fixed = "https://api.example.com/".length + "x-a".length + "bearer".length + 1 + 2 * 4;

    it("sends a request at the cap to the kit", async () => {
      const kit = fakeKitClient(() => new Response(null));
      const { runner, connection, call } = await runningCall(kit);
      const value = "v".repeat(limit - fixed);
      await runner.send(
        fetchFrame(call, { headers: [["x-a", value]], auth: [{ secret: "k", as: "bearer" }] }),
      );
      expect(await runner.next()).toMatchObject({ type: "head", id: 0 });
      expect(kit.sent).toHaveLength(1);
      await connection.close();
    });

    it.each([
      ["the headers", { headers: [["x-a", "v".repeat(limit)]] as [string, string][] }],
      ["the secret placements", { auth: [{ secret: "k".repeat(limit), as: "bearer" as const }] }],
      [
        "all of them together",
        {
          headers: [["x-a", "v".repeat(limit - fixed)]] as [string, string][],
          auth: [{ secret: "kk", as: "bearer" as const }],
        },
      ],
    ])(
      "refuses a request one byte or more over the cap in %s, before the kit",
      async (_, parts) => {
        const kit = fakeKitClient(() => new Response(null));
        const { options, runner, connection, call } = await runningCall(kit);
        await runner.send(fetchFrame(call, parts));
        expect(await runner.next()).toMatchObject({
          type: "error",
          id: 0,
          code: "request-too-large",
        });
        expect(kit.sent).toEqual([]);
        expect(options.blocks).toEqual([]);
        await connection.close();
      },
    );
  });

  describe("the caps on how many headers and placements (HAL-4375)", () => {
    const headers = (count: number) =>
      Array.from({ length: count }, (_, n): [string, string] => [`x-${n}`, "v"]);
    const placements = (count: number) =>
      Array.from({ length: count }, () => ({ secret: "k", as: "bearer" as const }));

    it.each([
      ["100 headers", { headers: headers(100) }],
      ["16 secret placements", { auth: placements(16) }],
    ])("sends a request with %s to the kit", async (_, parts) => {
      const kit = fakeKitClient(() => new Response(null));
      const { runner, connection, call } = await runningCall(kit);
      await runner.send(fetchFrame(call, parts));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0 });
      expect(kit.sent).toHaveLength(1);
      await connection.close();
    });

    it.each([
      ["101 headers", { headers: headers(101) }, "at most 100 headers"],
      ["17 secret placements", { auth: placements(17) }, "at most 16 secret placements"],
    ])("refuses a request with %s as too large, before the kit", async (_, parts, message) => {
      const kit = fakeKitClient(() => new Response(null));
      const { options, runner, connection, call } = await runningCall(kit);
      await runner.send(fetchFrame(call, parts));
      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "request-too-large",
        message: expect.stringContaining(message),
      });
      expect(kit.sent).toEqual([]);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it("counts 4 bytes for each header, so many tiny ones don't fit under 32 KiB", async () => {
      // 6,000 headers of `a: b` are 12,000 bytes of text, but 36,000 with their 4 bytes each.
      const kit = fakeKitClient(() => new Response(null));
      const { runner, connection, call } = await runningCall(kit, {
        maxRequestHeaders: Number.POSITIVE_INFINITY,
      });
      const tiny = Array.from({ length: 6_000 }, (): [string, string] => ["a", "b"]);
      await runner.send(fetchFrame(call, { headers: tiny }));
      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "request-too-large",
        message: expect.stringContaining("bytes together"),
      });
      expect(kit.sent).toEqual([]);
      await connection.close();
    });
  });

  describe("a request Halonic can't answer", () => {
    it("stops the runner instead of leaving the failure unhandled", async () => {
      // A body that yields text, not bytes, can't be sent as a `chunk`.
      const textBody = new ReadableStream({
        start: (controller) => controller.enqueue("not bytes"),
      });
      const response = { status: 200, statusText: "", headers: new Headers(), url: "" };
      const kit = fakeKitClient(() => ({ ...response, body: textBody }) as unknown as Response);
      const { options, runner, connection, call } = await runningCall(kit);
      await runner.send(fetchFrame(call, {}));
      expect(await runner.next()).toMatchObject({ type: "head", id: 0, hasBody: true });
      await runner.send({ type: "pull", body: 0 });
      expect(await connection.stopped).toMatchObject({ reason: "protocol" });
      expect(options.blocks).toEqual([
        { kind: "protocol", detail: expect.stringContaining("a request Halonic could not answer") },
      ]);
    });
  });
});
