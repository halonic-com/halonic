import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { trustUrl } from "./trust-url.ts";

verifies("workspace.trust-content", () => {
  it("lowercases the scheme and host and leaves out the default port", () => {
    expect(trustUrl("HTTPS://MCP.Acme.test:443/v1/mcp")).toEqual({
      url: "https://mcp.acme.test/v1/mcp",
    });
    expect(trustUrl("http://mcp.acme.test:80/v1")).toEqual({ url: "http://mcp.acme.test/v1" });
  });

  it("writes an empty path as /, also before a query", () => {
    expect(trustUrl("https://mcp.acme.test")).toEqual({ url: "https://mcp.acme.test/" });
    expect(trustUrl("https://mcp.acme.test?as=admin")).toEqual({
      url: "https://mcp.acme.test/?as=admin",
    });
  });

  it("writes the host in Punycode", () => {
    expect(trustUrl("https://Bücher.example/mcp")).toEqual({
      url: "https://xn--bcher-kva.example/mcp",
    });
  });

  it("keeps a port, path, query and fragment as written", () => {
    expect(trustUrl("https://mcp.acme.test:8443/V1/MCP?as=Admin#top")).toEqual({
      url: "https://mcp.acme.test:8443/V1/MCP?as=Admin#top",
    });
  });

  it("keeps an IPv6 address in its brackets", () => {
    expect(trustUrl("http://[::1]:3000/mcp")).toEqual({ url: "http://[::1]:3000/mcp" });
    expect(trustUrl("http://[::1/mcp")).toEqual({ url: "http://[::1/mcp" });
  });

  it("returns a text that isn't an absolute URL as written", () => {
    expect(trustUrl("mcp.acme.test/v1")).toEqual({ url: "mcp.acme.test/v1" });
  });

  it("refuses a backslash before the query, which some parsers read as another server", () => {
    expect(trustUrl("https://evil.test\\@mcp.acme.test/")).toEqual({
      refused: "the URL has a backslash before its query",
    });
    expect(trustUrl("https:\\\\evil.test/mcp")).toHaveProperty("refused");
    expect(trustUrl("https://mcp.acme.test/v1\\..\\admin")).toHaveProperty("refused");
  });

  it("keeps a backslash in the query or fragment as written", () => {
    expect(trustUrl("https://mcp.acme.test/v1?path=a\\b")).toEqual({
      url: "https://mcp.acme.test/v1?path=a\\b",
    });
  });

  it("refuses user info, so a password never goes into the content", () => {
    expect(trustUrl("https://ops:pw@mcp.acme.test/")).toEqual({
      refused: "the URL has user info",
    });
    expect(trustUrl("https://ops@mcp.acme.test/")).toEqual({ refused: "the URL has user info" });
  });

  it("refuses an http or https URL without //", () => {
    expect(trustUrl("https:ops:pw@mcp.acme.test/")).toEqual({
      refused: "the URL has no // after its scheme",
    });
  });
});
