import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  type PairingDesktop,
  pairingOf,
  sessionEndsAt,
  startPairingDesktop,
} from "./server-pairing.test-helper.ts";
import { hostComputerName } from "./server-pairing.ts";

let desktop: PairingDesktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** Pairs to the end as `name`: started, allowed, polled once. */
async function pairAs(on: PairingDesktop, name: string): Promise<void> {
  const answer = await on.engine.pair(on.server.address, "7KQ2 M9XF", name);
  if (answer.state !== "waiting") throw new Error(`The pairing didn't start: ${answer.state}`);
  on.pairingServer.allow();
  expect(await on.engine.status(answer.pairingId)).toMatchObject({ state: "paired" });
}

verifies("agent-host.server-engine-pairing", () => {
  describe("the state", () => {
    it("answers This computer with its own name, for the pairing dialog", async () => {
      desktop = await startPairingDesktop({ computerName: "Ada's MacBook" });
      expect(await desktop.engine.state()).toEqual({
        engine: "this-computer",
        computerName: "Ada's MacBook",
      });
    });

    it("answers the name it paired as and the pairing's end, after the host starts again", async () => {
      desktop = await startPairingDesktop({ computerName: "Ada's MacBook" });
      const on = desktop;
      await pairAs(on, "Work laptop");
      const again = pairingOf(on, on.pairingKeychain, on.pairingServer);
      expect(await again.state(on.workspace)).toEqual({
        engine: "server",
        address: on.server.address,
        pairing: "kept",
        computerName: "Work laptop",
        sessionEndsAt,
        server: { state: "online", checkedAt: expect.any(String) },
      });
    });

    it("says whether the server answers: offline, or signed out by a 401", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairAs(on, "Work laptop");
      on.pairingServer.unreachable = true;
      expect(await on.engine.state()).toMatchObject({
        pairing: "kept",
        server: { state: "offline" },
      });
      on.pairingServer.unreachable = false;
      on.pairingServer.sources = () => new Response(null, { status: 503 });
      expect(await on.engine.state()).toMatchObject({ server: { state: "offline" } });
      on.pairingServer.sources = () => new Response(null, { status: 401 });
      expect(await on.engine.state()).toMatchObject({ server: { state: "signed-out" } });
    });

    it("doesn't ask the server when the keychain holds no pairing", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairAs(on, "Work laptop");
      const { key } = await on.setting.read(on.workspace);
      await on.keychain.remove(serverPairingSecretName(key));
      const state = await on.engine.state();
      expect(state).toMatchObject({ pairing: "missing", computerName: "Work laptop" });
      expect(state).not.toHaveProperty("server");
      expect(on.pairingServer.calls("/api/messaging/sources")).toEqual([]);
    });
  });

  describe("this computer's own name", () => {
    it("is the host name without .local, and none when the server wouldn't take it", () => {
      expect(hostComputerName("Adas-MacBook.local")).toBe("Adas-MacBook");
      expect(hostComputerName("build-07")).toBe("build-07");
      expect(hostComputerName("")).toBeUndefined();
      expect(hostComputerName("x".repeat(81))).toBeUndefined();
      expect(hostComputerName("tab\there")).toBeUndefined();
    });
  });
});
