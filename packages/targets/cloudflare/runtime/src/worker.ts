import type { RuntimeEnv } from "./env.ts";
import { answerRequest } from "./routes.ts";
import { createRuntime } from "./runtime.ts";
import { runScheduled } from "./scheduled.ts";
import { answerSelfTest } from "./self-test.ts";

/**
 * The Worker's entry points. `fetch()` answers the health route, and `/self-test` for a deploy that set its token, until
 * `host/server` is on `main` (HAL-195). `scheduled()` runs on the cron
 * trigger in `wrangler.toml`, every minute: the routine tick and the watchdog.
 */
export const worker = {
  async fetch(request: Request, env?: RuntimeEnv): Promise<Response> {
    if (env !== undefined && new URL(request.url).pathname === "/self-test") {
      const answer = await answerSelfTest(request, env);
      if (answer !== undefined) return answer;
    }
    return answerRequest(request);
  },

  /** @throws ConfigurationError when the deployment lacks a binding or a secret, AggregateError when the tick or the watchdog failed */
  async scheduled(controller: ScheduledController, env: RuntimeEnv): Promise<void> {
    const runtime = await createRuntime(env);
    await runScheduled(runtime, new Date(controller.scheduledTime).toISOString());
  },
};
