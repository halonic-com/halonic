import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorIsLocal, outsideHosts } from "../../index.ts";
import { parsedValue, yaml } from "../../test/parse.spec.ts";

function httpConnector(url: string, local?: boolean) {
  const lines = ["id: tracker", "transport:", "  http:", `    url: '${url}'`];
  if (local !== undefined) {
    lines.push(`local: ${local}`);
  }
  return parsedValue("connector", yaml(...lines));
}

verifies("format.connector-is-local", () => {
  it("counts a program on this machine as local and Google as not", () => {
    expect(
      connectorIsLocal(
        parsedValue("connector", yaml("id: a", "transport: { stdio: { command: x } }")),
      ),
    ).toBe(true);
    expect(
      connectorIsLocal(
        parsedValue(
          "connector",
          yaml("id: a", "transport: { google: { account: a@example.com } }"),
        ),
      ),
    ).toBe(false);
  });

  it.each([
    ["http://localhost:3000/mcp", true],
    ["http://LOCALHOST/mcp", true],
    ["http://127.0.0.1:8080", true],
    ["http://127.12.0.3", true],
    ["http://[::1]:3000/mcp", true],
    ["http://user:secret@localhost/mcp", true],
    ["https://tracker.example.com/mcp", false],
    ["https://localhost.example.com", false],
    ["http://10.0.0.5", false],
    ["http://localhost@evil.example.com/", false],
    ["http://tools.localhost/mcp", false],
    ["http://127.tools.example.com/mcp", false],
    ["http://127.0.0.1.example.com/mcp", false],
    ["http://127.1/mcp", false],
  ])("reads %s as local: %s", (url, expected) => {
    expect(connectorIsLocal(httpConnector(url))).toBe(expected);
  });

  it("follows the connector's own setting over its address", () => {
    expect(connectorIsLocal(httpConnector("https://tracker.example.com", true))).toBe(true);
    expect(connectorIsLocal(httpConnector("http://localhost", false))).toBe(false);
  });

  it("doesn't count local: true when the sheet's hosts reach outside this computer", () => {
    const plugin = parsedValue(
      "connector",
      yaml("id: orders", "transport: { plugin: { id: acme-orders } }", "local: true"),
    );
    expect(connectorIsLocal(plugin, ["api.acme.example"])).toBe(false);
    expect(connectorIsLocal(plugin, [{ fromSetting: "shop", class: "public" }])).toBe(false);
    expect(connectorIsLocal(plugin, [{ fromSetting: "tools", class: "loopback" }])).toBe(true);
    expect(connectorIsLocal(plugin, [{ fromSetting: "station", class: "private" }])).toBe(true);
    expect(connectorIsLocal(plugin, [])).toBe(true);
  });

  it("lists the hosts outside this computer and its network", () => {
    const shop = { fromSetting: "shop", class: "public" } as const;
    const station = { fromSetting: "station", class: "loopback" } as const;
    expect(outsideHosts(["api.acme.example:8443", shop, station])).toEqual([
      "api.acme.example:8443",
      shop,
    ]);
  });

  it("counts every fixed host as outside, even one named like this computer", () => {
    // The runner sends a fixed host's name only to a public address.
    const named = ["orders.localhost", "tools.localhost:8080", "127.collect.example.net"];
    expect(outsideHosts(named)).toEqual(named);
  });
});
