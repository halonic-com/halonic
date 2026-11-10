import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.models-file", () => {
  it("fills in params and fallback for each alias", () => {
    const text = yaml("aliases:", "  fast:", "    provider: mock", "    model: echo");
    expect(parsedValue("models", text)).toEqual({
      version: 1,
      aliases: { fast: { provider: "mock", model: "echo", params: {}, fallback: [] } },
    });
  });

  it("keeps a price and tuning", () => {
    const text = yaml(
      "aliases:",
      "  smart:",
      "    provider: mock",
      "    model: deep",
      "    price: { input: 3, output: 15 }",
      "    params: { temperature: 0.2, reasoningEffort: high }",
    );
    const alias = parsedValue("models", text).aliases["smart"];
    expect(alias?.price).toEqual({ input: 3, output: 15 });
    expect(alias?.params).toEqual({ temperature: 0.2, reasoningEffort: "high" });
  });

  it("keeps the prompt cache prices, which are optional", () => {
    const text = yaml(
      "aliases:",
      "  smart:",
      "    provider: anthropic",
      "    model: claude-sonnet",
      "    price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }",
    );
    const alias = parsedValue("models", text).aliases["smart"];
    expect(alias?.price).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  });

  it("refuses a temperature above 2 and a negative price", () => {
    const text = yaml(
      "aliases:",
      "  fast:",
      "    provider: mock",
      "    model: echo",
      "    params: { temperature: 3 }",
      "    price: { input: -1, output: 0 }",
    );
    expect(summary(problemsOf("models", text))).toEqual([
      "aliases.fast.params.temperature too_big 5",
      "aliases.fast.price.input too_small 6",
    ]);
  });

  it("refuses a file without aliases", () => {
    expect(summary(problemsOf("models", yaml("version: 1")))).toEqual(["aliases invalid_type 1"]);
  });

  it("refuses a file that is a list", () => {
    expect(summary(problemsOf("models", yaml("- fast")))).toEqual([" invalid_type 1"]);
  });
});
