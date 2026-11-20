import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  choiceModel,
  firstRunKeyProviders,
  firstRunLocalProvider,
  firstRunProviders,
  keyProblem,
  testTimeLimitMs,
} from "./model-choice.ts";

verifies("app.model-choice-not-a-key", () => {
  it.each([
    ["", "empty"],
    ["   \n", "empty"],
    ["sk-ant-api03 abc", "spaces"],
    ["sk-ant-api03\nabc", "spaces"],
    ["https://console.anthropic.com/settings/keys", "url"],
    ["www.anthropic.com", "url"],
    ["sk-proj-abc123", "wrong-start"],
  ])("finds %j isn't an Anthropic key: %s", (text, kind) => {
    expect(keyProblem("anthropic", text)).toEqual({ kind, keyStart: "sk-ant-" });
  });

  it("knows an Anthropic key pasted for OpenAI, though both start with sk-", () => {
    expect(keyProblem("openai", "sk-ant-api03-abc")).toEqual({
      kind: "wrong-start",
      keyStart: "sk-",
    });
  });

  it("gives each provider's own usual start", () => {
    expect(keyProblem("gemini", "sk-abc")).toEqual({ kind: "wrong-start", keyStart: "AIza" });
  });

  it.each([
    ["anthropic", "sk-ant-api03-abc"],
    ["openai", "sk-proj-abc123\n"],
    ["gemini", "  AIzaSyAbc"],
  ] as const)("lets a %s key through, with spaces and line breaks around it", (provider, text) => {
    expect(keyProblem(provider, text)).toBeUndefined();
  });
});

verifies("app.model-choice-test-call", () => {
  it("gives a key 5 seconds and a local model 180", () => {
    expect(testTimeLimitMs({ kind: "key", provider: "anthropic" })).toBe(5_000);
    expect(testTimeLimitMs({ kind: "local", model: "llama3.2" })).toBe(180_000);
  });

  it("uses the provider table's model for a key, and the picked one for local", () => {
    expect(choiceModel({ kind: "key", provider: "anthropic" })).toBe("claude-haiku-5-5");
    expect(choiceModel({ kind: "key", provider: "openai" })).toBe("gpt-6-luna");
    expect(choiceModel({ kind: "key", provider: "gemini" })).toBe("gemini-3.1-flash-lite");
    expect(choiceModel({ kind: "local", model: "qwen3:8b" })).toBe("qwen3:8b");
  });
});

verifies("app.model-choice-provider-file", () => {
  describe("every provider's file text", () => {
    const rows = [
      ...firstRunKeyProviders.map((id) => firstRunProviders[id]),
      firstRunLocalProvider,
    ];

    it.each(rows.map((row) => [row.id, row] as const))("%s parses as the row says", (_, row) => {
      const parsed = parseFile("provider", row.fileText, { id: row.id });
      if (!parsed.ok) throw new Error(`${row.id}: ${JSON.stringify(parsed.error)}`);
      const file = parsed.value.value;
      expect([file.id, file.type, file.baseUrl, file.secret, file.local]).toEqual([
        row.id,
        row.type,
        row.baseUrl,
        row.secretName,
        row.local,
      ]);
    });
  });
});
