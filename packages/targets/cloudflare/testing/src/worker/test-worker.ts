/**
 * The test Worker's entry. The build bundles it together with the suite
 * files it was given, which register their cases into the shim's registry
 * when the Worker loads. The Node runner (and later the live test run in
 * the CI account, HAL-198) then lists the cases and runs them one by one.
 */

import { type CaseResult, workerPaths } from "./protocol.ts";
import { registry } from "./vitest-shim.ts";

/** The secrets the Worker reads. Both are optional so a Worker started without them refuses every request. */
export interface TestWorkerEnv {
  /** The bearer token the runner sends on every request but the deploy's self-test. */
  readonly HALONIC_TEST_RUNNER_TOKEN?: string;
  /** The token the deploy tool sends to `POST /self-test` (the name `uploadAndSwitch` reserves). */
  readonly HALONIC_SELFTEST_TOKEN?: string;
}

/** True when the request carries `Bearer <expected>`. Compares digests, so the time taken doesn't reveal a prefix. */
async function bearerMatches(request: Request, expected: string | undefined): Promise<boolean> {
  if (expected === undefined || expected === "") return false;
  const sent = request.headers.get("authorization") ?? "";
  const digest = async (text: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(sent), digest(`Bearer ${expected}`)]);
  // Both are 32-byte digests; every byte is compared, so the loop's length doesn't depend on where they differ.
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i += 1) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

/**
 * The Worker's handlers: one `fetch`. It runs code that writes to the account's storage, so it
 * answers only a request with the runner's token (`HALONIC_TEST_RUNNER_TOKEN`); a Worker deployed
 * without one refuses everything. The build's generated entry makes this the module's default
 * export, which is what workerd loads.
 */
export const testWorker = {
  async fetch(request: Request, env?: TestWorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === workerPaths.selfTest) {
      if (!(await bearerMatches(request, env?.HALONIC_SELFTEST_TOKEN))) {
        return new Response("Unauthorized.", { status: 401 });
      }
      return Response.json({ ok: true, checks: [] });
    }
    if (!(await bearerMatches(request, env?.HALONIC_TEST_RUNNER_TOKEN))) {
      return new Response("Unauthorized.", { status: 401 });
    }
    if (request.method === "GET" && path === workerPaths.cases) {
      return Response.json(registry.tree());
    }
    if (request.method === "POST" && path === workerPaths.run) {
      return Response.json(await runRequested(request));
    }
    return new Response(`The test Worker has no ${request.method} ${path}.`, { status: 404 });
  },
};

async function runRequested(request: Request): Promise<CaseResult> {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
    throw new Error(`${workerPaths.run} needs a JSON body { "id": "<case ID>" }.`);
  }
  return registry.run(body.id);
}
