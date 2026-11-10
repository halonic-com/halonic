import { runGuard } from "./guard.mjs";
import { notify } from "./telegram.mjs";
import { readUsage } from "./usage.mjs";

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runGuard(env, { now: new Date(), readUsage, notify }).then(
        (r) => console.log(JSON.stringify({ events: r.events, totalUsd: r.state.totalUsd })),
        (e) => console.error(`guard run failed: ${String(e?.message ?? e).slice(0, 200)}`),
      ),
    );
  },
  async fetch() {
    return new Response("not found", { status: 404 });
  },
};
