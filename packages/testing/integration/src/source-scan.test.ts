import { describe, expect, it } from "vitest";
import { scanIntegrationSource } from "./source-scan.ts";

describe("testing-integration.source-scan", () => {
  it.each([
    ["global fetch (use host.http)", 'await fetch("https://x.example")'],
    ["globalThis, window or self", "globalThis.secret = 1;"],
    ["process or the environment", 'const key = process.env["KEY"];'],
    ["node: modules", 'import { readFile } from "node:fs/promises";'],
    ["node: modules", 'const fs = require("fs");'],
    ["dynamic import", 'const m = await import("./other.js");'],
    ["eval or new Function", 'new Function("return 1")();'],
    ["other network APIs", 'new WebSocket("wss://x.example");'],
  ])("finds %s", (rule, line) => {
    expect(scanIntegrationSource({ "src/a.ts": `export {};\n${line}` })).toContainEqual({
      file: "src/a.ts",
      line: 2,
      rule,
    });
  });

  it("allows host.http.fetch and plain code", () => {
    const source = "const r = await host.http.fetch(url, { signal });\nconst fetchCount = 1;\n";
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([]);
  });
});
