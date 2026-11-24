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
      "    price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWrite1h: 6 }",
    );
    const alias = parsedValue("models", text).aliases["smart"];
    expect(alias?.price).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      cacheWrite1h: 6,
    });
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

verifies("format.models-provider-routing", () => {
  /** A `models.yaml` whose alias `pinned` has `extra` as given, in YAML's flow form. */
  const withExtra = (extra: string) =>
    yaml(
      "aliases:",
      "  pinned:",
      "    provider: openrouter",
      "    model: deepseek/deepseek-v4.1-flash",
      `    params: { extra: ${extra} }`,
    );

  it("keeps a host pin of OpenRouter's routing keys, and the other extras", () => {
    const routing = {
      order: ["deepinfra/fp8"],
      only: ["deepinfra"],
      ignore: ["acme-host"],
      allow_fallbacks: false,
      data_collection: "deny",
      zdr: true,
      quantizations: ["fp8"],
    };
    const text = withExtra(`{ provider: ${JSON.stringify(routing)}, top_k: 40 }`);
    const alias = parsedValue("models", text).aliases["pinned"];
    expect(alias?.params.extra).toEqual({ provider: routing, top_k: 40 });
  });

  it.each([
    ["a key OpenRouter's routing doesn't have", "{ sort: price }", "unrecognized_keys"],
    ["a host that isn't in a list", "{ order: deepinfra }", "invalid_type"],
    ["fallbacks that aren't true or false", "{ allow_fallbacks: no-thanks }", "invalid_type"],
    ["data collection other than allow or deny", "{ data_collection: some }", "invalid_value"],
    ["a zero data retention that isn't true or false", "{ zdr: 1 }", "invalid_type"],
    ["a precision that isn't text", "{ quantizations: [8] }", "invalid_type"],
    ["a routing that isn't a map", "deepinfra", "invalid_type"],
  ])("refuses %s when the file loads", (_case, provider, code) => {
    const problems = summary(problemsOf("models", withExtra(`{ provider: ${provider} }`)));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      new RegExp(`^aliases\\.pinned\\.params\\.extra\\.provider\\S* ${code} 5$`),
    );
  });
});
