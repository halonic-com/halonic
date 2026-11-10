import { runGuard } from "./guard.mjs";
import { notify } from "./telegram.mjs";
import { readUsage } from "./usage.mjs";

const reason = (e) => String(e?.message ?? e).slice(0, 200);

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runGuard(env, { now: new Date(), readUsage, notify }).then(
        (r) => console.log(JSON.stringify({ events: r.events, totalUsd: r.state.totalUsd })),
        async (e) => {
          console.error(`guard run failed: ${reason(e)}`);
          await notify(env, `Spend guard run failed: ${reason(e)}`).catch(() => false);
        },
      ),
    );
  },
  async fetch() {
    return new Response("not found", { status: 404 });
  },
};
