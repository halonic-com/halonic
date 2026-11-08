import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorIsLocal } from "../../index.ts";
import { parsedValue, yaml } from "../../test/parse.ts";

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
    ["http://tools.localhost/mcp", true],
    ["http://127.0.0.1:8080", true],
    ["http://127.12.0.3", true],
    ["http://[::1]:3000/mcp", true],
    ["http://user:secret@localhost/mcp", true],
    ["https://tracker.example.com/mcp", false],
    ["https://localhost.example.com", false],
    ["http://10.0.0.5", false],
    ["http://localhost@evil.example.com/", false],
  ])("reads %s as local: %s", (url, expected) => {
    expect(connectorIsLocal(httpConnector(url))).toBe(expected);
  });

  it("follows the connector's own setting over its address", () => {
    expect(connectorIsLocal(httpConnector("https://tracker.example.com", true))).toBe(true);
    expect(connectorIsLocal(httpConnector("http://localhost", false))).toBe(false);
  });
});
