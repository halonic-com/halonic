import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

describe("format.provider-file", () => {
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

  it("refuses an API key written into the file instead of a secret name", () => {
    const text = yaml("id: openai", "type: openai", "apiKey: sk-test");
    const [problem] = problemsOf("provider", text);
    expect(problem).toMatchObject({ code: "unrecognized_keys", path: [], keys: ["apiKey"] });
  });
});
