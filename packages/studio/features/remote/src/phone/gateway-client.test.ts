import { gatewayProtocolVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeComputerTunnel } from "../test-support/fake-computer-tunnel.ts";
import { GatewayScene, listedSession, SCENE_COMPUTER } from "../test-support/gateway-scene.ts";
import { GatewayClient, listEveryMs } from "./gateway-client.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const said = (text: string) => ({ type: "message", role: "agent", text }) as const;

verifies("remote.phone-gateway-client", () => {
  describe("hello and the session list", () => {
    it("says hello on each new session, and lists the sessions after welcome", () => {
      const scene = new GatewayScene();
      scene.tunnel.open(1);
      expect(scene.tunnel.sent).toEqual([
        { generation: 1, message: { type: "hello", id: "p-1", version: gatewayProtocolVersion } },
      ]);
      scene.generation = 1;
      scene.host({ type: "welcome", replyTo: "p-1", version: 2, maxMessageBytes: 65_519 });
      expect(scene.tunnel.lastOf("list-sessions")).toEqual({ type: "list-sessions", id: "p-2" });
    });

    it("picks up a session that opened before it subscribed", () => {
      const tunnel = new FakeComputerTunnel();
      tunnel.status("connected");
      tunnel.open(4);
      const client = new GatewayClient(tunnel, SCENE_COMPUTER);
      expect(tunnel.sent).toEqual([
        { generation: 4, message: { type: "hello", id: "p-1", version: gatewayProtocolVersion } },
      ]);
      expect(client.view().label.text).toBe(`Connected · ${SCENE_COMPUTER}`);
    });

    it("ends the session on a welcome of another version", () => {
      const scene = new GatewayScene();
      scene.tunnel.open(1);
      scene.tunnel.host(1, { type: "welcome", replyTo: "p-1", version: 3, maxMessageBytes: 9 });
      expect(scene.tunnel.ended).toEqual([1]);
      expect(scene.tunnel.sentOf("list-sessions")).toEqual([]);
    });

    it("lists again every 15 seconds only while connected and in front", () => {
      const scene = new GatewayScene();
      scene.connectAndList([]);
      vi.advanceTimersByTime(listEveryMs);
      scene.list([]);
      expect(scene.tunnel.sentOf("list-sessions")).toHaveLength(2);

      scene.client.setInFront(false);
      vi.advanceTimersByTime(listEveryMs * 4);
      expect(scene.tunnel.sentOf("list-sessions")).toHaveLength(2);

      scene.client.setInFront(true);
      scene.drop();
      vi.advanceTimersByTime(listEveryMs * 4);
      expect(scene.tunnel.sentOf("list-sessions")).toHaveLength(2);
    });

    it("never has two session lists waiting at once", () => {
      const scene = new GatewayScene();
      scene.connect();
      vi.advanceTimersByTime(listEveryMs * 3);
      expect(scene.tunnel.sentOf("list-sessions")).toHaveLength(1);
    });
  });

  describe("watches", () => {
    it("watches running and waiting sessions, up to 16, and unwatches one that ends", () => {
      const scene = new GatewayScene();
      const many = Array.from({ length: 20 }, (_, index) =>
        listedSession({ id: `s-${index}`, state: index === 0 ? "done" : "running" }),
      );
      scene.connectAndList(many);
      const watched = scene.tunnel.sentOf("watch").map((watch) => watch.sessionId);
      expect(watched).toEqual(many.slice(1, 17).map((session) => session.id));

      vi.advanceTimersByTime(listEveryMs);
      scene.list(
        many.map((session) => (session.id === "s-1" ? { ...session, state: "done" } : session)),
      );
      expect(scene.tunnel.lastOf("unwatch").sessionId).toBe("s-1");
      expect(scene.tunnel.lastOf("watch").sessionId).toBe("s-17");
    });

    it("resumes each watch after a reconnect from the last seq it holds", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession({ lastSeq: 0 })]);
      scene.event("session-1", 1, said("one"));
      scene.event("session-1", 2, said("two"));
      scene.drop();
      scene.connectAndList([listedSession({ lastSeq: 5 })]);
      expect(scene.tunnel.lastOf("watch")).toMatchObject({ sessionId: "session-1", afterSeq: 2 });
      expect(scene.client.view().sessions[0]?.events.map((event) => event.seq)).toEqual([1, 2]);
    });

    it("watches from 0 after a gap, ignoring the old watch until the host confirms the new one", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession({ lastSeq: 0 })]);
      scene.event("session-1", 1, said("one"));
      scene.event("session-1", 3, said("three"));
      const rewatch = scene.tunnel.lastOf("watch");
      expect(rewatch.afterSeq).toBe(0);
      expect(scene.client.view().sessions[0]?.events).toEqual([]);

      scene.event("session-1", 4, said("four, from the old watch"));
      expect(scene.client.view().sessions[0]?.events).toEqual([]);
      scene.ok(rewatch.id);
      for (const seq of [1, 2, 3, 4]) scene.event("session-1", seq, said(`replayed ${seq}`));
      expect(scene.client.view().sessions[0]?.events.map((event) => event.seq)).toEqual([
        1, 2, 3, 4,
      ]);
    });

    it("watches from 0 again when the new watch drops or is refused before its ok", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession({ lastSeq: 0 })]);
      scene.event("session-1", 1, said("one"));
      scene.event("session-1", 3, said("three"));
      scene.drop();

      scene.connectAndList([listedSession({ lastSeq: 3 })]);
      const afterDrop = scene.tunnel.lastOf("watch");
      expect(afterDrop.afterSeq).toBe(0);
      scene.host({ type: "error", replyTo: afterDrop.id, code: "too-many-watches" });
      scene.event("session-1", 1, said("not watched"));
      expect(scene.client.view().sessions[0]?.events).toEqual([]);

      vi.advanceTimersByTime(listEveryMs);
      scene.list([listedSession({ lastSeq: 3 })]);
      const afterRefusal = scene.tunnel.lastOf("watch");
      expect(afterRefusal.afterSeq).toBe(0);
      scene.ok(afterRefusal.id);
      for (const seq of [1, 2, 3]) scene.event("session-1", seq, said(`replayed ${seq}`));
      expect(scene.client.view().sessions[0]?.events.map((event) => event.seq)).toEqual([1, 2, 3]);
    });

    it("watches from 0 after history-gone, dropping what it held", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession({ lastSeq: 0 })]);
      scene.event("session-1", 1, said("one"));
      scene.event("session-1", 2, said("two"));
      scene.drop();
      scene.connectAndList([listedSession({ lastSeq: 9 })]);
      expect(scene.tunnel.lastOf("watch").afterSeq).toBe(2);
      scene.host({ type: "error", replyTo: scene.tunnel.lastOf("watch").id, code: "history-gone" });
      expect(scene.tunnel.lastOf("watch").afterSeq).toBe(0);
      expect(scene.client.view().sessions[0]?.events).toEqual([]);
    });
  });

  describe("host text it refuses ends the session", () => {
    it("ends the session on a malformed message, and on an answer to nothing it sent", () => {
      const scene = new GatewayScene();
      scene.connectAndList([]);
      scene.host("{not json");
      expect(scene.tunnel.ended).toEqual([1]);

      scene.connectAndList([]);
      scene.ok("p-999");
      expect(scene.tunnel.ended).toEqual([1, 2]);
    });

    it("says hello again only when the shell opens a new session", () => {
      const scene = new GatewayScene();
      scene.connect();
      for (let tries = 0; tries < 50; tries += 1) scene.host('{"type":"run-command"}');
      expect(scene.tunnel.ended).toEqual([1]);
      expect(scene.tunnel.sentOf("hello")).toHaveLength(1);
    });

    it("ignores a message of an earlier session", () => {
      const scene = new GatewayScene();
      scene.connect();
      scene.drop();
      scene.connect();
      scene.tunnel.host(1, "{not json");
      expect(scene.tunnel.ended).toEqual([]);
    });
  });

  describe("removed", () => {
    it("forgets the computer's sessions at once", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession()]);
      scene.tunnel.status("removed");
      expect(scene.client.view().sessions).toEqual([]);
      expect(scene.client.view().asOf).toBeUndefined();
    });
  });
});
