import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { scanIntegrationSource } from "./source-scan.ts";

verifies("integration.source-scan", () => {
  it.each([
    ["global fetch (use host.http)", 'await fetch("https://x.example")'],
    ["globalThis, window or self", "globalThis.secret = 1;"],
    ["process or the environment", 'const key = process.env["KEY"];'],
    ["node: modules", 'import { readFile } from "node:fs/promises";'],
    ["node: modules", 'const fs = require("fs");'],
    ["dynamic import", 'const m = await import("./other.js");'],
    ["eval or new Function", 'new Function("return 1")();'],
    ["other network APIs", 'new WebSocket("wss://x.example");'],
    ["timers (use host.wait)", "await new Promise((done) => setTimeout(done, 2000));"],
    ["timers (use host.wait)", "const signal = AbortSignal.timeout(5000);"],
  ])("finds %s", (rule, line) => {
    expect(scanIntegrationSource({ "src/a.ts": `export {};\n${line}` })).toContainEqual({
      file: "src/a.ts",
      line: 2,
      rule,
    });
  });

  it("allows host.http.fetch, host.wait and plain code", () => {
    const source =
      "const r = await host.http.fetch(url, { signal });\nawait host.wait(retryMs, signal);\nconst fetchCount = 1;\n";
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([]);
  });
});
