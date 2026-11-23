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

    it("says to update when the host closes with unsupported-version", () => {
      const scene = new GatewayScene();
      scene.tunnel.status("connected");
      scene.tunnel.open(1);
      scene.tunnel.host(1, { type: "error", code: "unsupported-version" });
      scene.drop();
      expect(scene.client.view().offReason).toBe(UPDATE_TO_ANSWER);
    });

    it("goes back to the usual words once a host of its own version welcomes it", () => {
      const scene = new GatewayScene();
      scene.tunnel.status("connected");
      scene.tunnel.open(1);
      scene.tunnel.host(1, { type: "error", code: "unsupported-version" });
      scene.generation = 1;
      scene.connect();
      expect(scene.client.view().updateNeeded).toBe(false);
      scene.drop();
      expect(scene.client.view().offReason).toBe(RECONNECT_TO_ANSWER);
    });
  });
});
