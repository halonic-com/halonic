// A hostile runner against the kit's real client and a real sign-in, across the bridge, with a fake OAuth
// provider behind it (HAL-984 design, section 8: attack cases T2, T3, T4, T5 and T14). The runner never has a
// token: it names a sign-in and a placement, and the provider's answers reach it only after the filter.

import { currentSecretForms, secretRemoved } from "@halonicjs/adapter-integration-kit";
import {
  clientSecretName,
  createSignInRig,
  currentToken,
  refreshWhileFirstTokenLives,
  signInName,
} from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fromBase64 } from "../bodies.ts";
import type { HalonicFrame } from "../frames.ts";
import { bridgeOptions, fakeRunnerProcess, HandDrivenRunner } from "../pipes.test-helper.ts";
import { connectRunner } from "./connect-runner.ts";

/** A signed-in rig and a started bridge with one running call, over the kit's real client for the rig. */
async function signedInCall() {
  const rig = createSignInRig();
  await rig.signIn();
  expect((await rig.api()).status).toBe(200);
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, {
    http: rig.loaded.host.http,
    secrets: currentSecretForms([], rig.signIns.tokens),
  });
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  connection.callTool("forecast", {}).catch(() => undefined);
  const frame = await runner.next();
  if (frame.type !== "call") throw new Error(`expected a call, got ${frame.type}`);
  return { rig, options, runner, connection, call: frame.call };
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
    auth: [{ signIn: signInName, as: "bearer" }],
    ...extra,
  };
}

/** Everything the runner can see in a frame, with `chunk` bodies decoded. */
function visible(frame: HalonicFrame): string {
  if (frame.type !== "chunk") return JSON.stringify(frame);
  return new TextDecoder().decode(fromBase64(frame.base64));
}

/** Reads the answer to request `id` to its end, pulling each piece: what the runner saw. */
async function readAnswer(runner: HandDrivenRunner, id = 0): Promise<HalonicFrame[]> {
  const frames: HalonicFrame[] = [await runner.next()];
  if (frames[0]?.type !== "head" || !frames[0].hasBody) return frames;
  for (;;) {
    await runner.send({ type: "pull", body: id });
    const frame = await runner.next();
    frames.push(frame);
    if (frame.type !== "chunk") return frames;
  }
}

verifies("integration-runner.sign-in-attacks", () => {
  describe("attack case T4: a server that echoes the token, seen from the runner", () => {
    it("shows the runner the answer with the token removed, in the head, the body and every piece", async () => {
      const { rig, runner, connection, call } = await signedInCall();
      const token = currentToken(rig);
      const middle = Math.floor(token.length / 2);
      const encoder = new TextEncoder();
      rig.server.handle("api.example.com", (request) =>
        request.url.pathname === "/v1/echo"
          ? new Response(
              // The token is split across two pieces, so no single piece holds all of it.
              new ReadableStream({
                start(controller) {
                  controller.enqueue(encoder.encode(`start ${token.slice(0, middle)}`));
                  controller.enqueue(encoder.encode(`${token.slice(middle)} end`));
                  controller.close();
                },
              }),
              { headers: { "x-echo": `Bearer ${token}` } },
            )
          : undefined,
      );

      await runner.send(fetchFrame(call, { url: "https://api.example.com/v1/echo" }));
      const frames = await readAnswer(runner);

      const pieces = frames.filter((frame) => frame.type === "chunk").map(visible);
      expect(pieces.length).toBeGreaterThan(1);
      for (const piece of frames.map(visible)) expect(piece).not.toContain(token);
      expect(pieces.join("")).toBe(`start ${secretRemoved} end`);
      expect(visible(frames[0] as HalonicFrame)).toContain(secretRemoved);
      expect(frames[0]).toMatchObject({ type: "head", status: 200 });
      await connection.close();
    });

    it("shows the runner no token in an error either", async () => {
      const { rig, runner, connection, call, options } = await signedInCall();
      const token = currentToken(rig);
      rig.server.handle("api.example.com", () => {
        throw new Error(`the server fell over with ${token}`);
      });

      await runner.send(fetchFrame(call, { url: "https://api.example.com/v1/echo" }));
      const answer = await runner.next();

      expect(answer).toMatchObject({ type: "error", id: 0 });
      expect(visible(answer)).not.toContain(token);
      expect(options.log.join("")).not.toContain(token);
      await connection.close();
    });
  });

  describe("attack case T5: a token carried by the runner", () => {
    it("refuses the runner's request that carries a value the filter holds, answers it and records the leak attempt", async () => {
      const { rig, runner, connection, call, options } = await signedInCall();
      const values = [
        currentToken(rig),
        rig.server.ledger.grants[0]?.currentRefreshToken ?? "",
        rig.server.clientSecret ?? "",
      ];
      const sent = rig.server.requests.length;

      for (const [id, value] of values.entries()) {
        await runner.send(
          fetchFrame(call, { id, url: `https://cdn.example.com/v1?key=${value}`, auth: [] }),
        );
        const answer = await runner.next();
        expect(answer).toMatchObject({ type: "error", id, code: "secret-in-request" });
        expect(visible(answer)).not.toContain(value);
      }

      expect(rig.server.requests).toHaveLength(sent);
      expect(options.blocks).toEqual(
        Array(3).fill({ kind: "leak-attempt", code: "secret-in-request" }),
      );
      await connection.close();
    });

    it("refuses an older token that still works", async () => {
      const { rig, runner, connection, call, options } = await signedInCall();
      const older = await refreshWhileFirstTokenLives(rig);

      await runner.send(
        fetchFrame(call, { url: `https://cdn.example.com/v1?key=${older}`, auth: [] }),
      );

      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "secret-in-request",
      });
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code: "secret-in-request" }]);
      await connection.close();
    });
  });

  describe("attack cases T2, T3 and T14: placements the sheet doesn't allow", () => {
    it("refuses the token on a declared host the sign-in doesn't list, as an ordinary refusal", async () => {
      const { rig, runner, connection, call, options } = await signedInCall();
      const sent = rig.server.requests.length;

      await runner.send(fetchFrame(call, { url: "https://cdn.example.com/v1/forecast" }));

      expect(await runner.next()).toMatchObject({
        type: "error",
        id: 0,
        code: "token-not-allowed-for-host",
      });
      expect(rig.server.requests).toHaveLength(sent);
      expect(options.blocks).toEqual([]);
      await connection.close();
    });

    it.each([
      [
        "the client secret as a bearer token",
        { secret: clientSecretName, as: "bearer" },
        "secret-sign-in-only",
      ],
      [
        "the token in a header the sheet doesn't say",
        { signIn: signInName, as: "header", header: "x-api-key" },
        "placement-not-in-sheet",
      ],
      [
        "a bearer token as a header with a prefix",
        { signIn: signInName, as: "header", header: "authorization", prefix: "Bearer " },
        "placement-not-in-sheet",
      ],
    ])("refuses %s as a leak attempt, sending nothing", async (_name, placement, code) => {
      const { rig, runner, connection, call, options } = await signedInCall();
      const sent = rig.server.requests.length;

      await runner.send(fetchFrame(call, { auth: [placement] }));

      expect(await runner.next()).toMatchObject({ type: "error", id: 0, code });
      expect(rig.server.requests).toHaveLength(sent);
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code }]);
      // A refusal answers the request; it doesn't stop the runner.
      await runner.send(fetchFrame(call, { id: 1 }));
      expect(await runner.next()).toMatchObject({ type: "head", id: 1, status: 200 });
      await connection.close();
    });
  });
});
