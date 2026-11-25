import {
  gatewayFallbackProtocolVersion,
  gatewayMaxMessageBytes,
  gatewayProtocolVersion,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";
import { listedSession } from "../test-support/listed-session.ts";
import { RECONNECT_TO_ANSWER, UPDATE_TO_ANSWER } from "./remote-view.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("remote.phone-gateway-client", () => {
  describe("the pushed session list", () => {
    it("takes each push in full, so off, on, off ends with answersRisky false", () => {
      const scene = new GatewayScene();
      scene.connectAndList([listedSession({ id: "s1" })]);
      for (const answersRisky of [false, true, false]) {
        scene.push([listedSession({ id: "s2" })], answersRisky);
      }
      const view = scene.client.view();
      expect(view.answersRisky).toBe(false);
      expect(view.sessions.map((session) => session.id)).toEqual(["s2"]);
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("shows what the newest list said of the risky switch", () => {
      const scene = new GatewayScene();
      expect(scene.client.view().answersRisky).toBe(false);
      scene.connect();
      scene.list([], true);
      expect(scene.client.view().answersRisky).toBe(true);
    });

    it("ends the session on a push before welcome", () => {
      const scene = new GatewayScene();
      scene.tunnel.status("connected");
      scene.tunnel.open(1);
      scene.generation = 1;
      scene.push([], true);
      expect(scene.tunnel.ended).toEqual([1]);
      expect(scene.client.view().answersRisky).toBe(false);
    });
  });

  describe("a computer of another message version", () => {
    it("says to update, not to wait, when an older host welcomes the phone", () => {
      const scene = new GatewayScene();
      scene.tunnel.status("connected");
      scene.tunnel.open(1);
      scene.tunnel.host(1, { type: "welcome", replyTo: "p-1", version: 2, maxMessageBytes: 9 });
      const view = scene.client.view();
      expect(view.updateNeeded).toBe(true);
      expect(view.canAnswer).toBe(false);
      expect(view.offReason).toBe(UPDATE_TO_ANSWER);
    });

    it("says to update when the host closes with unsupported-version on both versions", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      refuseHello(scene, 2);
      scene.drop();
      expect(scene.client.view().offReason).toBe(UPDATE_TO_ANSWER);
    });

    it("goes back to the usual words once a host of its own version welcomes it", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      refuseHello(scene, 2);
      scene.generation = 2;
      scene.connect();
      expect(scene.client.view().updateNeeded).toBe(false);
      scene.drop();
      expect(scene.client.view().offReason).toBe(RECONNECT_TO_ANSWER);
    });
  });
});

/** A session opens and the host closes on its `hello`'s version. */
function refuseHello(scene: GatewayScene, generation: number): void {
  scene.tunnel.status("connected");
  scene.tunnel.open(generation);
  scene.tunnel.host(generation, { type: "error", code: "unsupported-version" });
  scene.drop();
}

/** A session opens and a host of `version` welcomes the phone's `hello`. */
function welcomeAt(scene: GatewayScene, generation: number, version: number): void {
  scene.tunnel.status("connected");
  scene.tunnel.open(generation);
  const replyTo = scene.tunnel.lastOf("hello").id;
  scene.tunnel.host(generation, {
    type: "welcome",
    replyTo,
    version,
    maxMessageBytes: gatewayMaxMessageBytes,
  });
}

const helloVersions = (scene: GatewayScene) =>
  scene.tunnel.sentOf("hello").map((hello) => hello.version);

verifies("ports.remote-gateway-protocol", () => {
  describe("a version 4 phone and a version 3 computer", () => {
    it("says hello again with version 3 after unsupported-version, and offers Agents only", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      expect(scene.client.view().updateNeeded).toBe(false);
      welcomeAt(scene, 2, gatewayFallbackProtocolVersion);
      expect(helloVersions(scene)).toEqual([
        gatewayProtocolVersion,
        gatewayFallbackProtocolVersion,
      ]);
      expect(scene.tunnel.sentOf("list-sessions")).toHaveLength(1);
      scene.generation = 2;
      scene.list([listedSession({ id: "s1" })]);
      const view = scene.client.view();
      expect(view.olderComputer).toBe(true);
      expect(view.updateNeeded).toBe(false);
      expect(view.canAnswer).toBe(true);
      expect(scene.tunnel.ended).toEqual([]);
    });

    it("tries version 4 first on every session, and offers everything once the computer speaks it", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      welcomeAt(scene, 2, gatewayFallbackProtocolVersion);
      scene.drop();
      welcomeAt(scene, 3, gatewayProtocolVersion);
      expect(helloVersions(scene)).toEqual([4, 3, 4]);
      expect(scene.client.view().olderComputer).toBe(false);
    });

    it("keeps offering Agents only across a reconnect to the same older computer", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      welcomeAt(scene, 2, gatewayFallbackProtocolVersion);
      refuseHello(scene, 3);
      expect(scene.client.view().olderComputer).toBe(true);
      welcomeAt(scene, 4, gatewayFallbackProtocolVersion);
      expect(helloVersions(scene)).toEqual([4, 3, 4, 3]);
      expect(scene.client.view().olderComputer).toBe(true);
    });

    it("closes on a version 4 welcome to its version 3 hello", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      welcomeAt(scene, 2, gatewayProtocolVersion);
      expect(scene.tunnel.ended).toEqual([2]);
      expect(scene.client.view().updateNeeded).toBe(true);
    });

    it("forgets the older computer when it removes this phone", () => {
      const scene = new GatewayScene();
      refuseHello(scene, 1);
      welcomeAt(scene, 2, gatewayFallbackProtocolVersion);
      scene.tunnel.status("removed");
      expect(scene.client.view().olderComputer).toBe(false);
    });
  });
});
