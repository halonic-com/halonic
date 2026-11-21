import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { engineJsonRoutes, engineRouteOf, engineStreamRoutes } from "./engine-routes.ts";

/**
 * The shell's table of the engine routes a page may call (`ROUTES`). Its path is also a test
 * input in this package's `turbo.json`, so a change to it re-runs this test.
 */
const shellRoutes = new URL(
  "../../../../apps/studio/src-tauri/src/engine_routes.rs",
  import.meta.url,
);

/** Each `route("<name>", Method::…, "<path>", &[…], Answer::<answer>)` entry of `ROUTES`, by answer kind. */
function readShellRoutes(): { name: string; answer: string }[] {
  const text = readFileSync(shellRoutes, "utf8");
  const table = /const ROUTES: &\[EngineRoute\] = &\[([\s\S]*?)\n\];/.exec(text)?.[1] ?? "";
  const entry = /route\(\s*"([^"]+)",[\s\S]*?Answer::(\w+),?\s*\)/g;
  return [...table.matchAll(entry)].map(([, name = "", answer = ""]) => ({ name, answer }));
}

function namesAnswering(answer: string): string[] {
  return readShellRoutes()
    .filter((route) => route.answer === answer)
    .map((route) => route.name)
    .sort();
}

const engine = (path: string) => new URL(`http://engine.invalid${path}`);

verifies("services.engine-fetch", () => {
  it("takes exactly the JSON routes and the stream routes of the shell's table", () => {
    expect(namesAnswering("Json")).toEqual([...engineJsonRoutes].sort());
    expect(namesAnswering("Stream")).toEqual([...engineStreamRoutes].sort());
    expect(readShellRoutes()).toHaveLength(engineJsonRoutes.length + engineStreamRoutes.length);
  });

  it("names the route a request calls, with its path params decoded", () => {
    expect(engineRouteOf("POST", engine("/api/runs/run%2F01/events"))).toEqual({
      route: "POST /api/runs/{run}/events",
      answer: "json",
      params: { run: "run/01" },
    });
    expect(engineRouteOf("POST", engine("/api/routines/@workspace/nightly/run"))).toEqual({
      route: "POST /api/routines/{hub}/{routine}/run",
      answer: "json",
      params: { hub: "@workspace", routine: "nightly" },
    });
  });

  it("gives a query param as a number when it is a whole number, and as text otherwise", () => {
    expect(engineRouteOf("GET", engine("/api/runs/r1/events?after=12"))).toEqual({
      route: "GET /api/runs/{run}/events",
      answer: "stream",
      params: { run: "r1", after: 12 },
    });
    expect(engineRouteOf("GET", engine("/api/runs/r1/events?after=-1"))?.params).toEqual({
      run: "r1",
      after: "-1",
    });
  });

  it("matches no route for another method, path, empty param or query", () => {
    expect(engineRouteOf("DELETE", engine("/api/runs"))).toBeUndefined();
    expect(engineRouteOf("GET", engine("/api/runs/r1/logs"))).toBeUndefined();
    expect(engineRouteOf("GET", engine("/api/runs/"))).toBeUndefined();
    expect(engineRouteOf("GET", engine("/api/runs/r1/events"))).toBeUndefined();
    expect(engineRouteOf("GET", engine("/api/hello?debug=1"))).toBeUndefined();
  });
});
