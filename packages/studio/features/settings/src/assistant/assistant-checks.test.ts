import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkBaseUrl, checkModel, checkSecretName, checkTurnLimit } from "./assistant-checks.ts";

const turnError = { ok: false, error: "Enter a whole number from 1 to 64." };

verifies("settings.ai-agent-fields", () => {
  it("needs a model once a provider is set, and names a model in the error", () => {
    expect(checkModel("anthropic", "  ")).toEqual({
      ok: false,
      error: "Enter a model name, like claude-sonnet-5-5.",
    });
    expect(checkModel("ollama", "")).toEqual({
      ok: false,
      error: "Enter a model name, like llama3.2.",
    });
    expect(checkModel("openai-compatible", "")).toEqual({
      ok: false,
      error: "Enter a model name, like llama-3.1-8b-instruct.",
    });
    expect(checkModel("lmstudio", "")).toEqual({
      ok: false,
      error: "Enter a model name, like llama-3.1-8b-instruct.",
    });
  });

  it("lets Model be empty with no provider, and trims it", () => {
    expect(checkModel("not-set-up", "")).toEqual({ ok: true, value: "" });
    expect(checkModel("anthropic", " claude-sonnet-5-5 ")).toEqual({
      ok: true,
      value: "claude-sonnet-5-5",
    });
  });

  it("accepts an empty Base URL except for OpenAI-compatible", () => {
    expect(checkBaseUrl("anthropic", "")).toEqual({ ok: true, value: "" });
    expect(checkBaseUrl("openai-compatible", "")).toEqual({
      ok: false,
      error: "Enter a full address, like http://localhost:8000/v1.",
    });
  });

  it("refuses an address that carries a name or password", () => {
    const error = "Enter a full address, like http://localhost:8000/v1.";
    expect(checkBaseUrl("openai-compatible", "https://me:token@host/v1")).toEqual({
      ok: false,
      error,
    });
    expect(checkBaseUrl("openai-compatible", "https://token@host/v1")).toEqual({
      ok: false,
      error,
    });
    expect(checkBaseUrl("openai-compatible", "https://:token@host/v1")).toEqual({
      ok: false,
      error,
    });
  });

  it("accepts a full http or https address and nothing else", () => {
    expect(checkBaseUrl("ollama", "http://localhost:11434/v1")).toEqual({
      ok: true,
      value: "http://localhost:11434/v1",
    });
    for (const bad of ["localhost:8000", "ftp://host/v1", "not an address", "http://"]) {
      expect(checkBaseUrl("ollama", bad).ok, bad).toBe(false);
    }
  });

  it("accepts an empty secret name or one a secret can have", () => {
    expect(checkSecretName("")).toEqual({ ok: true, value: "" });
    expect(checkSecretName(" anthropic-api-key ")).toEqual({
      ok: true,
      value: "anthropic-api-key",
    });
    expect(checkSecretName("my key").ok).toBe(false);
    expect(checkSecretName("1key").ok).toBe(false);
  });

  it.each(["1", "16", " 64 "])("accepts the turn limit %j", (typed) => {
    expect(checkTurnLimit(typed)).toEqual({ ok: true, value: Number(typed) });
  });

  it("reads an empty turn limit as the default", () => {
    expect(checkTurnLimit("  ")).toEqual({ ok: true, value: undefined });
  });

  it.each(["0", "65", "2.5", "many", "-3", "1e1", "0016x"])(
    "refuses the turn limit %j",
    (typed) => {
      expect(checkTurnLimit(typed)).toEqual(turnError);
    },
  );
});
