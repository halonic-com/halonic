import type { IncomingMessage, ServerResponse } from "node:http";
import type { PairingEvent, PairingSession, RemoteControl, RemoteState } from "@halonicjs/ports";
import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { RemoteNotOffered } from "./remote-not-offered.ts";
import { remoteRoutes } from "./remote-routes.ts";
import { ManualTime } from "./remote-time.test-helper.ts";

const token = randomLaunchToken();
const authorization = { authorization: `Bearer ${token}` };
let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function started(remote: RemoteControl): Promise<string> {
  server = await startHostServer(token, remoteRoutes(remote));
  return server.url;
}

function post(url: string, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** The values of an NDJSON answer, one per line, as they arrive. */
async function* readLines<Line>(response: Response): AsyncGenerator<Line> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body as ReadableStream<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    let end = buffered.indexOf("\n");
    while (end !== -1) {
      yield JSON.parse(buffered.slice(0, end)) as Line;
      buffered = buffered.slice(end + 1);
      end = buffered.indexOf("\n");
    }
  }
}

async function nextLine<Line>(lines: AsyncGenerator<Line>): Promise<Line> {
  const next = await lines.next();
  if (next.done === true) throw new Error("the stream ended");
  return next.value;
}

type PairingLine = PairingEvent | { type: "opened"; pairing: string };

/** Opens a pairing over the route: its id, and the rest of its lines. */
async function openPairing(url: string, signal?: AbortSignal) {
  const lines = readLines<PairingLine>(await post(url, "/v1/remote/pairing", {}, signal));
  const opened = await nextLine(lines);
  if (opened.type !== "opened") throw new Error(`the stream began with ${opened.type}`);
  return { id: opened.pairing, lines };
}

async function errorKind(answer: Response): Promise<string> {
  return ((await answer.json()) as { error: { kind: string } }).error.kind;
}

describe("remoteRoutes", () => {
  verifies("agent-host.remote-routes", () => {
    it("streams the state, the current one first and then each change", async () => {
      const remote = new FakeRemoteControl();
      const url = await started(remote);
      const states = readLines<RemoteState>(
        await fetch(`${url}/v1/remote/state`, { headers: authorization }),
      );
      expect(await nextLine(states)).toMatchObject({ available: true, on: false });

      expect(await (await post(url, "/v1/remote/on", { on: true })).json()).toEqual({ ok: true });
      expect(await nextLine(states)).toMatchObject({ on: true });
      await states.return(undefined);
    });

    it("sets the risky switch and revokes phones", async () => {
      const remote = new FakeRemoteControl();
      const first = remote.addPhone({ name: "Pixel 8" });
      remote.addPhone({ name: "iPhone" });
      const url = await started(remote);

      expect((await post(url, "/v1/remote/allow-risky", { allow: true })).status).toBe(200);
      expect(remote.snapshot.allowRiskyRemotely).toBe(true);
      expect((await post(url, "/v1/remote/revoke", { phone: first.id })).status).toBe(200);
      expect(remote.snapshot.phones.map((phone) => phone.name)).toEqual(["iPhone"]);
      expect((await post(url, "/v1/remote/revoke-all", {})).status).toBe(200);
      expect(remote.snapshot.phones).toEqual([]);
    });

    it("streams a pairing under its id, and pairs the phone the person allows", async () => {
      const remote = new FakeRemoteControl();
      const url = await started(remote);
      const { id, lines } = await openPairing(url);
      expect(await nextLine(lines)).toMatchObject({ type: "code" });

      remote.phoneUsesCode({ name: "Pixel 8" });
      expect(await nextLine(lines)).toMatchObject({ type: "check", phoneName: "Pixel 8" });
      const answer = await post(url, "/v1/remote/pairing/answer", { pairing: id, allow: true });
      expect(answer.status).toBe(200);
      expect(await nextLine(lines)).toMatchObject({ type: "paired", phone: { name: "Pixel 8" } });
      expect((await lines.next()).done).toBe(true);
    });

    it("gives a new code and closes the pairing it names", async () => {
      const remote = new FakeRemoteControl();
      const url = await started(remote);
      const { id, lines } = await openPairing(url);
      const first = await nextLine(lines);

      expect((await post(url, "/v1/remote/pairing/new-code", { pairing: id })).status).toBe(200);
      const second = await nextLine(lines);
      expect(second).toMatchObject({ type: "code" });
      expect(second).not.toEqual(first);
      expect((await post(url, "/v1/remote/pairing/close", { pairing: id })).status).toBe(200);
      expect(await nextLine(lines)).toEqual({ type: "ended", reason: "closed" });
    });

    it("closes the pairing when the caller leaves its stream, as closing the dialog does", async () => {
      const remote = new FakeRemoteControl();
      const url = await started(remote);
      const leave = new AbortController();
      const { id, lines } = await openPairing(url, leave.signal);
      await nextLine(lines);
      expect(remote.snapshot.pairing).toBe(true);

      leave.abort();
      await expect.poll(() => remote.snapshot.pairing).toBe(false);
      const after = await post(url, "/v1/remote/pairing/close", { pairing: id });
      expect(after.status).toBe(404);
      expect(await errorKind(after)).toBe("unknown_pairing");
    });

    it("closes the pairing when the caller left while it was still opening", async () => {
      const remote = new FakeRemoteControl();
      const openPairingNow = remote.startPairing.bind(remote);
      let markAsked: () => void = () => {};
      const asked = new Promise<void>((resolve) => {
        markAsked = resolve;
      });
      let markLeft: () => void = () => {};
      const left = new Promise<void>((resolve) => {
        markLeft = resolve;
      });
      let opened: Promise<PairingSession> | undefined;
      // Opens the pairing only once the host has seen the caller leave, as a slow start would.
      remote.startPairing = () => {
        markAsked();
        opened = left.then(openPairingNow);
        return opened;
      };
      const routes = remoteRoutes(remote).map((route) =>
        route.path === "/v1/remote/pairing"
          ? {
              ...route,
              handle: (request: IncomingMessage, response: ServerResponse) => {
                response.once("close", markLeft);
                return route.handle(request, response);
              },
            }
          : route,
      );
      server = await startHostServer(token, routes);
      const leave = new AbortController();
      const answer = post(server.url, "/v1/remote/pairing", {}, leave.signal);
      await asked;
      leave.abort();
      await expect(answer).rejects.toThrow();

      await opened;
      // The pairing opened after the caller had gone, and the host closes it.
      await expect.poll(() => remote.snapshot.pairing).toBe(false);
      const { lines } = await openPairing(server.url);
      expect(await nextLine(lines)).toMatchObject({ type: "code" });
      await lines.return(undefined);
    });

    it("answers 404 for a pairing it doesn't know", async () => {
      const url = await started(new FakeRemoteControl());
      const answer = await post(url, "/v1/remote/pairing/answer", {
        pairing: "no-such-pairing",
        allow: true,
      });
      expect(answer.status).toBe(404);
      expect(await errorKind(answer)).toBe("unknown_pairing");
    });

    it("answers 409 for a step the host refuses, and 500 for one that fails", async () => {
      const time = new ManualTime();
      const url = await started(new RemoteNotOffered(time));
      const on = await post(url, "/v1/remote/on", { on: true });
      expect(on.status).toBe(409);
      expect(await errorKind(on)).toBe("remote_refused");
      const pairing = await post(url, "/v1/remote/pairing", {});
      expect(pairing.status).toBe(409);
      expect(await errorKind(pairing)).toBe("remote_refused");
      await server?.close();

      const failing = new FakeRemoteControl();
      failing.revokeAll = () => Promise.reject(new Error("the disk is full"));
      const failingUrl = await started(failing);
      const revoked = await post(failingUrl, "/v1/remote/revoke-all", {});
      expect(revoked.status).toBe(500);
      expect(await errorKind(revoked)).toBe("remote_failed");
    });

    it("refuses a body that isn't one the route takes", async () => {
      const url = await started(new FakeRemoteControl());
      expect((await post(url, "/v1/remote/on", { on: "yes" })).status).toBe(400);
      expect((await post(url, "/v1/remote/revoke-all", { phone: "x" })).status).toBe(400);
      expect((await post(url, "/v1/remote/pairing", { code: "x" })).status).toBe(400);
    });

    it("refuses a caller without the launch token", async () => {
      const url = await started(new FakeRemoteControl());
      expect((await fetch(`${url}/v1/remote/state`)).status).toBe(401);
    });
  });

  verifies("agent-host.remote-not-offered", () => {
    it("shows remote unavailable and off, and refuses to turn it on or pair", async () => {
      const time = new ManualTime();
      const remote = new RemoteNotOffered(time);
      const states = remote.state()[Symbol.asyncIterator]();
      expect((await states.next()).value).toMatchObject({
        available: false,
        on: false,
        phones: [],
        pairing: false,
      });
      await expect(remote.setRemote(true)).rejects.toThrow("doesn't offer remote");
      await expect(remote.startPairing()).rejects.toThrow("doesn't offer remote");
      await expect(remote.setAllowRiskyRemotely(true)).rejects.toThrow("doesn't offer remote");
      await expect(remote.setRemote(false)).resolves.toBeUndefined();
      await expect(remote.revokeAll()).resolves.toBeUndefined();
    });
  });
});
