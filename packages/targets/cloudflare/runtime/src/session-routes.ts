import { createSignIn, type SignIn } from "@halonicjs/host-server";
import type { AdminHandler, AdminRoute } from "./admin.ts";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { createRuntime } from "./runtime.ts";

/** Opens the sign-in a revoke ends the sessions of; only a test passes its own. */
export type OpenSessions = (env: RuntimeEnv) => Promise<Pick<SignIn, "revokeAllSessions">>;

/** The same sign-in `host/server` checks every request with, on the deployment's own store. */
const openSignIn: OpenSessions = async (env) => {
  const runtime = await createRuntime(env);
  return createSignIn({
    secrets: runtime.secrets,
    passwordHasher: runtime.passwords,
    coordination: runtime.coordination,
    clock: runtime.clock,
  });
};

const noStore = { "cache-control": "no-store" };

/**
 * `POST /admin/sessions/revoke`: signs out every browser signed in to the deployment, and
 * answers 204. It takes no lock, so it works while a deploy is stuck holding one, and it
 * answers nothing about the new generation.
 *
 * @param open - opens the sign-in; only a test passes its own
 */
export function sessionRoutes(open: OpenSessions = openSignIn): readonly AdminRoute[] {
  const revoke: AdminHandler = async (_request, env) => {
    try {
      await (await open(env)).revokeAllSessions();
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      return Response.json(
        { code: "unavailable", message: "The server isn't ready." },
        { status: 503, headers: noStore },
      );
    }
    return new Response(null, { status: 204, headers: noStore });
  };
  return [{ method: "POST", path: "/admin/sessions/revoke", handler: revoke }];
}
