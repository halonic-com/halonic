import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { priceOf } from "./index.ts";

verifies("ports.model-price", () => {
  it("prices a call per million tokens, dividing once", () => {
    const usage = { inputTokens: 1_000, outputTokens: 200 };
    expect(priceOf({ input: 3, output: 15 }, usage)).toBe(0.006);
  });

  it("doesn't round the cost", () => {
    const usage = { inputTokens: 1, outputTokens: 3 };
    expect(priceOf({ input: 2, output: 8 }, usage)).toBe(0.000026);
  });
});
