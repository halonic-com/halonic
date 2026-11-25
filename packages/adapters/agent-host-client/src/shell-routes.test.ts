import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentHostRequestRoutes, agentHostStreamRoutes } from "./transport.ts";

/**
 * The shell's allow-list of the routes a page may call: `ROUTES`, and the
 * Paperclip ones in `PAPERCLIP_ROUTES`. Their paths are also test inputs in
 * this package's `turbo.json`, so a change to them re-runs this test.
 */
const shellFolder = "../../../../apps/studio/src-tauri/crates/agent-host/src/";
const shellTables = [
  { file: new URL(`${shellFolder}routes.rs`, import.meta.url), table: "ROUTES" },
  {
    file: new URL(`${shellFolder}paperclip_routes.rs`, import.meta.url),
    table: "PAPERCLIP_ROUTES",
  },
];

/** Each table's text, between its `= &[` and its closing `];`. */
function tableTexts(): string[] {
  return shellTables.map(({ file, table }) => {
    const pattern = new RegExp(
      `const ${table}: &\\[\\(&str, Route\\)\\] = &\\[([\\s\\S]*?)\\n\\];`,
    );
    return pattern.exec(readFileSync(file, "utf8"))?.[1] ?? "";
  });
}

interface ShellRoute {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly answer: string;
}

/**
 * Each `("<name>", route(Method::<method>, "<path>", Answer::<answer>))` entry
 * of the tables, also when rustfmt puts a long one over several lines.
 */
function readShellRoutes(): ShellRoute[] {
  const table = tableTexts().join("\n");
  const entry =
    /\(\s*"([^"]+)",\s*route\(\s*Method::(\w+),\s*"([^"]+)",\s*Answer::(\w+),?\s*\),?\s*\)/g;
  return [...table.matchAll(entry)].map(([, name = "", method = "", path = "", answer = ""]) => ({
    name,
    method,
    path,
    answer,
  }));
}

function namesAnswering(routes: readonly ShellRoute[], answer: string): string[] {
  return routes
    .filter((route) => route.answer === answer)
    .map((route) => route.name)
    .sort();
}

verifies("agent-host-client.shell-routes", () => {
  it("calls exactly the JSON routes the shell lets a page call", () => {
    expect(namesAnswering(readShellRoutes(), "Json")).toEqual([...agentHostRequestRoutes].sort());
  });

  it("calls exactly the stream routes the shell lets a page call", () => {
    expect(namesAnswering(readShellRoutes(), "Stream")).toEqual([...agentHostStreamRoutes].sort());
  });

  it("finds every entry of the shell's table, each named by its own method and path", () => {
    const routes = readShellRoutes();
    const entries = tableTexts().join("\n");
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.length).toBe(entries.match(/route\(\s*Method::/g)?.length);
    for (const route of routes) {
      expect(route.name).toBe(`${route.method.toUpperCase()} ${route.path}`);
    }
  });
});
