import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { triggerKind } from "./trigger-kind.ts";

verifies("routines.trigger-kind", () => {
  // New: the old code had this function but no test for it.
  it("names each kind of trigger", () => {
    expect(triggerKind({ schedule: "0 8 * * *" })).toBe("schedule");
    expect(triggerKind({ every: "15m" })).toBe("every");
    expect(triggerKind({ manual: true })).toBe("manual");
    expect(triggerKind({ mail: { connector: "gmail", query: "in:inbox", every: "2m" } })).toBe(
      "mail",
    );
    expect(triggerKind({ signal: { name: "ready" } })).toBe("signal");
  });
});
