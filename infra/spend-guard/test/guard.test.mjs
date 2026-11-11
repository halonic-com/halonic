import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSpend, spendOffResponse } from "../src/check-spend.mjs";
import { runGuard } from "../src/guard.mjs";
import { price } from "../src/pricing.mjs";
import { monthWindow } from "../src/usage.mjs";

const fakeKv = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    m,
    async get(key, opts) {
      const v = m.has(key) ? m.get(key) : null;
      return opts === "json" && v ? JSON.parse(v) : v;
    },
    async put(key, value) {
      m.set(key, value);
    },
  };
};
const freshKv = () =>
  fakeKv({ spend_ok: "on", "spend_ok:render": "on", "spend_ok:turbo-cache": "on" });
const at = (iso) => new Date(iso);
const harness = (kv, env = {}) => {
  const sent = [];
  return {
    sent,
    env: { SPEND_KV: kv, ...env },
    run(now, report) {
      return runGuard(this.env, {
        now: at(now),
        readUsage: async () => {
          if (report instanceof Error) throw report;
          return report;
        },
        notify: async (_e, text) => (sent.push(text), true),
      });
    },
  };
};
const usage = (totalUsd, services = {}) => ({ totalUsd, services });

test("checkSpend: only 'on' counts as on; everything else is off", async () => {
  assert.equal(await checkSpend({ SPEND_KV: freshKv() }, "render"), true);
  assert.equal(
    await checkSpend({ SPEND_KV: fakeKv({ spend_ok: "off", "spend_ok:render": "on" }) }, "render"),
    false,
  );
  assert.equal(
    await checkSpend({ SPEND_KV: fakeKv({ spend_ok: "on", "spend_ok:render": "off" }) }, "render"),
    false,
  );
  assert.equal(
    await checkSpend({ SPEND_KV: fakeKv({ spend_ok: "on" }) }, "render"),
    false,
    "missing service key",
  );
  assert.equal(
    await checkSpend({ SPEND_KV: fakeKv({ spend_ok: "ON", "spend_ok:render": "on" }) }, "render"),
    false,
  );
  assert.equal(await checkSpend({}, "render"), false, "no binding");
  const broken = {
    get: async () => {
      throw new Error("kv down");
    },
  };
  assert.equal(await checkSpend({ SPEND_KV: broken }, "render"), false, "KV error");
  assert.equal(spendOffResponse().status, 503);
});

test("trip at $0.01 override: switch off, Telegram sent, services refuse", async () => {
  const kv = freshKv();
  const h = harness(kv, { THRESHOLD_OVERRIDE: "0.01" });
  await h.run("2026-11-10T10:00:00Z", usage(5.0));
  assert.equal(kv.m.get("spend_ok"), "off");
  assert.match(h.sent.at(-1), /STOPPED/);
  assert.equal(await checkSpend(h.env, "turbo-cache"), false);
});

test("warnings fire once each at $500 and $800, then trip at $900", async () => {
  const kv = freshKv();
  const h = harness(kv);
  await h.run("2026-11-10T10:00:00Z", usage(499));
  assert.equal(h.sent.length, 0);
  await h.run("2026-11-10T10:15:00Z", usage(501));
  await h.run("2026-11-10T10:30:00Z", usage(502));
  assert.equal(h.sent.length, 1);
  await h.run("2026-11-10T10:45:00Z", usage(801));
  assert.equal(h.sent.length, 2);
  assert.equal(kv.m.get("spend_ok"), "on");
  await h.run("2026-11-10T11:00:00Z", usage(900));
  assert.equal(kv.m.get("spend_ok"), "off");
  assert.equal(h.sent.length, 3);
});

test("sub-budget turns off only that service", async () => {
  const kv = freshKv();
  const h = harness(kv);
  await h.run("2026-11-10T10:00:00Z", usage(30, { render: 20.5, "turbo-cache": 1 }));
  assert.equal(kv.m.get("spend_ok"), "on");
  assert.equal(kv.m.get("spend_ok:render"), "off");
  assert.equal(kv.m.get("spend_ok:turbo-cache"), "on");
  assert.equal(await checkSpend(h.env, "render"), false);
  assert.equal(await checkSpend(h.env, "turbo-cache"), true);
});

test("manual resume sticks; guard re-trips only while spend is still over", async () => {
  const kv = freshKv();
  const h = harness(kv, { THRESHOLD_OVERRIDE: "0.01" });
  await h.run("2026-11-10T10:00:00Z", usage(5));
  kv.m.set("spend_ok", "on"); // wrangler kv key put ... spend_ok on
  assert.equal(await checkSpend(h.env, "turbo-cache"), true);
  h.env.THRESHOLD_OVERRIDE = "900"; // board raised the limit on purpose
  await h.run("2026-11-10T10:15:00Z", usage(5));
  assert.equal(kv.m.get("spend_ok"), "on");
  assert.equal(JSON.parse(kv.m.get("state")).offBy, undefined);
});

test("month reset: undoes an automatic stop, leaves a manual stop alone", async () => {
  const kv = freshKv();
  const h = harness(kv, { THRESHOLD_OVERRIDE: "0.01" });
  await h.run("2026-11-30T23:50:00Z", usage(5));
  assert.equal(kv.m.get("spend_ok"), "off");
  h.env.THRESHOLD_OVERRIDE = "900";
  await h.run("2026-12-01T00:05:00Z", usage(5));
  assert.equal(kv.m.get("spend_ok"), "on");
  assert.match(h.sent.at(-1), /new month/);

  const kv2 = freshKv();
  const h2 = harness(kv2);
  await h2.run("2026-11-10T10:00:00Z", usage(1));
  kv2.m.set("spend_ok", "off"); // board stops it by hand
  await h2.run("2026-11-10T10:15:00Z", usage(1));
  await h2.run("2026-12-01T00:05:00Z", usage(1));
  assert.equal(kv2.m.get("spend_ok"), "off", "manual stop survives the month change");
});

test("no usage data: alert at once, switch off after 3 hours, back on when readable", async () => {
  const kv = freshKv();
  const h = harness(kv);
  const err = new Error("CLOUDFLARE_SPEND_GUARD_TOKEN is not set");
  await h.run("2026-11-10T10:00:00Z", err);
  assert.match(h.sent[0], /no usage data/);
  assert.equal(kv.m.get("spend_ok"), "on");
  await h.run("2026-11-10T11:00:00Z", err);
  assert.equal(h.sent.length, 1, "alert is not repeated every run");
  await h.run("2026-11-10T13:00:00Z", err);
  assert.equal(kv.m.get("spend_ok"), "off");
  assert.match(h.sent.at(-1), /STOPPED: no readable usage/);
  await h.run("2026-11-10T13:15:00Z", usage(3));
  assert.equal(kv.m.get("spend_ok"), "on");
});

test("an unset or failing Telegram never blocks the stop", async () => {
  const kv = freshKv();
  const h = harness(kv, { THRESHOLD_OVERRIDE: "0.01" });
  await runGuard(h.env, {
    now: at("2026-11-10T10:00:00Z"),
    readUsage: async () => usage(5),
    notify: async () => false,
  });
  assert.equal(kv.m.get("spend_ok"), "off");
});

test("pricing: free allowances and plan fee", () => {
  assert.equal(price({}).total, 5);
  assert.equal(price({ workersRequests: 110e6 }).total, 5 + 100 * 0.3);
  assert.ok(price({ r2ClassA: 2e6 }, { allowances: false }).total === 9);
  assert.equal(monthWindow(at("2026-11-16T00:00:00Z")).daysElapsed, 15);
});

test("a bad SUB_BUDGETS_JSON falls back to the defaults", async () => {
  const { settings, DEFAULTS } = await import("../src/guard.mjs");
  for (const bad of ["{not json", "[1]", "null"]) {
    assert.deepEqual(settings({ SUB_BUDGETS_JSON: bad }).subBudgetsUsd, DEFAULTS.subBudgetsUsd);
  }
});

test("containers reader converts real row units (bytes x s) to GiB-s and GB-s", async () => {
  const { READERS } = await import("../src/usage.mjs");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          viewer: {
            accounts: [
              {
                c: [
                  {
                    sum: { cpuTimeSec: 24.38, allocatedMemory: 128849018880, allocatedDisk: 2e11 },
                  },
                ],
              },
            ],
          },
        },
      }),
    );
  try {
    const u = await READERS.containers(
      { CLOUDFLARE_SPEND_GUARD_TOKEN: "x", ACCOUNT_ID: "a" },
      { since: "s", until: "u" },
    );
    assert.equal(u.containerMemGibSeconds, 120); // 12 GiB x 10 s
    assert.equal(u.containerDiskGbSeconds, 200); // 20 GB x 10 s
    assert.equal(u.containerVcpuSeconds, 24.38);
  } finally {
    globalThis.fetch = realFetch;
  }
});
