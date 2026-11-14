import { createServer, type Server, type ServerPorts } from "@halonicjs/host-server";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { CoordinationRequestCountStore } from "./request-counts.ts";
import { runsNotAvailable } from "./runs-not-available.ts";
import { createRuntime, type Runtime, type RuntimeOptions } from "./runtime.ts";
import { serverConfigOf } from "./serve-config.ts";

/**
 * The deployer uploaded the workspace this Worker runs, so it is trusted the
 * way `halonic trust` trusts one on a computer: nobody can change it from the
 * API, and a new upload is a new decision by the deployer.
 */
const deployerTrust: ServerPorts["trust"] = {
  async check() {
    return {
      state: "trusted",
      message: "This deployment runs the workspace its deployer uploaded.",
    };
  },
};

/** What goes to the Worker's log for a failed request: the kind of error, never its message, which could carry a value. */
const workerErrorLog: ServerPorts["errorLog"] = {
  record(error) {
    console.error("halonic: a request failed:", error instanceof Error ? error.name : typeof error);
  },
};

/** The ports `host/server` needs, from the adapters of one deployment. */
export function serverPortsOf(runtime: Runtime): ServerPorts {
  return {
    runs: runsNotAvailable,
    runStore: runtime.runStore,
    secrets: runtime.secrets,
    passwordHasher: runtime.passwords,
    coordination: runtime.coordination,
    trust: deployerTrust,
    // No routine is found yet: a webhook answers like an unknown address until the Worker loads routines from the snapshot.
    webhooks: { find: async () => null },
    requestCounts: new CoordinationRequestCountStore(runtime.coordination),
    errorLog: workerErrorLog,
    clock: runtime.clock,
    ids: { next: (prefix) => `${prefix}${crypto.randomUUID()}` },
  };
}

/**
 * `CF-Connecting-IP` is set by Cloudflare's edge and replaces any value the
 * caller sent, so it is the one header the server may take as the client's
 * address. Every request reaches a Worker over HTTPS.
 */
function contextOf(request: Request) {
  const clientAddress = request.headers.get("cf-connecting-ip");
  return clientAddress === null ? { secure: true } : { clientAddress, secure: true };
}

/** Answers every request that isn't `/health` with 503 and no detail when the deployment is incomplete. */
function notConfigured(error: ConfigurationError): Response {
  console.error(
    `halonic: the Worker isn't fully configured. Missing: ${error.missing.join(", ")}.`,
  );
  return Response.json(
    { code: "unavailable", message: "The server isn't ready." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Serves the API: hands the request to `host/server` with the Cloudflare
 * adapters. Its rules apply as on any host: the `Host` and `Origin` checks, the
 * sign-in with the length-limited password check, the daily ceiling, and the
 * same 404 for every unknown path. A deployment that is missing a binding, a
 * secret or a variable answers 503 without saying which.
 *
 * @param options - only a test sets any
 */
export async function serveRequest(
  request: Request,
  env: RuntimeEnv,
  options: RuntimeOptions = {},
): Promise<Response> {
  let server: Server;
  try {
    const config = serverConfigOf(env);
    server = createServer({ config, ports: serverPortsOf(await createRuntime(env, options)) });
  } catch (error) {
    if (error instanceof ConfigurationError) return notConfigured(error);
    throw error;
  }
  return server.handle(request, contextOf(request));
}
