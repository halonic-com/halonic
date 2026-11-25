import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openAccount, step } from "./test/usage-case.ts";
import { reservationMarginMs } from "./usage-account.ts";
import type { OutboxRow, UsageRecord } from "./usage-types.ts";

const owner = { runId: "run_1", actor: "u_acme" };
const marker = "acme-marker-7f3a";

/** The usage records in the outbox, by id. */
function recordsOf(rows: OutboxRow[]): Map<string, UsageRecord> {
  const records = new Map<string, UsageRecord>();
  for (const row of rows) if (row.kind === "usage") records.set(row.record.id, row.record);
  return records;
}

verifies("cloudflare-durable.usage-record-pricing", () => {
  it("gives a settled step's record its reservation's maximum, defaults included", () => {
    const { account, outbox } = openAccount();
    account.reserve(step("res_1", { steps: 4 }));
    account.settle("res_1", { harnessMs: 4_000 });
    expect(recordsOf(outbox()).get("res_1")?.reservedMax).toEqual({ steps: 4, cost: 100 });
  });

  it("gives a step that ran out its maximum too, and its correction none", () => {
    const { account, clock, outbox } = openAccount();
    account.reserve(step("res_1"));
    clock.nowMs += 60_000 + reservationMarginMs;
    account.settleExpired();
    account.settle("res_1", { cost: 40 });
    const records = recordsOf(outbox());
    expect(records.get("res_1")?.reservedMax).toEqual({ cost: 300 });
    expect(records.get("res_1:late")).not.toHaveProperty("reservedMax");
  });

  it("names a model call's model, and none on a run's end", () => {
    const { account, outbox } = openAccount();
    account.record("call_1", owner, "model_call", { cost: 30 }, "acme-ai/acme-1");
    account.record("run_1:end", owner, "run", { runs: 1 }, "acme-ai/acme-1");
    const records = recordsOf(outbox());
    expect(records.get("call_1")?.model).toBe("acme-ai/acme-1");
    expect(records.get("call_1")).not.toHaveProperty("reservedMax");
    expect(records.get("run_1:end")).not.toHaveProperty("model");
  });

  it("still charges a call whose model isn't a model id, naming no model", () => {
    const { account, storage, outbox } = openAccount();
    for (const [n, model] of [`${marker} said hi`, "acme-1", "a/b/c", undefined].entries()) {
      account.record(`call_${n}`, owner, "model_call", { cost: 10 }, model);
    }
    const records = [...recordsOf(outbox()).values()];
    expect(records).toHaveLength(4);
    for (const record of records) expect(record).not.toHaveProperty("model");
    expect(storage.dump()).not.toContain(marker);
    expect(account.summary().costPercent).toBe(4);
  });
});
