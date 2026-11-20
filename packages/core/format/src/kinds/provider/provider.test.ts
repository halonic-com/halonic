import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { providerTypes } from "./types.ts";

verifies("format.provider-file", () => {
  it("fills in local and options", () => {
    expect(parsedValue("provider", yaml("id: mock", "type: mock"))).toEqual({
      version: 1,
      id: "mock",
      type: "mock",
      local: false,
      options: {},
    });
  });

  it("refuses a base URL that isn't a URL", () => {
    const text = yaml("id: local-llm", "type: openai-compatible", "baseUrl: not a url");
    expect(summary(problemsOf("provider", text))).toEqual(["baseUrl invalid_format 3"]);
  });

  it("refuses a provider without a type", () => {
    expect(summary(problemsOf("provider", yaml("id: mock")))).toEqual(["type invalid_type 1"]);
  });

  it("refuses a type Halonic can't call, on its line, listing the types it can", () => {
    const [problem, ...others] = problemsOf("provider", yaml("id: mock", "type: antropic"));
    expect(others).toEqual([]);
    expect(problem).toMatchObject({ code: "provider-type", path: ["type"], line: 2 });
    expect(problem?.message).toBe(
      "Halonic can't call provider type antropic: set type in providers/mock.yaml to one of anthropic, openai, openai-compatible, ollama, lmstudio or mock",
    );
  });

  it("accepts every type Halonic can call", () => {
    for (const type of providerTypes) {
      expect(parsedValue("provider", yaml("id: p", `type: ${type}`)).type).toBe(type);
    }
  });

  it("refuses an API key written into the file instead of a secret name", () => {
    const text = yaml("id: openai", "type: openai", "apiKey: sk-test");
    const [problem] = problemsOf("provider", text);
    expect(problem).toMatchObject({ code: "unrecognized_keys", path: [], keys: ["apiKey"] });
  });
});
