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

  it("refuses a base URL without http:// or https://, on its line", () => {
    const text = yaml("id: ollama", "type: ollama", "baseUrl: localhost:11434");
    const [problem, ...others] = problemsOf("provider", text);
    expect(others).toEqual([]);
    expect(problem).toMatchObject({ code: "provider-base-url", path: ["baseUrl"], line: 3 });
    expect(problem?.message).toBe(
      "baseUrl needs http:// or https://, such as http://localhost:11434",
    );
  });

  it("accepts a base URL with http:// or https://", () => {
    for (const baseUrl of ["http://localhost:11434", "https://llm.example.com/v1"]) {
      const text = yaml("id: local", "type: openai-compatible", `baseUrl: ${baseUrl}`);
      expect(parsedValue("provider", text).baseUrl).toBe(baseUrl);
    }
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

verifies("format.provider-searches-web", () => {
  const openRouter = (...lines: string[]) =>
    yaml("id: openrouter", "type: openai-compatible", ...lines);

  it("leaves searchesWeb out when the file does", () => {
    expect(parsedValue("provider", openRouter())).not.toHaveProperty("searchesWeb");
  });

  it("keeps the listed model ids in order", () => {
    const text = openRouter("searchesWeb: [perplexity/sonar, perplexity/sonar-pro]");
    expect(parsedValue("provider", text).searchesWeb).toEqual([
      "perplexity/sonar",
      "perplexity/sonar-pro",
    ]);
  });

  it("refuses a model id listed twice, at the repeat", () => {
    const text = openRouter("searchesWeb: [perplexity/sonar, perplexity/sonar]");
    const [problem, ...others] = problemsOf("provider", text);
    expect(others).toEqual([]);
    expect(problem).toMatchObject({ code: "duplicate", path: ["searchesWeb", 1], line: 3 });
    expect(problem?.message).toBe(
      "searchesWeb lists perplexity/sonar twice in providers/openrouter.yaml",
    );
  });

  it("refuses an empty model id", () => {
    const [problem] = problemsOf("provider", openRouter('searchesWeb: [""]'));
    expect(problem?.path).toEqual(["searchesWeb", 0]);
  });

  it("refuses a single id instead of a list", () => {
    const [problem] = problemsOf("provider", openRouter("searchesWeb: perplexity/sonar"));
    expect(problem).toMatchObject({ code: "invalid_type", path: ["searchesWeb"] });
  });
});
