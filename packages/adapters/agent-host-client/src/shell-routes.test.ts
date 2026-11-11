import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentHostRequestRoutes, agentHostStreamRoutes } from "./transport.ts";

/**
 * The shell's allow-list of the routes a page may call (`ROUTES`). Its path
 * is also a test input in this package's `turbo.json`, so a change to it
 * re-runs this test.
 */
const shellRoutes = new URL(
  "../../../../apps/studio/src-tauri/crates/agent-host/src/routes.rs",
  import.meta.url,
);

interface ShellRoute {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly answer: string;
}

/** Each `("<name>", route(Method::<method>, "<path>", Answer::<answer>))` entry of `ROUTES`. */
function readShellRoutes(): ShellRoute[] {
  const text = readFileSync(shellRoutes, "utf8");
  const table = /const ROUTES: &\[\(&str, Route\)\] = &\[([\s\S]*?)\n\];/.exec(text)?.[1] ?? "";
  const entry = /\(\s*"([^"]+)",\s*route\(Method::(\w+),\s*"([^"]+)",\s*Answer::(\w+)\),?\s*\)/g;
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
    const entries = /const ROUTES[\s\S]*?\n\];/.exec(readFileSync(shellRoutes, "utf8"))?.[0];
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.length).toBe(entries?.match(/route\(Method::/g)?.length);
    for (const route of routes) {
      expect(route.name).toBe(`${route.method.toUpperCase()} ${route.path}`);
    }
  });
});
