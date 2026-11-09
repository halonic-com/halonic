import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustUrl } from "./trust-url.ts";

verifies("workspace.trust-content", () => {
  it("lowercases the scheme and host and leaves out the default port", () => {
    expect(trustUrl("HTTPS://MCP.Acme.test:443/v1/mcp")).toBe("https://mcp.acme.test/v1/mcp");
    expect(trustUrl("http://mcp.acme.test:80/v1")).toBe("http://mcp.acme.test/v1");
  });

  it("writes an empty path as /, also before a query", () => {
    expect(trustUrl("https://mcp.acme.test")).toBe("https://mcp.acme.test/");
    expect(trustUrl("https://mcp.acme.test?as=admin")).toBe("https://mcp.acme.test/?as=admin");
  });

  it("writes the host in Punycode", () => {
    expect(trustUrl("https://Bücher.example/mcp")).toBe("https://xn--bcher-kva.example/mcp");
  });

  it("keeps a port, path, query and user info as written", () => {
    expect(trustUrl("https://ops@mcp.acme.test:8443/V1/MCP?as=Admin#top")).toBe(
      "https://ops@mcp.acme.test:8443/V1/MCP?as=Admin#top",
    );
  });

  it("keeps an IPv6 address in its brackets", () => {
    expect(trustUrl("http://[::1]:3000/mcp")).toBe("http://[::1]:3000/mcp");
    expect(trustUrl("http://[::1/mcp")).toBe("http://[::1/mcp");
  });

  it("returns a text that isn't an absolute URL as written", () => {
    expect(trustUrl("mcp.acme.test/v1")).toBe("mcp.acme.test/v1");
  });
});
