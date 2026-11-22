import { connect } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunTable } from "../harness/run-table.ts";
import { NobodyPaired } from "./nobody-paired.ts";
import { gatewayPolicy, RemoteGateway, riskyOff } from "./remote-gateway.ts";
import { RunLedger } from "./run-ledger.ts";

/** A gateway that refuses every phone, and what it reported. */
function gatewayWith(
  access = async () => ({ phones: new NobodyPaired(), pairing: new NobodyPaired() }),
) {
  const ledger = new RunLedger();
  const ownPorts = new Set<number>();
  const logged: string[] = [];
  const gateway = new RemoteGateway({
    ledger,
    runs: new RunTable(ledger),
    access,
    risky: riskyOff,
    ownPorts,
    log: (text) => logged.push(text),
  });
  return { gateway, ownPorts, logged };
}

/** Whether something listens on the loopback port. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

verifies("agent-host.remote-gateway", () => {
  describe("gatewayPolicy", () => {
    it("lets no phone answer a risky approval while nothing sets the switch", () => {
      expect(gatewayPolicy(riskyOff).allowRiskyRemotely()).toBe(false);
    });

    it("asks the switch again for every answer, so a change takes effect at once", () => {
      let allowed = false;
      const policy = gatewayPolicy({ allowRiskyRemotely: () => allowed });
      expect(policy.allowRiskyRemotely()).toBe(false);
      allowed = true;
      expect(policy.allowRiskyRemotely()).toBe(true);
      allowed = false;
      expect(policy.allowRiskyRemotely()).toBe(false);
    });
  });

  describe("RemoteGateway", () => {
    it("listens on loopback between start and stop, and counts its port among the host's own", async () => {
      const { gateway, ownPorts } = gatewayWith();
      const port = await gateway.start();
      if (port === undefined) throw new Error("the gateway didn't start");
      expect(await listening(port)).toBe(true);
      expect([...ownPorts]).toEqual([port]);
      expect(await gateway.start()).toBe(port);
      await gateway.stop();
      expect(await listening(port)).toBe(false);
      expect(ownPorts.size).toBe(0);
    });

    it("takes starts and stops in the order they were called, so the last one decides", async () => {
      const { gateway, ownPorts } = gatewayWith();
      const [, , second] = await Promise.all([gateway.start(), gateway.stop(), gateway.start()]);
      if (second === undefined) throw new Error("the gateway didn't start");
      expect(await listening(second)).toBe(true);
      const [, reopened] = await Promise.all([gateway.stop(), gateway.start(), gateway.stop()]);
      if (reopened === undefined) throw new Error("the gateway didn't start");
      expect(await listening(second)).toBe(false);
      expect(await listening(reopened)).toBe(false);
      expect(ownPorts.size).toBe(0);
    });

    it("doesn't listen, and says why, when its access can't be had", async () => {
      const { gateway, ownPorts, logged } = gatewayWith(async () => {
        throw new Error("The saved remote-host-key isn't a 32-byte key in base64url.");
      });
      expect(await gateway.start()).toBeUndefined();
      expect(ownPorts.size).toBe(0);
      expect(logged.join("")).toContain("The remote gateway didn't start");
    });
  });
});
