import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { becamePayPerUse, stepToAsk } from "./step-asks.ts";
import { editStep, type StepFields } from "./step-edits.ts";

const cloud = { type: "openai", options: {}, secret: "openai" };
const ollama = { type: "ollama", options: {} };
const lan = { type: "lmstudio", baseUrl: "http://192.168.1.20:1234/v1", options: {} };
const open = { hasBudget: false, unpricedAliases: 2, noLimitRemembered: false };

const models = "version: 1\naliases:\n  fast:\n    provider: openai\n    model: gpt-mini\n";
const workspace = "version: 1\nid: acme\nname: Acme\n";
const texts = { models, workspace };
const base: StepFields = {
  prices: [],
  currency: "EUR",
  workspaceCurrency: "EUR",
  budget: undefined,
};

verifies("models.budget-step.ask-for-pay-per-use", () => {
  describe("stepToAsk", () => {
    it("offers the whole step with no budget", () => {
      expect(stepToAsk({ ...open, provider: cloud })).toBe("full");
    });

    it("offers only the prices with a budget while an alias has none", () => {
      expect(stepToAsk({ ...open, provider: cloud, hasBudget: true })).toBe("narrowed");
      expect(stepToAsk({ ...open, provider: cloud, hasBudget: true, unpricedAliases: 0 })).toBe(
        "none",
      );
    });
  });

  describe("becamePayPerUse", () => {
    it("holds when a provider gets a secret or is new", () => {
      expect(becamePayPerUse(lan, { ...lan, secret: "lan" })).toBe(true);
      expect(becamePayPerUse(undefined, cloud)).toBe(true);
    });

    it("holds when a pay-per-use provider moves to another host, not when it stays", () => {
      const at = (baseUrl: string) => ({ ...cloud, baseUrl });
      expect(becamePayPerUse(at("https://a.example/v1"), at("https://b.example/v1"))).toBe(true);
      expect(becamePayPerUse(at("https://a.example/v1"), at("https://a.example/v2"))).toBe(false);
    });

    it("doesn't hold when the provider isn't pay-per-use", () => {
      expect(becamePayPerUse(cloud, ollama)).toBe(false);
    });
  });

  describe("editStep", () => {
    it("writes the filled prices and the budget amounts", () => {
      const edited = editStep(texts, {
        ...base,
        prices: [{ alias: "fast", input: "3.00", output: "15,00" }],
        budget: { perRun: "", monthly: "50" },
      });

      expect(edited.ok && edited.value.models).toContain("input: 3");
      expect(edited.ok && edited.value.models).toContain("output: 15");
      expect(edited.ok && edited.value.workspace).toContain("monthly: 50");
    });

    it("writes nothing for an empty row and leaves the budget alone without budget fields", () => {
      const edited = editStep(texts, {
        ...base,
        prices: [{ alias: "fast", input: "", output: " " }],
      });

      expect(edited).toEqual({ ok: true, value: texts });
    });

    it("writes only the currency, so the workspace still has no budget", () => {
      const edited = editStep(texts, { ...base, currency: "USD" });

      expect(edited.ok && edited.value.workspace).toContain("budget:\n  currency: USD");
      expect(edited.ok && edited.value.workspace).not.toContain("monthly");
    });

    it("names the empty field of a half-filled row", () => {
      const edited = editStep(texts, {
        ...base,
        prices: [{ alias: "fast", input: "3", output: "" }],
      });

      expect(edited).toEqual({
        ok: false,
        error: {
          field: "output",
          alias: "fast",
          message: "Enter an amount, like you'd write it on a receipt.",
        },
      });
    });

    it("names the price field that isn't an amount", () => {
      const edited = editStep(texts, {
        ...base,
        prices: [{ alias: "fast", input: "1.000,50", output: "2" }],
      });

      expect(edited.ok).toBe(false);
      expect(!edited.ok && edited.error).toMatchObject({ field: "input", alias: "fast" });
    });

    it("names the budget field that isn't above 0", () => {
      const edited = editStep(texts, { ...base, budget: { perRun: "0", monthly: "" } });

      expect(!edited.ok && edited.error.field).toBe("perRun");
    });

    it("refuses a file that can't be edited", () => {
      const broken = { ...texts, workspace: "a: [" };

      expect(!editStep(broken, { ...base, currency: "USD" }).ok).toBe(true);
      expect(!editStep(broken, { ...base, budget: { perRun: "5", monthly: "" } }).ok).toBe(true);
      expect(
        !editStep(
          { ...texts, models: "a: [" },
          {
            ...base,
            prices: [{ alias: "fast", input: "1", output: "2" }],
          },
        ).ok,
      ).toBe(true);
    });
  });
});

verifies("models.budget-step.no-limit-remembered", () => {
  it("offers nothing once No limit is remembered, with or without a budget", () => {
    const remembered = { ...open, provider: cloud, noLimitRemembered: true };

    expect(stepToAsk(remembered)).toBe("none");
    expect(stepToAsk({ ...remembered, hasBudget: true })).toBe("none");
  });
});

verifies("models.budget-step.never-for-local", () => {
  it("offers nothing for a provider on this computer or a private network", () => {
    expect(stepToAsk({ ...open, provider: ollama })).toBe("none");
    expect(stepToAsk({ ...open, provider: lan })).toBe("none");
  });
});
