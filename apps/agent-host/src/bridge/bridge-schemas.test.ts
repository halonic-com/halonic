import { parse } from "@halonicjs/schema-kit";
import { describe, expect, it } from "vitest";
import { answerBody, priceIn } from "./bridge-schemas.ts";

describe("priceIn", () => {
  it("finds a model's price, and never one the table inherits", () => {
    const table = { anthropic: { "claude-sonnet-5-5": { input: 3, output: 15 } } };
    expect(priceIn(table, "anthropic", "claude-sonnet-5-5")).toEqual({ input: 3, output: 15 });
    expect(priceIn(table, "anthropic", "constructor")).toBeNull();
    expect(priceIn(table, "openai", "gpt-5")).toBeNull();
  });
});

describe("answerBody", () => {
  const ids = { bridge: "b1", call: "1" };

  it("takes a result, or an error as text", () => {
    expect(parse(answerBody, { ...ids, result: { kind: "run" } }).ok).toBe(true);
    expect(parse(answerBody, { ...ids, result: null }).ok).toBe(true);
    expect(parse(answerBody, { ...ids, error: "the connection is gone" }).ok).toBe(true);
  });

  it("refuses anything else: no answer, both, an error that isn't text, extra keys", () => {
    for (const body of [
      ids,
      { ...ids, result: 1, error: "x" },
      { ...ids, error: { message: "x" } },
      { ...ids, error: null },
      { ...ids, result: 1, extra: true },
      { bridge: "b1", result: 1 },
      { call: "1", result: 1 },
      { ...ids, call: 1, result: 1 },
    ]) {
      expect(parse(answerBody, body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});
