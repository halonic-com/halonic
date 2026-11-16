import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type TunnelConfig,
  type TunnelEndpoint,
  type TunnelProvider,
  type TunnelStatus,
  tunnelReasons,
  tunnelStates,
} from "./tunnel-provider.ts";

verifies("ports.tunnel-provider", () => {
  typeTest("has exactly capabilities, start, status and stop", () => {
    expectTypeOf<keyof TunnelProvider>().toEqualTypeOf<
      "capabilities" | "start" | "status" | "stop"
    >();
    expectTypeOf<TunnelProvider["start"]>().toEqualTypeOf<
      (config: TunnelConfig) => Promise<TunnelEndpoint>
    >();
    expectTypeOf<TunnelProvider["status"]>().toEqualTypeOf<() => AsyncIterable<TunnelStatus>>();
  });

  typeTest("points a tunnel only at the gateway on loopback", () => {
    expectTypeOf<keyof TunnelConfig>().toEqualTypeOf<"gateway">();
    const config: TunnelConfig = { gateway: { host: "127.0.0.1", port: 4100 } };
    // @ts-expect-error: every interface is not loopback
    const everywhere: TunnelConfig = { gateway: { host: "0.0.0.0", port: 4100 } };
    // @ts-expect-error: a LAN address is not loopback either
    const lan: TunnelConfig = { gateway: { host: "192.168.1.20", port: 4100 } };
    expectTypeOf([config, everywhere, lan]).toEqualTypeOf<TunnelConfig[]>();
  });

  typeTest("gives a reason exactly when the tunnel is degraded or down", () => {
    const ready: TunnelStatus = { state: "ready", at: "2026-11-16T08:00:00.000Z" };
    const down: TunnelStatus = { state: "down", reason: "offline", at: "2026-11-16T08:00:00.000Z" };
    // @ts-expect-error: down needs a reason
    const unexplained: TunnelStatus = { state: "down", at: "2026-11-16T08:00:00.000Z" };
    const explained: TunnelStatus = {
      state: "ready",
      // @ts-expect-error: ready has no reason
      reason: "offline",
      at: "2026-11-16T08:00:00.000Z",
    };
    expectTypeOf([ready, down, unexplained, explained]).toEqualTypeOf<TunnelStatus[]>();
  });

  it("lists the four states and the reasons Studio words", () => {
    expect(tunnelStates).toEqual(["starting", "ready", "degraded", "down"]);
    expect(tunnelReasons).toEqual([
      "not-installed",
      "signed-out",
      "offline",
      "provider-error",
      "public-refused",
      "stopped",
    ]);
  });
});
