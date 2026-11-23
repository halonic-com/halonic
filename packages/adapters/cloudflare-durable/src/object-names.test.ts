import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DurableRunEvents } from "./durable-run-events.ts";
import { DurableRunStore } from "./durable-run-store.ts";
import { DurableScheduler, type RunObjectNamespace } from "./durable-scheduler.ts";
import type { RunObjectApi } from "./run-object-api.ts";

/** A namespace that notes every name asked for; its objects answer as an empty run. */
function namingNamespace() {
  const names: string[] = [];
  const emptyRun = {
    summary: async () => null,
    pending: async () => [],
    watch: async () =>
      new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
  } as unknown as RunObjectApi;
  const namespace: RunObjectNamespace<string> = {
    idFromName(name) {
      names.push(name);
      return name;
    },
    get: () => emptyRun,
  };
  return { names, namespace };
}

const noRunList = { list: async () => [] };
const unsafeIds = ["../run_1", "run_1/x", "", ".hidden", "a".repeat(129)];

verifies("cloudflare-durable.object-names", () => {
  describe("run object names", () => {
    it("names the object after the prefix and the run id", async () => {
      const { names, namespace } = namingNamespace();
      const userScope = new DurableRunStore({
        namespace,
        runList: noRunList,
        namePrefix: "u/acme/",
      });
      const orgScope = new DurableRunStore({
        namespace,
        runList: noRunList,
        namePrefix: "o/acme/",
      });
      await userScope.get("run_1");
      await orgScope.get("run_1");
      await new DurableScheduler({ namespace, namePrefix: "o/acme/" }).pending("run_1");
      expect(names).toEqual(["u/acme/run_1", "o/acme/run_1", "o/acme/run_1"]);
    });

    it("refuses an id or key that breaks its rule before naming an object", async () => {
      const { names, namespace } = namingNamespace();
      const store = new DurableRunStore({ namespace, runList: noRunList, namePrefix: "u/acme/" });
      const scheduler = new DurableScheduler({ namespace, namePrefix: "u/acme/" });
      for (const id of unsafeIds) {
        await expect(store.get(id)).rejects.toThrow(RangeError);
      }
      for (const key of ["../run_1", "run_1/x", "", "k".repeat(257)]) {
        await expect(scheduler.pending(key)).rejects.toThrow(RangeError);
      }
      expect(names).toEqual([]);
    });

    it("tells a subscriber to an unsafe id that it failed, and names no object", async () => {
      const { names, namespace } = namingNamespace();
      const events = new DurableRunEvents({ namespace, namePrefix: "u/acme/" });
      const failure = await new Promise<unknown>((resolve) => {
        events.subscribe("../run_1", 0, { onEvent: () => {}, onClose: resolve });
      });
      expect(failure).toBeInstanceOf(RangeError);
      expect(names).toEqual([]);
    });

    it("refuses a prefix that doesn't end in a slash", () => {
      const { namespace } = namingNamespace();
      expect(
        () => new DurableRunStore({ namespace, runList: noRunList, namePrefix: "u/acme" }),
      ).toThrow(RangeError);
      expect(() => new DurableRunEvents({ namespace, namePrefix: "u/acme" })).toThrow(RangeError);
      expect(() => new DurableScheduler({ namespace, namePrefix: "u/acme" })).toThrow(RangeError);
    });
  });
});

verifies("cloudflare-durable.name-prefix-parts", () => {
  describe("run object name prefixes", () => {
    const { namespace } = namingNamespace();

    it("refuses a prefix with an empty part, a dot or another character", () => {
      const refused = ["a//", "../", "u/../", "/", "u/a.b/", "u/a b/", `${"p".repeat(65)}/`];
      for (const namePrefix of refused) {
        expect(() => new DurableRunEvents({ namespace, namePrefix })).toThrow(RangeError);
      }
    });

    it("takes an empty prefix and scope prefixes", () => {
      for (const namePrefix of ["", "acme/", "u/eu_acme0000000000000/", "o/case-1_a/"]) {
        expect(() => new DurableRunEvents({ namespace, namePrefix })).not.toThrow();
      }
    });
  });
});
