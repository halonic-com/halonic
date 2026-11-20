import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectorPlugin } from "./connector-plugin.ts";

verifies("cli.connector-plugin", () => {
  describe("connectorPlugin", () => {
    it("is on, off with why, or broken, as the plugin's own state says", () => {
      expect(connectorPlugin("orders", [{ id: "orders", state: "on" }])).toEqual({ state: "on" });
      expect(connectorPlugin("orders", [{ id: "orders", state: "changed" }])).toEqual({
        state: "off",
        why: "changed",
      });
      expect(connectorPlugin("orders", [{ id: "orders", state: "notTrusted" }])).toEqual({
        state: "off",
        why: "notTrusted",
      });
      expect(connectorPlugin("orders", [{ id: "orders", state: "broken" }])).toEqual({
        state: "broken",
      });
    });

    it("isn't added when no plugin has exactly its id, naming one that is close", () => {
      expect(connectorPlugin("acme-order", [{ id: "acme-orders", state: "on" }])).toEqual({
        state: "not_added",
        near: "acme-orders",
      });
      expect(connectorPlugin("orders", [{ id: "weather", state: "on" }])).toEqual({
        state: "not_added",
        near: undefined,
      });
    });
  });
});
