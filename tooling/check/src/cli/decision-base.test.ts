import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { isSignableBase } from "./decision-base.ts";

verifies("check.decision-sign-release-base", () => {
  test.each(["main", "release/halonic-0.1.1", "release/kit/0.2"])("signs for %s", (base) => {
    expect(isSignableBase(base)).toBe(true);
  });

  test.each(["develop", "release", "release/", "release/../main", "release/a b", "mainline"])(
    "refuses %s",
    (base) => {
      expect(isSignableBase(base)).toBe(false);
    },
  );
});
