import { answerAdmin } from "./admin.ts";
import { adminRoutes } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import { plainHttpAnswer } from "./https-only.ts";
import { answerRequest, healthPath } from "./routes.ts";
import { createRuntime } from "./runtime.ts";
import { runScheduled } from "./scheduled.ts";
import { sweepEveryScope } from "./scoped-sweep.ts";
import { answerSelfTest } from "./self-test.ts";
import { serveRequest } from "./serve.ts";

/**
 * The Worker's entry points. `fetch()` answers plain HTTP with a redirect or a refusal (see
 * `plainHttpAnswer`), then the health route, and `/self-test` for a deploy that set its token;
 * every other request goes to `host/server` with the Cloudflare adapters. `scheduled()` runs on the cron
 * trigger in `wrangler.toml`, every minute: the routine tick and the watchdog, over the deployment's
 * runs and every scope's.
 */
export const worker = {
  async fetch(request: Request, env?: RuntimeEnv): Promise<Response> {
    const plainHttp = plainHttpAnswer(request);
    if (plainHttp !== undefined) return plainHttp;
    if (env !== undefined && new URL(request.url).pathname === "/self-test") {
      const answer = await answerSelfTest(request, env);
      if (answer !== undefined) return answer;
    }
    // Without `env` there are no adapters to serve with, so only the health route answers.
    if (env === undefined || new URL(request.url).pathname === healthPath) {
      return answerRequest(request);
    }
    const admin = await answerAdmin(request, env, adminRoutes);
    return admin ?? serveRequest(request, env);
  },

  /** @throws ConfigurationError when the deployment lacks a binding or a secret, AggregateError when the tick or the watchdog failed */
  async scheduled(controller: ScheduledController, env: RuntimeEnv): Promise<void> {
    const runtime = await createRuntime(env);
    const watchdog = { sweep: () => sweepEveryScope(env, runtime) };
    await runScheduled(
      { routines: runtime.routines, watchdog },
      new Date(controller.scheduledTime).toISOString(),
    );
  },
};
