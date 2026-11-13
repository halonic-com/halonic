import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { describeTrigger } from "./describe-trigger.ts";
import { due } from "./due.ts";
import { nextRun } from "./next-run.ts";
import { triggerError } from "./trigger-error.ts";
import { triggerKind } from "./trigger-kind.ts";

const webhook = { webhook: { secret: "acme-hook", headers: [] } };

verifies("routines.webhook-trigger", () => {
  it("names the kind", () => {
    expect(triggerKind(webhook)).toBe("webhook");
  });

  it("describes it without naming the secret", () => {
    expect(describeTrigger(webhook)).toBe("On a signed web request");
  });

  it("never fires on a clock and has nothing wrong with it", () => {
    expect(nextRun(webhook, new Date("2026-11-03T10:00:00Z"))).toBeNull();
    expect(triggerError(webhook)).toBeNull();
  });

  it("is never due, however long the tick was away", () => {
    const routine = parseFile(
      "routine",
      "id: orders\nname: Orders\ntrigger: { webhook: { secret: acme-hook } }\nrun: { workflow: w }\n",
      {},
    );
    if (!routine.ok) {
      expect.fail(JSON.stringify(routine.error));
    }
    const runs = due(
      [{ hub: "h", routine: routine.value.value }],
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-03T00:00:00Z"),
    );
    expect(runs).toEqual([]);
  });
});
