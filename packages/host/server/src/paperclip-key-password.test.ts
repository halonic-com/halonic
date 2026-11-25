import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createDeviceConsole } from "./device-console.ts";
import { password, setup } from "./device-pairing.test-helper.ts";
import type { PaperclipKeyPorts } from "./paperclip-key-api.ts";

const canaryKey = "pcp_board_canary-key-for-password-tests-only";
const address = "https://paperclip.acme.test";

/** A sign-in that keeps its key as the server's would: stored, never answered. */
function keyPort(options: { stored?: boolean } = {}) {
  const store = new Map<string, string>(options.stored === true ? [["halonic", canaryKey]] : []);
  const calls: string[] = [];
  const port: PaperclipKeyPorts = {
    start: async () => {
      calls.push("start");
      return {
        outcome: "started",
        signInId: "sign-in-1",
        phrase: "amber otter quiet lantern",
        approvalUrl: `${address}/cli-auth/c1`,
        expiresAt: "2026-11-12T10:10:00.000Z",
      };
    },
    poll: async () => {
      calls.push("poll");
      store.set("halonic", canaryKey);
      return { status: "connected", connection: "halonic", address, company: "acme-company" };
    },
    cancel: async () => {
      calls.push("cancel");
      return { status: "cancelled" };
    },
    disconnect: async (connection) => {
      calls.push("disconnect");
      return store.delete(connection)
        ? { outcome: "disconnected", revoked: true }
        : { outcome: "unknown" };
    },
  };
  return { port, store, calls };
}

/** A server with the key routes and one paired device, `Laptop`, with its bearer header and id. */
async function withDevice(options: { stored?: boolean } = {}) {
  const keys = keyPort(options);
  const server = setup(keys.port);
  const laptop = await server.pairDevice("Laptop", { cookie: await server.browserCookie() });
  const listed = await server.send("/api/devices", { auth: laptop });
  const laptopId = listed.json.devices?.find((device) => device.name === "Laptop")?.id ?? "";
  const keyRoute = (call: string, body: object, auth = laptop) =>
    server.send(`/api/paperclip-keys/${call}`, { auth, body });
  return { ...keys, server, laptop, laptopId, keyRoute };
}

/** The raw answer, status and body, so two can be compared byte for byte. */
function rawAnswer(answer: { status: number; json: unknown }): string {
  return `${answer.status} ${JSON.stringify(answer.json)}`;
}

verifies("server.paperclip-key-password", () => {
  describe("the password, asked again", () => {
    it("refuses a start and a disconnect without it, and the key stays as it was", async () => {
      const { keyRoute, calls, store } = await withDevice({ stored: true });

      const start = await keyRoute("sign-in/start", { address });
      const disconnect = await keyRoute("disconnect", { connection: "halonic" });

      expect([start.status, disconnect.status]).toEqual([400, 400]);
      expect(calls).toEqual([]);
      expect(store.get("halonic")).toBe(canaryKey);
    });

    it("refuses a wrong one with the same answer whether or not a key is stored", async () => {
      const withKey = await withDevice({ stored: true });
      const withoutKey = await withDevice();

      const answers = [];
      for (const each of [withKey, withoutKey]) {
        const start = await each.keyRoute("sign-in/start", { address, password: "wrong" });
        const off = await each.keyRoute("disconnect", { connection: "halonic", password: "wrong" });
        answers.push([rawAnswer(start), rawAnswer(off)]);
        expect(each.calls).toEqual([]);
      }

      expect(answers[0]).toEqual(answers[1]);
      expect(answers[0]?.[0]).toMatch(/^401 .*"code":"wrong_password"/u);
      expect(withKey.store.get("halonic")).toBe(canaryKey);
    });

    it("counts each try toward the login limit that Add a device uses too", async () => {
      const { keyRoute, server, laptop } = await withDevice();

      for (let tries = 0; tries < 10; tries += 1) {
        await keyRoute("sign-in/start", { address, password: "wrong" });
      }
      const addDevice = await server.send("/api/devices/code", {
        auth: laptop,
        body: { password },
      });
      const start = await keyRoute("sign-in/start", { address, password });

      expect([addDevice.status, start.status]).toEqual([429, 429]);
    });
  });

  describe("with the right password", () => {
    it("connects and disconnects, and records which device did when, with no key", async () => {
      const { keyRoute, server, laptop, laptopId, store, calls } = await withDevice();
      const at = server.clock.now().toISOString();

      expect((await keyRoute("sign-in/start", { address, password })).status).toBe(200);
      expect((await keyRoute("sign-in/poll", { signInId: "sign-in-1" })).status).toBe(200);
      expect(store.get("halonic")).toBe(canaryKey);
      const off = await server.send("/api/paperclip-keys/disconnect", {
        cookie: await server.browserCookie(),
        body: { connection: "halonic", password },
      });

      expect(off.json).toEqual({ outcome: "disconnected", revoked: true });
      expect(calls).toEqual(["start", "poll", "disconnect"]);
      const listed = await server.send("/api/devices", { auth: laptop });
      expect(listed.json.keyChanges).toEqual([
        { connection: "halonic", change: "connected", by: laptopId, at },
        { connection: "halonic", change: "disconnected", by: "browser", at },
      ]);
      const console = createDeviceConsole({
        coordination: server.coordination as unknown as Coordination,
        clock: server.clock,
        secrets: { get: async () => server.secret.hash },
      });
      const reply = await console.answer({ op: "devices" });
      expect(reply["keyChanges"]).toEqual(listed.json.keyChanges);
    });

    it("answers no key on any connection route, nor in the device list", async () => {
      const { keyRoute, server, laptop } = await withDevice({ stored: true });

      const answers = [
        await keyRoute("sign-in/start", { address, password }),
        await keyRoute("sign-in/poll", { signInId: "sign-in-1" }),
        await keyRoute("sign-in/cancel", { signInId: "sign-in-1" }),
        await keyRoute("disconnect", { connection: "halonic", password }),
        await server.send("/api/devices", { auth: laptop }),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(200);
        expect(JSON.stringify(answer.json)).not.toContain(canaryKey);
        expect(JSON.stringify(answer.json)).not.toContain(canaryKey.slice(-12));
      }
    });
  });
});
