import type { ComputerId, ComputerTunnelEvent } from "@halonicjs/studio-feature-remote/phone";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-phone-shell.test-helper.ts";
import { TauriPhoneTunnel } from "./tauri-phone-tunnel.ts";

const c1 = "c1" as ComputerId;
const hello = '{"type":"hello","id":"h1","version":1}';

function tunnelWith(answers: Record<string, unknown> = {}) {
  const shell = new FakeShell();
  for (const [command, answer] of Object.entries(answers)) shell.answers.set(command, answer);
  const reported: string[] = [];
  const phone = new TauriPhoneTunnel(shell, (line) => reported.push(line));
  return { shell, reported, phone, tunnel: phone.computerTunnel(c1) };
}

/** Subscribes and keeps every event the client gets. */
function record(tunnel: ReturnType<typeof tunnelWith>["tunnel"]): ComputerTunnelEvent[] {
  const events: ComputerTunnelEvent[] = [];
  tunnel.subscribe((event) => events.push(event));
  return events;
}

verifies("studio.connect.phone-tunnel-messages", () => {
  describe("sending", () => {
    it("hands the shell the computer, the session and the text", async () => {
      const { shell, tunnel } = tunnelWith({ tunnel_send: { sent: true } });
      expect(await tunnel.send(3, hello)).toEqual({ sent: true });
      expect(shell.calls).toEqual([
        { command: "tunnel_send", args: { computer: "c1", generation: 3, text: hello } },
      ]);
    });

    it("passes each refusal on as the port's reason", async () => {
      for (const reason of ["not-open", "too-large", "not-allowed"]) {
        const { tunnel } = tunnelWith({ tunnel_send: { sent: false, reason } });
        expect(await tunnel.send(3, hello)).toEqual({ sent: false, reason });
      }
    });

    it("never rejects: a refused command or an unknown answer is not-open, with no text logged", async () => {
      const refused = tunnelWith();
      expect(await refused.tunnel.send(3, hello)).toEqual({ sent: false, reason: "not-open" });
      const unknown = tunnelWith({ tunnel_send: { sent: "maybe" } });
      expect(await unknown.tunnel.send(3, hello)).toEqual({ sent: false, reason: "not-open" });
      const lines = [...refused.reported, ...unknown.reported];
      expect(lines).toEqual([
        "tunnel_send was refused",
        "tunnel_send gave an answer the page doesn't know",
      ]);
      expect(lines.join("\n")).not.toContain("hello");
    });
  });

  describe("ending a session", () => {
    it("asks the shell to end that session, and doesn't reject when it refuses", async () => {
      const ends = tunnelWith({ tunnel_end_session: null });
      await ends.tunnel.endSession(3);
      expect(ends.shell.calls).toEqual([
        { command: "tunnel_end_session", args: { computer: "c1", generation: 3 } },
      ]);
      const refused = tunnelWith();
      await expect(refused.tunnel.endSession(3)).resolves.toBeUndefined();
      expect(refused.reported).toEqual(["tunnel_end_session was refused"]);
    });
  });

  describe("events", () => {
    it("passes on only its computer's events, with host messages unread", () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const events = record(tunnel);
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendEvent(1, { kind: "session-opened", computer: "c1", generation: 3 });
      shell.sendEvent(2, { kind: "session-opened", computer: "c2", generation: 4 });
      shell.sendEvent(3, { kind: "message", computer: "c2", generation: 4, text: "{}" });
      shell.sendEvent(4, { kind: "message", computer: "c1", generation: 3, text: "not json" });
      shell.sendStatus(5, "c1", { state: "connected" });
      expect(events).toEqual([
        { kind: "status", state: "reconnecting" },
        { kind: "session-opened", generation: 3 },
        { kind: "message", generation: 3, text: "not json" },
        { kind: "status", state: "connected" },
      ]);
    });

    it("gives the client no status for paused or closed", () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const events = record(tunnel);
      shell.sendStatus(0, "c1", { state: "paused" });
      shell.sendStatus(1, "c1", { state: "closed" });
      shell.sendStatus(2, "c1", { state: "reconnecting", lastTry: "network-down" });
      expect(events).toEqual([{ kind: "status", state: "phoneOffline" }]);
    });

    it("gives a later subscriber the latest status, then the open session", () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      record(tunnel);
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendEvent(1, { kind: "session-opened", computer: "c1", generation: 3 });
      shell.sendStatus(2, "c1", { state: "connected" });
      shell.sendEvent(3, { kind: "message", computer: "c1", generation: 3, text: "{}" });
      expect(record(tunnel)).toEqual([
        { kind: "status", state: "connected" },
        { kind: "session-opened", generation: 3 },
      ]);
    });

    it("doesn't hand a later subscriber a session that ended", async () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true, tunnel_end_session: null });
      record(tunnel);
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendEvent(1, { kind: "session-opened", computer: "c1", generation: 3 });
      await tunnel.endSession(3);
      expect(record(tunnel)).toEqual([{ kind: "status", state: "reconnecting" }]);
      shell.sendEvent(2, { kind: "session-opened", computer: "c1", generation: 4 });
      shell.sendStatus(3, "c1", { state: "reconnecting" });
      expect(record(tunnel)).toEqual([{ kind: "status", state: "reconnecting" }]);
    });

    it("doesn't hand a later subscriber a session the app's pause ended", () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      record(tunnel);
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendEvent(1, { kind: "session-opened", computer: "c1", generation: 3 });
      shell.sendStatus(2, "c1", { state: "connected" });
      shell.sendStatus(3, "c1", { state: "paused" });
      expect(record(tunnel)).toEqual([]);
    });

    it("shares the screens' one watch channel", () => {
      const { shell, phone, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      phone.onStatus(() => undefined);
      record(tunnel);
      record(phone.computerTunnel("c2" as ComputerId));
      expect(shell.commands()).toEqual(["phone_tunnel_watch"]);
      expect(shell.openChannels()).toBe(1);
    });

    it("reports an event it can't read without the message's text", () => {
      const { shell, reported, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const events = record(tunnel);
      const text = "a message the log must not hold";
      shell.sendEvent(0, { kind: "message", computer: "c1", generation: 0, text });
      expect(events).toEqual([]);
      expect(reported).toEqual(["phone_tunnel_watch sent an event the page doesn't know"]);
    });
  });
});
