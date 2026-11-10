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

  it("prices cache reads and writes at their own prices", () => {
    const price = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
    const usage = {
      inputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 10_000,
      cacheWriteTokens: 1_000,
    };
    // 100 × 3 + 10,000 × 0.3 + 1,000 × 3.75 = 7,050 per million
    expect(priceOf(price, usage)).toBe(0.00705);
  });

  it("makes a cache-heavy call cost less than the same tokens as plain input", () => {
    const price = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
    const cached = {
      inputTokens: 50,
      outputTokens: 200,
      cacheReadTokens: 90_000,
      cacheWriteTokens: 2_000,
    };
    const plain = { inputTokens: 92_050, outputTokens: 200 };
    expect(priceOf(price, cached)).toBeLessThan(priceOf(price, plain) / 5);
  });

  it("prices cache tokens at the input price when the model has no cache price", () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 900,
      cacheWriteTokens: 1_000,
    };
    const plain = { inputTokens: 2_000, outputTokens: 10 };
    expect(priceOf({ input: 3, output: 15 }, usage)).toBe(priceOf({ input: 3, output: 15 }, plain));
  });

  it("prices 1-hour cache writes at their own price", () => {
    const price = { input: 3, output: 15, cacheWrite: 3.75, cacheWrite1h: 6 };
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000,
      cacheWrite1hTokens: 1_000,
    };
    // 1,000 × 3.75 + 1,000 × 6 = 9,750 per million
    expect(priceOf(price, usage)).toBe(0.00975);
  });

  it("prices 1-hour cache writes at the short write price when the model has no 1-hour price", () => {
    const price = { input: 3, output: 15, cacheWrite: 3.75 };
    const oneHour = { inputTokens: 100, outputTokens: 10, cacheWrite1hTokens: 1_000 };
    const short = { inputTokens: 100, outputTokens: 10, cacheWriteTokens: 1_000 };
    expect(priceOf(price, oneHour)).toBe(priceOf(price, short));
  });
});
