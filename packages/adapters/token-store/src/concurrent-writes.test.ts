import type { RecordStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fixedClock, memoryRecords, memorySecrets, randomTokenKey } from "./fakes.test-helper.ts";
import { tokenKeySecret } from "./token-key.ts";
import { createTokenStore } from "./token-store.ts";

/**
 * A record store whose next `refusals` compactions are refused the way D1 refuses one that read
 * an out-of-date log: another compaction finishes first, then this one rejects.
 */
function storeWithRefusals(refusals: number) {
  const records = memoryRecords();
  let compactions = 0;
  let left = refusals;
  const store: RecordStore = {
    ...records,
    compact: async (collection) => {
      compactions += 1;
      if (left > 0) {
        left -= 1;
        await records.compact(collection);
        throw new Error("another compaction of this collection finished first");
      }
      await records.compact(collection);
    },
  };
  const secrets = memorySecrets({ [tokenKeySecret]: randomTokenKey() });
  const tokens = createTokenStore({ records: store, secrets, clock: fixedClock });
  return { records, tokens, compactions: () => compactions };
}

verifies("token-store.concurrent-writes", () => {
  it("resolves a replace whose first compaction another one beat", async () => {
    const { records, tokens, compactions } = storeWithRefusals(1);
    await tokens.set("refresh", "old");
    const oldSealed = String(records.log[0]?.values?.["sealed"]);
    await expect(tokens.set("refresh", "new")).resolves.toBeUndefined();
    expect(compactions()).toBe(2);
    expect(await tokens.get("refresh")).toBe("new");
    expect(records.log.map(({ op }) => op)).toEqual(["seed"]);
    expect(JSON.stringify(records.log)).not.toContain(oldSealed);
  });

  it("resolves a remove whose first compaction another one beat", async () => {
    const { records, tokens } = storeWithRefusals(1);
    await tokens.set("refresh", "removed");
    await expect(tokens.remove("refresh")).resolves.toBeUndefined();
    expect(await tokens.get("refresh")).toBeNull();
    expect(records.log).toEqual([]);
  });

  it("rejects after three refused tries, with the change stored", async () => {
    const { tokens, compactions } = storeWithRefusals(3);
    await tokens.set("refresh", "old");
    await expect(tokens.set("refresh", "new")).rejects.toThrow("finished first");
    expect(compactions()).toBe(3);
    expect(await tokens.get("refresh")).toBe("new");
  });
});
