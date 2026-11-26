import type { InboxWaitContext } from "@halonicjs/studio-feature-inbox/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keepNewest, waitContextsOf } from "./served-wait-context.ts";

describe("the waiting list's context in the served Studio", () => {
  verifies("studio.served-wait-context", () => {
    it("reads each run's context and leaves out what it can't read", () => {
      const read = waitContextsOf({
        r1: { workflow: "Support reply", description: "Approve?", startInput: "Hi", sample: true },
        r2: { workflow: "Support reply", description: 3, startInput: "", sample: "yes" },
        r3: { description: "No workflow" },
        r4: "Support reply",
        constructor: { workflow: "Weekly report", sample: false },
      });
      expect(Object.fromEntries(read ?? [])).toEqual({
        r1: { workflow: "Support reply", description: "Approve?", startInput: "Hi", sample: true },
        r2: { workflow: "Support reply", sample: false },
        constructor: { workflow: "Weekly report", sample: false },
      });
      for (const unreadable of [undefined, null, [], "context"]) {
        expect(waitContextsOf(unreadable)).toBeUndefined();
      }
    });

    it("keeps a run's context after it leaves the list, the newest 200 at most", () => {
      const kept = new Map<string, InboxWaitContext>();
      const of = (workflow: string) => ({ workflow, sample: false });
      keepNewest(kept, new Map([["r0", of("Support reply")]]));
      keepNewest(kept, new Map());
      expect(kept.get("r0")?.workflow).toBe("Support reply");

      keepNewest(kept, new Map(Array.from({ length: 200 }, (_, i) => [`n${i}`, of("Weekly")])));
      expect(kept.size).toBe(200);
      expect(kept.has("r0")).toBe(false);
      // A run listed again counts as new, so it outlasts the ones listed before it.
      keepNewest(kept, new Map([["n0", of("Weekly report")]]));
      keepNewest(kept, new Map([["x", of("Support reply")]]));
      expect(kept.get("n0")?.workflow).toBe("Weekly report");
      expect(kept.has("n1")).toBe(false);
    });
  });
});
