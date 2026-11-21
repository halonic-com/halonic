import type { PairingEvent, RemoteState } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostRemoteControl } from "./remote-control.ts";
import { AgentHostError } from "./transport.ts";

const state: RemoteState = {
  available: true,
  on: false,
  tunnelProviderId: "fake",
  tunnel: { state: "down", reason: "stopped", at: "2026-11-21T10:00:00.000Z" },
  allowRiskyRemotely: false,
  phones: [],
  pairing: false,
};

const code: PairingEvent = {
  type: "code",
  code: "ABCDEFGHJKMN",
  qr: "halonic-pair:example",
  hostName: "Test laptop",
  expiresAt: "2026-11-21T10:05:00.000Z",
};

const check: PairingEvent = {
  type: "check",
  checkCode: "ABC123",
  phoneName: "Pixel 8",
  platform: "android",
  allowBy: "2026-11-21T10:02:00.000Z",
};

const paired: PairingEvent = {
  type: "paired",
  phone: {
    id: "phone-1",
    name: "Pixel 8",
    platform: "android",
    pairedAt: "2026-11-21T10:01:00.000Z",
    connected: false,
  },
};

/** Collects a stream's events until it ends. */
async function all(events: AsyncIterable<PairingEvent>): Promise<PairingEvent[]> {
  const seen: PairingEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

/** Opens a pairing on `host`, whose stream the test then drives. */
async function openPairing(host: FakeHost) {
  const remote = new AgentHostRemoteControl(host);
  const opening = host.nextStream("POST /v1/remote/pairing");
  const starting = remote.startPairing();
  const stream = await opening;
  stream.send({ type: "opened", pairing: "pairing-1" });
  return { session: await starting, stream };
}

describe("AgentHostRemoteControl", () => {
  verifies("agent-host-client.remote-control", () => {
    it("streams the host's state, checks each line, and hangs up when the reader leaves", async () => {
      const host = new FakeHost();
      const opening = host.nextStream("GET /v1/remote/state");
      const states = new AgentHostRemoteControl(host).state()[Symbol.asyncIterator]();
      const first = states.next();
      const stream = await opening;
      stream.send(state);
      expect((await first).value).toEqual(state);

      stream.send({ ...state, on: "yes" });
      await expect(states.next()).rejects.toThrow(AgentHostError);
      expect(stream.signal.aborted).toBe(true);
    });

    it("rejects the state with the host's error when it refuses the stream", async () => {
      const host = new FakeHost().refuseStream(
        "GET /v1/remote/state",
        refused(500, "remote_failed", "Remote couldn't finish."),
      );
      const states = new AgentHostRemoteControl(host).state()[Symbol.asyncIterator]();
      await expect(states.next()).rejects.toMatchObject({ status: 500, kind: "remote_failed" });
    });

    it("sends each step to its route, and rejects with the host's refusal", async () => {
      const host = new FakeHost()
        .answer("POST /v1/remote/on", refused(409, "remote_refused", "No remote here."))
        .answer("POST /v1/remote/allow-risky", ok({ ok: true }))
        .answer("POST /v1/remote/revoke", ok({ ok: true }))
        .answer("POST /v1/remote/revoke-all", ok({ ok: true }));
      const remote = new AgentHostRemoteControl(host);

      await expect(remote.setRemote(true)).rejects.toMatchObject({
        status: 409,
        kind: "remote_refused",
        message: "No remote here.",
      });
      await remote.setAllowRiskyRemotely(true);
      await remote.revoke("phone-1");
      await remote.revokeAll();
      expect(host.calls).toEqual([
        { route: "POST /v1/remote/on", body: { on: true } },
        { route: "POST /v1/remote/allow-risky", body: { allow: true } },
        { route: "POST /v1/remote/revoke", body: { phone: "phone-1" } },
        { route: "POST /v1/remote/revoke-all", body: {} },
      ]);
    });

    it("relays a pairing to every reader, each from its first event", async () => {
      const host = new FakeHost().answer("POST /v1/remote/pairing/answer", ok({ ok: true }));
      const { session, stream } = await openPairing(host);
      const early = all(session.events());
      stream.send(code);
      stream.send(check);
      await session.allow();
      expect(host.calls.at(-1)).toEqual({
        route: "POST /v1/remote/pairing/answer",
        body: { pairing: "pairing-1", allow: true },
      });
      stream.send(paired);

      expect(await early).toEqual([code, check, paired]);
      expect(await all(session.events())).toEqual([code, check, paired]);
    });

    it("names the pairing in a new code and a deny", async () => {
      const host = new FakeHost()
        .answer("POST /v1/remote/pairing/new-code", ok({ ok: true }))
        .answer("POST /v1/remote/pairing/answer", ok({ ok: true }));
      const { session } = await openPairing(host);
      await session.newCode();
      await session.deny();
      expect(host.calls.slice(-2)).toEqual([
        { route: "POST /v1/remote/pairing/new-code", body: { pairing: "pairing-1" } },
        { route: "POST /v1/remote/pairing/answer", body: { pairing: "pairing-1", allow: false } },
      ]);
    });

    it("closes the pairing on the host, then hangs up", async () => {
      const host = new FakeHost().answer("POST /v1/remote/pairing/close", ok({ ok: true }));
      const { session, stream } = await openPairing(host);
      const events = all(session.events());
      await session.close();
      expect(host.calls.at(-1)).toEqual({
        route: "POST /v1/remote/pairing/close",
        body: { pairing: "pairing-1" },
      });
      expect(stream.signal.aborted).toBe(true);
      expect(await events).toEqual([{ type: "ended", reason: "closed" }]);
    });

    it("ends a pairing whose stream breaks before it ended, so no reader waits", async () => {
      const { session, stream } = await openPairing(new FakeHost());
      stream.send(code);
      stream.end();
      expect(await all(session.events())).toEqual([code, { type: "ended", reason: "closed" }]);
    });

    it("rejects a pairing the host refuses to open", async () => {
      const host = new FakeHost().refuseStream(
        "POST /v1/remote/pairing",
        refused(409, "remote_refused", "This host doesn't offer remote."),
      );
      await expect(new AgentHostRemoteControl(host).startPairing()).rejects.toMatchObject({
        status: 409,
        kind: "remote_refused",
      });
    });
  });
});
