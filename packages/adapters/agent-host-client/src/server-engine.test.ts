import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostServerEngine } from "./server-engine.ts";

const workspace = "/work/acme";
const address = "https://halonic.acme.test";
const pairingId = "0123456789abcdef0123456789abcdef";
const prefix = "POST /v1/messaging/server-engine";

verifies("agent-host-client.server-engine", () => {
  describe("AgentHostServerEngine", () => {
    it("reads the workspace's engine with the workspace only", async () => {
      const state = { engine: "server", address, pairing: "kept" };
      const host = new FakeHost().answer(`${prefix}/state`, ok(state));
      expect(await new AgentHostServerEngine(host, workspace).state()).toEqual(state);
      expect(host.calls).toEqual([{ route: `${prefix}/state`, body: { workspace } }]);
    });

    it("passes on the computer's name, the paired name and the reach, and refuses a name with a control character", async () => {
      const state = {
        engine: "server",
        address,
        pairing: "kept",
        computerName: "acme-mbp",
        deviceName: "Work laptop",
        reach: { state: "offline", asOf: "2026-11-26T14:02:00.000Z" },
      };
      const host = new FakeHost().answer(`${prefix}/state`, ok(state));
      expect(await new AgentHostServerEngine(host, workspace).state()).toEqual(state);
      const named = { engine: "this-computer", computerName: "acme\nmbp" };
      const broken = new FakeHost().answer(`${prefix}/state`, ok(named));
      await expect(new AgentHostServerEngine(broken, workspace).state()).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });

    it("pairs with the address, code and name, and answers the check code", async () => {
      const waiting = {
        state: "waiting",
        pairingId,
        checkCode: "4F72KQ",
        expiresAt: "2026-11-24T14:10:00.000Z",
      };
      const host = new FakeHost().answer(`${prefix}/pair`, ok(waiting));
      const engine = new AgentHostServerEngine(host, workspace);
      expect(await engine.pair(address, "7KQ2 M9XF", "Acme laptop")).toEqual(waiting);
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, address, code: "7KQ2 M9XF", deviceName: "Acme laptop" },
      ]);
    });

    it("answers each ending as the host gave it, too_many with its minutes", async () => {
      const host = new FakeHost()
        .answer(`${prefix}/pair`, ok({ state: "too_many", minutes: 3 }))
        .answer(`${prefix}/pair-status`, ok({ state: "paired", sessionEndsAt: "2027-02-22" }))
        .answer(`${prefix}/pair-cancel`, ok({ cancelled: false }))
        .answer(`${prefix}/use-this-computer`, ok({ stillValid: true }));
      const engine = new AgentHostServerEngine(host, workspace);
      expect(await engine.pair(address, "7KQ2", "Acme laptop")).toEqual({
        state: "too_many",
        minutes: 3,
      });
      expect(await engine.status(pairingId)).toEqual({
        state: "paired",
        sessionEndsAt: "2027-02-22",
      });
      expect(await engine.cancel(pairingId)).toBe(false);
      expect(await engine.useThisComputer()).toEqual({ stillValid: true });
      expect(host.calls.slice(1).map((call) => call.body)).toEqual([
        { pairingId },
        { pairingId },
        { workspace },
      ]);
    });

    it("fails with keychain_needed, and with answer_invalid for an answer holding a token", async () => {
      const host = new FakeHost()
        .answer(`${prefix}/state`, refused(409, "keychain_needed", "No keychain."))
        .answer(
          `${prefix}/pair-status`,
          ok({ state: "paired", sessionEndsAt: "2027-02-22", token: "acme-device-token" }),
        );
      const engine = new AgentHostServerEngine(host, workspace);
      await expect(engine.state()).rejects.toMatchObject({ status: 409, kind: "keychain_needed" });
      await expect(engine.status(pairingId)).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
