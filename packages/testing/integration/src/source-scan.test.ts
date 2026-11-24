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

verifies("integration.source-scan-imports", () => {
  const importRule = "imports other than its own files, zod or the kit";

  it.each([
    [importRule, 'import { readFileSync } from "fs";'],
    [importRule, 'import { readFile } from "fs/promises";'],
    [importRule, 'import { request } from "https";'],
    [importRule, 'import { spawn } from "child_process";'],
    [importRule, 'import { fetch } from "undici";'],
    [importRule, 'export { readFileSync } from "fs";'],
    [importRule, 'import "child_process";'],
    [importRule, 'import { a } from "../../outside.ts";'],
    // A default import named `type`, which loads the module.
    [importRule, 'import type from "fs";'],
    [importRule, 'import type, { readFileSync } from "fs";'],
    [importRule, 'import { readFileSync } from /* the disk */ "fs";'],
    [importRule, 'import /* setup */ "child_process";'],
    ["eval or new Function", '(0, eval)("1");'],
    ["eval or new Function", "const run = eval;"],
    ["eval or new Function", 'const make = (() => {}).constructor("return 1");'],
  ])("finds %s in %s", (rule, line) => {
    expect(scanIntegrationSource({ "src/a.ts": `export {};\n${line}` })).toContainEqual({
      file: "src/a.ts",
      line: 2,
      rule,
    });
  });

  it("finds an import with a line comment before its name", () => {
    const source = 'import { readFileSync } from // the disk\n  "fs";\n';
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([
      { file: "src/a.ts", line: 2, rule: importRule },
    ]);
  });

  it("finds an import written over several lines on the line that names it", () => {
    const source = 'import {\n  readFileSync,\n} from "fs";\n';
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([
      { file: "src/a.ts", line: 3, rule: importRule },
    ]);
  });

  it("allows its own files, zod, the kit, bundled packages and type-only imports", () => {
    const source = [
      'import { helper } from "./helper.ts";',
      'import { shared } from "../shared/index.ts";',
      'import { z } from "zod";',
      'import { record } from "zod/v4";',
      'import { runTool } from "@halonicjs/adapters/integration-kit";',
      'import { send } from "@acme/shared";',
      'import type { Integration } from "@halonicjs/ports";',
      'export type { IntegrationHost } from "@halonicjs/ports";',
      'import type { IntegrationPolicy } from /* the sheet */ "@halonicjs/format";',
      'export type * from "./types.ts";',
      'import type * as Ports from "@halonicjs/ports";',
      'import type Default from "@halonicjs/ports";',
    ].join("\n");
    expect(scanIntegrationSource({ "src/a.ts": source }, { bundled: ["@acme/shared"] })).toEqual(
      [],
    );
  });

  it("doesn't take a value import on the next line for a type-only one", () => {
    const source = 'export type Name = string\nimport { readFileSync } from "fs"\n';
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([
      { file: "src/a.ts", line: 2, rule: importRule },
    ]);
  });

  it("doesn't let a type-only list without a semicolon cover the import after it", () => {
    const source = 'type A = string\nexport type { A }\nimport fs from "fs"\n';
    expect(scanIntegrationSource({ "src/a.ts": source })).toEqual([
      { file: "src/a.ts", line: 3, rule: importRule },
    ]);
  });
});
