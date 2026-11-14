/**
 * The test Worker's entry. The build bundles it together with the suite
 * files it was given, which register their cases into the shim's registry
 * when the Worker loads. The Node runner (and later the live test run in
 * the CI account, HAL-198) then lists the cases and runs them one by one.
 */

import { type CaseResult, coverageHook, type RawCoverage, workerPaths } from "./protocol.ts";
import { registry } from "./vitest-shim.ts";

/**
 * The Worker's handlers: one `fetch`, no bindings needed yet. The build's
 * generated entry makes this the module's default export, which is what
 * workerd loads.
 */
export const testWorker = {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === workerPaths.cases) {
      return Response.json(registry.tree());
    }
    if (request.method === "POST" && path === workerPaths.run) {
      return Response.json(await runRequested(request));
    }
    if (request.method === "GET" && path === workerPaths.coverage) {
      return takeCoverage();
    }
    return new Response(`The test Worker has no ${request.method} ${path}.`, { status: 404 });
  },
} satisfies ExportedHandler;

async function runRequested(request: Request): Promise<CaseResult> {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
    throw new Error(`${workerPaths.run} needs a JSON body { "id": "<case ID>" }.`);
  }
  return registry.run(body.id);
}

async function takeCoverage(): Promise<Response> {
  const take = (globalThis as { [coverageHook]?: () => Promise<RawCoverage> })[coverageHook];
  if (take === undefined) {
    return new Response("This test Worker was not built for coverage.", { status: 404 });
  }
  return Response.json(await take());
}
