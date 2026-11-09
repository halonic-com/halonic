import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { asciiHost } from "./ascii-host.ts";

verifies("std.ascii-host", () => {
  it("only lowercases a host that is already ASCII", () => {
    expect(asciiHost("MCP.Acme.test")).toBe("mcp.acme.test");
  });

  it("writes a label with a non-ASCII letter as xn-- and its Punycode", () => {
    expect(asciiHost("Bücher.example")).toBe("xn--bcher-kva.example");
    expect(asciiHost("münchen-ost.de")).toBe("xn--mnchen-ost-9db.de");
  });

  it("encodes a label with no ASCII letters at all", () => {
    expect(asciiHost("日本語.jp")).toBe("xn--wgv71a119e.jp");
  });

  it("tells a look-alike with Cyrillic letters apart from the Latin host", () => {
    expect(asciiHost("mcp.асme.test")).toBe("mcp.xn--me-6kc2e.test");
    expect(asciiHost("mcp.асme.test")).not.toBe(asciiHost("mcp.acme.test"));
  });

  it("gives the same form for capitals, Unicode and Punycode", () => {
    expect(asciiHost("BÜCHER.example")).toBe("xn--bcher-kva.example");
    expect(asciiHost("xn--bcher-kva.example")).toBe("xn--bcher-kva.example");
  });

  it("composes a letter written as a base letter and an accent", () => {
    expect(asciiHost("bücher.example")).toBe("xn--bcher-kva.example");
  });
});
