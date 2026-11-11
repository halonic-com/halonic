// A hostile runner against the kit's real client, across the bridge: header
// tricks, placements the sheet doesn't allow, a form that already holds the
// secret's field, and a server that echoes the key back (design HAL-958,
// attack cases A18, A19, A25, A27; proposal on HAL-4338, E1 to E4). The
// bridge's own tests use a kit that accepts everything, so these run the
// kit's `createLimitedHttpClient` over a recording transport instead.

import { createLimitedHttpClient, RequestLog, secretForms } from "@halonicjs/integration-kit";
import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fromBase64 } from "../bodies.ts";
import type { HalonicFrame } from "../frames.ts";
import {
  bridgeOptions,
  fakeRunnerProcess,
  fakeSecret,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { connectRunner } from "./connect-runner.ts";
import type { RunnerLimits } from "./limits.ts";

/** A request as it reached the network, after the kit placed its secrets. */
interface WireRequest {
  url: string;
  method: string;
  headers: [string, string][];
  body: string | null;
}

/** The server's answer to a request, given what the kit sent. */
type Server = (request: WireRequest) => Response;

/** The sheet: one secret for each way the kit can place one, all with the same fake value. */
const policy = {
  name: "acme",
  hosts: ["api.example.com"],
  secrets: {
    "bearer-key": { hosts: ["api.example.com"], placement: { as: "bearer" as const } },
    "header-key": {
      hosts: ["api.example.com"],
      placement: { as: "header" as const, header: "X-Api-Key", prefix: "Key " },
    },
    "form-key": {
      hosts: ["api.example.com"],
      placement: { as: "form" as const, field: "token" },
    },
  },
  tokens: [],
};

/** The kit's real client over a transport that records what it sends. */
function realKit(server: Server, secret: string) {
  const wire: WireRequest[] = [];
  const transport: HttpClient = {
    fetch: async (url, init = {}) => {
      const body =
        init.body === undefined || init.body === null ? null : await new Response(init.body).text();
      const request = {
        url,
        method: init.method ?? "GET",
        headers: [...new Headers(init.headers)],
        body,
      };
      wire.push(request);
      return server(request);
    },
  };
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets: { get: async () => secret },
    log: new RequestLog(),
  });
  return { http, wire };
}

/**
 * A started connection to the real kit, with one running call, driven frame by
 * frame. Every secret in the sheet has the value `secret`.
 */
async function runningCall(
  server: Server,
  { limits = {}, secret = fakeSecret }: { limits?: Partial<RunnerLimits>; secret?: string } = {},
) {
  const kit = realKit(server, secret);
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, {
    http: kit.http,
    limits,
    secrets: secretForms([{ value: secret }]),
  });
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  connection.callTool("forecast", {}).catch(() => undefined);
  const frame = await runner.next();
  if (frame.type !== "call") throw new Error(`expected a call, got ${frame.type}`);
  return { ...kit, options, runner, connection, call: frame.call };
}

function fetchFrame(call: number, extra: object) {
  return {
    type: "fetch",
    id: 0,
    call,
    url: "https://api.example.com/v1/forecast",
    method: "GET",
    headers: [],
    body: null,
    auth: [],
    ...extra,
  };
}

/** Everything the runner can see in a frame, with `chunk` bodies decoded. */
function visible(frame: HalonicFrame): string {
  if (frame.type !== "chunk") return JSON.stringify(frame);
  return new TextDecoder().decode(fromBase64(frame.base64));
}

/** Reads the answer to request 0 to its end, pulling each piece: what the runner saw. */
async function readAnswer(runner: HandDrivenRunner): Promise<HalonicFrame[]> {
  const frames: HalonicFrame[] = [await runner.next()];
  if (frames[0]?.type !== "head" || !frames[0].hasBody) return frames;
  for (;;) {
    await runner.send({ type: "pull", body: 0 });
    const frame = await runner.next();
    frames.push(frame);
    if (frame.type !== "chunk") return frames;
  }
}

const ok: Server = () => new Response("{}");

verifies("integration-runner.requests", () => {
  describe("E1: header tricks around a placed secret (A18, A25)", () => {
    it.each([
      ["a line break in the header name", { header: "X-Api-Key\r\nX-Leak", prefix: "Key " }],
      ["a line break in the prefix", { header: "X-Api-Key", prefix: "Key \r\nX-Leak: " }],
      ["the pseudo-header :authority", { header: ":authority", prefix: "Key " }],
      ["Host", { header: "Host", prefix: "Key " }],
      ["Cookie", { header: "Cookie", prefix: "Key " }],
      ["Proxy-Authorization", { header: "Proxy-Authorization", prefix: "Key " }],
      ["the sheet's header with another prefix", { header: "X-Api-Key", prefix: "" }],
      [
        "the sheet's header with a Kelvin sign for the k",
        { header: "X-Api-\u212Aey", prefix: "Key " },
      ],
    ])("refuses a header placement with %s, sending nothing", async (_, placement) => {
      const { options, runner, connection, call, wire } = await runningCall(ok);
      await runner.send(
        fetchFrame(call, { auth: [{ secret: "header-key", as: "header", ...placement }] }),
      );
      const answer = await runner.next();
      expect(answer).toMatchObject({ type: "error", id: 0, code: "placement-not-in-sheet" });
      expect(visible(answer)).not.toContain(fakeSecret);
      expect(wire).toEqual([]);
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code: "placement-not-in-sheet" }]);
      await connection.close();
    });

    it("refuses a plain header with a line break in its name, sending nothing", async () => {
      const { options, runner, connection, call, wire } = await runningCall(ok);
      await runner.send(
        fetchFrame(call, {
          headers: [["X-A\r\nX-Leak", "v"]],
          auth: [{ secret: "bearer-key", as: "bearer" }],
        }),
      );
      const answer = await runner.next();
      expect(answer).toEqual({
        type: "error",
        id: 0,
        code: "failed",
        message: "the request failed",
      });
      expect(wire).toEqual([]);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it.each([
      ["Authorization", "Bearer attacker", "bearer-key", { as: "bearer" }, `Bearer ${fakeSecret}`],
      [
        "x-api-key",
        "Key attacker",
        "header-key",
        { as: "header", header: "X-Api-Key", prefix: "Key " },
        `Key ${fakeSecret}`,
      ],
    ])(
      "sends only the kit's value when the runner sets %s itself as well",
      async (name, value, secret, placement, placed) => {
        const { runner, connection, call, wire } = await runningCall(ok);
        await runner.send(
          fetchFrame(call, { headers: [[name, value]], auth: [{ secret, ...placement }] }),
        );
        expect(await runner.next()).toMatchObject({ type: "head", id: 0, status: 200 });
        const sent = wire[0]?.headers.filter(([key]) => key === name.toLowerCase());
        expect(sent).toEqual([[name.toLowerCase(), placed]]);
        await connection.close();
      },
    );
  });

  describe("E2: a declared secret placed another way than the sheet says (A19)", () => {
    it.each([
      [
        "a bearer key as a header",
        "bearer-key",
        { as: "header", header: "X-Api-Key", prefix: "Key " },
      ],
      ["a bearer key in a form field", "bearer-key", { as: "form", field: "token" }],
      ["a header key as a bearer token", "header-key", { as: "bearer" }],
      ["a header key in a form field", "header-key", { as: "form", field: "token" }],
      ["a form key as a bearer token", "form-key", { as: "bearer" }],
      ["a form key in another field", "form-key", { as: "form", field: "note" }],
      ["a form key in the field with another case", "form-key", { as: "form", field: "Token" }],
    ])("refuses %s as a leak attempt, sending nothing", async (_, secret, placement) => {
      const { options, runner, connection, call, wire } = await runningCall(ok);
      await runner.send(
        fetchFrame(call, {
          method: "POST",
          headers: [["content-type", "application/x-www-form-urlencoded"]],
          body: { kind: "form", text: "note=hello" },
          auth: [{ secret, ...placement }],
        }),
      );
      const answer = await runner.next();
      expect(answer).toMatchObject({ type: "error", id: 0, code: "placement-not-in-sheet" });
      expect(visible(answer)).not.toContain(fakeSecret);
      expect(wire).toEqual([]);
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code: "placement-not-in-sheet" }]);
      // A refusal answers the request; it doesn't stop the runner.
      await runner.send(
        fetchFrame(call, { id: 1, auth: [{ secret: "bearer-key", as: "bearer" }] }),
      );
      expect(await runner.next()).toMatchObject({ type: "head", id: 1, status: 200 });
      expect(wire).toHaveLength(1);
      await connection.close();
      expect(await connection.stopped).toEqual({ reason: "closed" });
    });
  });

  describe("E3: a form that already holds the secret's field (A19)", () => {
    it.each([
      ["once", "token=attacker&note=hi"],
      ["twice", "token=attacker&token=x&note=hi"],
      ["with the field percent-encoded", "%74oken=attacker&note=hi"],
    ])("sends the kit's value alone when the runner's form has the field %s", async (_, form) => {
      const { runner, connection, call, wire } = await runningCall(ok);
      await runner.send(
        fetchFrame(call, {
          method: "POST",
          headers: [["content-type", "application/x-www-form-urlencoded"]],
          body: { kind: "form", text: form },
          auth: [{ secret: "form-key", as: "form", field: "token" }],
        }),
      );
      expect(await runner.next()).toMatchObject({ type: "head", id: 0, status: 200 });
      const sent = new URLSearchParams(wire[0]?.body ?? "");
      expect(sent.getAll("token")).toEqual([fakeSecret]);
      expect(sent.getAll("note")).toEqual(["hi"]);
      expect(wire[0]?.body).not.toContain("attacker");
      await connection.close();
    });
  });

  describe("E4: a server that echoes the placed key back (A19, A27)", () => {
    /** A key that URL-encoding changes, so the encoded copy is a form of its own. */
    const key = "sk-fake/0123+4567=89";

    /**
     * A server that repeats the key it was given, the body split inside the key.
     * Base64 and other transformed copies aren't filtered, by design (`secretForms`).
     */
    const echo: Server = () => {
      const half = key.length / 2;
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`{"you sent":"${key.slice(0, half)}`));
          controller.enqueue(encoder.encode(`${key.slice(half)}","again":"`));
          controller.enqueue(encoder.encode(`${key}"}`));
          controller.close();
        },
      });
      return new Response(body, {
        status: 401,
        statusText: `bad key ${key}`,
        headers: {
          "x-echo": key,
          "www-authenticate": `Bearer error="invalid_token", token="${key}"`,
          "set-cookie": `last=${encodeURIComponent(key)}`,
        },
      });
    };

    it.each([
      ["a bearer token", { secret: "bearer-key", as: "bearer" }],
      ["a header", { secret: "header-key", as: "header", header: "X-Api-Key", prefix: "Key " }],
    ])("shows the runner only [secret removed], for a key placed as %s", async (_, placement) => {
      // Small pieces, so the bridge splits the body over many `chunk` frames as well.
      const { options, runner, connection, call, wire } = await runningCall(echo, {
        limits: { maxBodyPieceBytes: 7 },
        secret: key,
      });
      await runner.send(fetchFrame(call, { auth: [placement] }));
      const frames = await readAnswer(runner);
      expect(wire).toHaveLength(1);

      const head = frames[0];
      expect(head).toMatchObject({ type: "head", id: 0, status: 401 });
      if (head?.type !== "head") throw new Error("expected a head");
      expect(head.statusText).toBe("bad key [secret removed]");
      expect(head.headers).toContainEqual(["x-echo", "[secret removed]"]);
      expect(encodeURIComponent(key)).not.toBe(key);
      expect(head.headers).toContainEqual(["set-cookie", "last=[secret removed]"]);
      expect(frames.at(-1)).toEqual({ type: "end", id: 0 });
      const body = frames
        .filter((frame) => frame.type === "chunk")
        .map(visible)
        .join("");
      expect(body).toBe('{"you sent":"[secret removed]","again":"[secret removed]"}');

      for (const frame of frames) expect(visible(frame)).not.toContain(key);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it("refuses a redirect to a URL that holds the key, without following it", async () => {
      const redirect: Server = () =>
        new Response(null, {
          status: 302,
          headers: { location: `https://api.example.com/next?key=${fakeSecret}` },
        });
      const { options, runner, connection, call, wire } = await runningCall(redirect);
      await runner.send(fetchFrame(call, { auth: [{ secret: "bearer-key", as: "bearer" }] }));
      const answer = await runner.next();
      expect(answer).toMatchObject({ type: "error", id: 0, code: "secret-in-redirect" });
      expect(visible(answer)).not.toContain(fakeSecret);
      expect(wire).toHaveLength(1);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });
  });
});
