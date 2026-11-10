// The guard's decision logic. Pure apart from the injected `deps`, so tests
// run it with recorded usage and a fake KV (see test/guard.test.mjs).
//
// deps: { now: Date, readUsage(env, now) -> UsageReport, notify(env, text) -> Promise<boolean> }
// UsageReport: { totalUsd, services: { [name]: usd }, breakdown }  (throws when usage is unreadable)

import { price } from "./pricing.mjs";

export const DEFAULTS = {
  tripUsd: 900,
  warnUsd: [500, 800],
  subBudgetsUsd: { render: 20, "turbo-cache": 5 },
  staleAfterMs: 3 * 3600 * 1000,
};

const monthOf = (d) => d.toISOString().slice(0, 7);
const usd = (n) => `$${n.toFixed(2)}`;

export function settings(env) {
  const override = Number(env.THRESHOLD_OVERRIDE);
  let sub = DEFAULTS.subBudgetsUsd;
  if (env.SUB_BUDGETS_JSON) {
    try {
      const parsed = JSON.parse(env.SUB_BUDGETS_JSON);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) sub = parsed;
    } catch {
      // A bad value falls back to the defaults.
    }
  }
  return {
    tripUsd:
      Number.isFinite(override) && override > 0
        ? override
        : Number(env.TRIP_USD) || DEFAULTS.tripUsd,
    warnUsd: env.WARN_USD ? env.WARN_USD.split(",").map(Number) : DEFAULTS.warnUsd,
    subBudgetsUsd: sub,
    staleAfterMs: DEFAULTS.staleAfterMs,
  };
}

export async function runGuard(env, deps) {
  const kv = env.SPEND_KV;
  const now = deps.now;
  const cfg = settings(env);
  const events = [];
  const say = async (text) => {
    events.push(text);
    return deps.notify(env, `Cloudflare spend guard: ${text}`);
  };

  let state = (await kv.get("state", "json")) ?? {};
  state.firstSeen ??= now.toISOString();
  state.warned ??= {};
  state.serviceOff ??= {};
  state.alerts ??= {};

  // Someone resumed by hand: forget that we turned it off.
  const switchValue = await kv.get("spend_ok");
  if (switchValue === "on" && state.offBy) {
    events.push("manual resume noticed");
    delete state.offBy;
    delete state.offReason;
  }
  for (const [svc, info] of Object.entries(state.serviceOff)) {
    if ((await kv.get(`spend_ok:${svc}`)) === "on" && info) delete state.serviceOff[svc];
  }

  // New month: reset, but only what the guard itself turned off.
  if (state.month && state.month !== monthOf(now)) {
    const undone = [];
    if (state.offBy === "auto" && switchValue === "off") {
      await kv.put("spend_ok", "on");
      undone.push("account");
    }
    for (const [svc, info] of Object.entries(state.serviceOff)) {
      if (info?.by === "auto") {
        await kv.put(`spend_ok:${svc}`, "on");
        undone.push(svc);
      }
    }
    state = {
      firstSeen: state.firstSeen,
      lastSuccess: state.lastSuccess,
      warned: {},
      serviceOff: {},
      alerts: {},
    };
    await say(
      undone.length
        ? `new month, switched back on: ${undone.join(", ")}.`
        : `new month, counters reset (nothing needed switching on).`,
    );
  }
  state.month = monthOf(now);

  let report;
  try {
    report = await deps.readUsage(env, now);
  } catch (error) {
    report = null;
    state.lastError = String(error?.message ?? error).slice(0, 300);
  }

  if (!report) {
    const since = Date.parse(state.lastSuccess ?? state.firstSeen);
    const stale = now.getTime() - since >= cfg.staleAfterMs;
    const hours = ((now.getTime() - since) / 3600e3).toFixed(1);
    if (!state.alerts.noData) {
      if (
        await say(
          `no usage data (${state.lastError}). The guard cannot see spend; it switches the stop on after 3 hours without data.`,
        )
      )
        state.alerts.noData = now.toISOString();
    }
    if (stale && (await kv.get("spend_ok")) !== "off") {
      await kv.put("spend_ok", "off");
      state.offBy = "auto";
      state.offReason = "no-usage";
      await say(
        `STOPPED: no readable usage for ${hours} h, so the account switch is off (fail safe). Fix the token or the API, then resume.`,
      );
    }
    await kv.put("state", JSON.stringify(state));
    return { events, state };
  }

  state.lastSuccess = now.toISOString();
  delete state.lastError;
  delete state.alerts.noData;
  state.totalUsd = report.totalUsd;
  state.services = report.services;

  // Recover from a stop we caused only because we were blind.
  if (state.offBy === "auto" && state.offReason === "no-usage" && report.totalUsd < cfg.tripUsd) {
    await kv.put("spend_ok", "on");
    delete state.offBy;
    delete state.offReason;
    await say("usage is readable again; account switch back on.");
  }

  for (const level of cfg.warnUsd) {
    if (report.totalUsd >= level && report.totalUsd < cfg.tripUsd && !state.warned[level]) {
      if (
        await say(
          `WARNING: estimated month-to-date spend is ${usd(report.totalUsd)} (warning level ${usd(level)}; stop at ${usd(cfg.tripUsd)}).`,
        )
      )
        state.warned[level] = now.toISOString();
    }
  }

  if (report.totalUsd >= cfg.tripUsd && (await kv.get("spend_ok")) !== "off") {
    await kv.put("spend_ok", "off");
    state.offBy = "auto";
    state.offReason = "limit";
    await say(
      `STOPPED: estimated month-to-date spend is ${usd(report.totalUsd)}, at or over the ${usd(cfg.tripUsd)} limit. All Halonic Cloudflare services are paused. Resume with: tell Chief "resume Cloudflare spend".`,
    );
  }

  for (const [svc, budget] of Object.entries(cfg.subBudgetsUsd)) {
    const spent = report.services?.[svc];
    if (
      typeof spent === "number" &&
      spent >= budget &&
      (await kv.get(`spend_ok:${svc}`)) !== "off"
    ) {
      await kv.put(`spend_ok:${svc}`, "off");
      state.serviceOff[svc] = { by: "auto", at: now.toISOString() };
      await say(
        `STOPPED ${svc}: its estimated spend this month is ${usd(spent)}, at or over its ${usd(budget)} budget.`,
      );
    }
  }

  await kv.put("state", JSON.stringify(state));
  return { events, state };
}

export { price };
