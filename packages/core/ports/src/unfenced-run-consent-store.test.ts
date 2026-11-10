import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { UnfencedRunConsent, UnfencedRunConsentStore } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const consent: UnfencedRunConsent = { reason: "windows", allowedAt: "2026-11-09T10:00:00.000Z" };

verifies("ports.unfenced-run-consent-store", () => {
  typeTest("only stores the one yes: get, save and remove", () => {
    expectTypeOf<keyof UnfencedRunConsentStore>().toEqualTypeOf<"get" | "save" | "remove">();
    expectTypeOf<UnfencedRunConsentStore["get"]>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<UnfencedRunConsentStore["get"]>().returns.toEqualTypeOf<
      Promise<UnfencedRunConsent | null>
    >();
    expectTypeOf<UnfencedRunConsentStore["save"]>().parameters.toEqualTypeOf<
      [consent: UnfencedRunConsent]
    >();
    expectTypeOf<UnfencedRunConsentStore["remove"]>().parameters.toEqualTypeOf<[]>();
  });

  it("keeps the reason and the time with the yes", () => {
    // @ts-expect-error: a yes holds only for the reason it was given for
    const unreasoned: UnfencedRunConsent = { ...consent, reason: undefined };
    // @ts-expect-error: Studio shows when the yes was given
    const undated: UnfencedRunConsent = { ...consent, allowedAt: undefined };
    expect(consent.reason).toBe("windows");
    expect([unreasoned, undated]).toHaveLength(2);
  });
});
