import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectorHostClass } from "./connector-host-class.ts";

verifies("http-kit.address-classes", () => {
  describe("connectorHostClass", () => {
    it.each([
      ["https://notes.acme.test/mcp", "public"],
      ["http://localhost:8080/mcp", "loopback"],
      ["http://LOCALHOST:8080/mcp", "loopback"],
      ["http://127.0.0.1:8080/mcp", "loopback"],
      ["http://[::1]:8080/mcp", "loopback"],
      ["http://192.168.1.20/mcp", "private"],
      ["http://8.8.8.8/mcp", "public"],
      ["http://169.254.169.254/latest", undefined],
      ["http://0.0.0.0/mcp", undefined],
    ])("lets %s lead only to %s", (url, expected) => {
      expect(connectorHostClass(new URL(url))).toBe(expected);
    });
  });
});
