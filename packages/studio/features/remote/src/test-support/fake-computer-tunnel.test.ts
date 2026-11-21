import { type GatewayHostMessage, gatewayProtocolVersion } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import type { ComputerTunnelEvent } from "../phone/computer-tunnel.ts";
import { FakeComputerTunnel } from "./fake-computer-tunnel.ts";

function listen(tunnel: FakeComputerTunnel): { events: ComputerTunnelEvent[]; stop: () => void } {
  const events: ComputerTunnelEvent[] = [];
  const stop = tunnel.subscribe((event) => events.push(event));
  return { events, stop };
}

describe("FakeComputerTunnel", () => {
  it("replays the current status and open session to a new subscriber", () => {
    const tunnel = new FakeComputerTunnel();
    tunnel.status("connected");
    tunnel.open(3);

    expect(listen(tunnel).events).toEqual([
      { kind: "status", state: "connected" },
      { kind: "session-opened", generation: 3 },
    ]);
  });

  it("replays no session once the connection is no longer connected", () => {
    const tunnel = new FakeComputerTunnel();
    tunnel.status("connected");
    tunnel.open(3);
    tunnel.status("reconnecting");

    expect(listen(tunnel).events).toEqual([{ kind: "status", state: "reconnecting" }]);
  });

  it("passes the host's messages on as text until the subscriber stops", () => {
    const tunnel = new FakeComputerTunnel();
    const { events, stop } = listen(tunnel);
    const welcome: GatewayHostMessage = {
      type: "welcome",
      replyTo: "h1",
      version: gatewayProtocolVersion,
      maxMessageBytes: 65_536,
    };

    tunnel.host(1, welcome);
    tunnel.host(1, "not json");
    stop();
    tunnel.host(1, "after stop");

    expect(events).toEqual([
      { kind: "message", generation: 1, text: JSON.stringify(welcome) },
      { kind: "message", generation: 1, text: "not json" },
    ]);
  });

  it("records what the page sends, and sends nothing while it refuses", async () => {
    const tunnel = new FakeComputerTunnel();
    tunnel.status("connected");
    tunnel.open(1);

    expect(await tunnel.send(1, JSON.stringify({ type: "list-sessions" }))).toEqual({ sent: true });
    tunnel.refuseWith = "not-open";
    expect(await tunnel.send(1, JSON.stringify({ type: "list-sessions" }))).toEqual({
      sent: false,
      reason: "not-open",
    });

    expect(tunnel.sentOf("list-sessions")).toHaveLength(1);
    expect(tunnel.lastOf("list-sessions").type).toBe("list-sessions");
    expect(() => tunnel.lastOf("hello")).toThrow("the page sent no hello");
  });

  it("refuses not-open for a generation that isn't the open session's", async () => {
    const tunnel = new FakeComputerTunnel();
    const listSessions = JSON.stringify({ type: "list-sessions" });

    expect(await tunnel.send(1, listSessions)).toEqual({ sent: false, reason: "not-open" });
    tunnel.status("connected");
    tunnel.open(1);
    tunnel.open(2);
    expect(await tunnel.send(1, listSessions)).toEqual({ sent: false, reason: "not-open" });
    expect(await tunnel.send(2, listSessions)).toEqual({ sent: true });
    tunnel.status("reconnecting");
    expect(await tunnel.send(2, listSessions)).toEqual({ sent: false, reason: "not-open" });

    expect(tunnel.sent).toEqual([{ generation: 2, message: { type: "list-sessions" } }]);
  });

  it("records ended sessions and stops replaying the one that ended", async () => {
    const tunnel = new FakeComputerTunnel();
    tunnel.status("connected");
    tunnel.open(2);

    await tunnel.endSession(2);

    expect(tunnel.ended).toEqual([2]);
    expect(listen(tunnel).events).toEqual([{ kind: "status", state: "connected" }]);
  });
});
