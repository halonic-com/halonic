import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  addAlias,
  editAliasFallbacks,
  editAliasPrice,
  editAliasTarget,
  parseFallbacks,
  zeroPriceWarning,
} from "./alias-edits.ts";

const file = `version: 1
aliases:
  # the everyday model
  smart:
    provider: anthropic
    model: claude-sonnet-5-5
  default:
    provider: ollama
    model: llama3.2
  fast:
    provider: openai
    model: gpt-5-mini
`;

function textOf(result: { ok: boolean; value?: string }): string {
  expect(result.ok).toBe(true);
  return result.value ?? "";
}

verifies("models.aliases.edit-target", () => {
  it("writes the provider and model and keeps the comments", () => {
    const text = textOf(
      editAliasTarget(file, "smart", { provider: "openai", model: " gpt-5-mini " }, "x"),
    );
    expect(text).toContain("# the everyday model");
    expect(text).toContain("provider: openai\n    model: gpt-5-mini");
  });

  it("writes nothing for an empty model and offers the old one back", () => {
    const result = editAliasTarget(file, "fast", { provider: "openai", model: " " }, "gpt-5-mini");
    expect(result).toEqual({
      ok: false,
      error: { field: "model", message: "Give the model a name. Put back gpt-5-mini." },
    });
  });
});

verifies("models.aliases.edit-fallbacks", () => {
  it("trims names and drops empty entries", () => {
    expect(parseFallbacks(" default, , fast ")).toEqual(["default", "fast"]);
  });

  it("saves the fallback list in order, and an empty field empties it", () => {
    const text = textOf(editAliasFallbacks(file, "smart", " default, , fast "));
    expect(text).toContain("fallback:");
    expect(text.indexOf("- default")).toBeLessThan(text.indexOf("- fast"));
    const emptied = textOf(editAliasFallbacks(text, "smart", ""));
    expect(emptied).not.toContain("- default");
  });

  it("names a fallback that is not an alias and writes nothing", () => {
    const result = editAliasFallbacks(file, "smart", "default, smartest");

    expect(result).toEqual({
      ok: false,
      error: {
        field: "fallbacks",
        message: "There's no model alias called smartest. Pick one from the list.",
      },
    });
  });
});

verifies("models.aliases.create", () => {
  it("adds the alias with its provider and model and keeps the rest of the file", () => {
    const text = textOf(addAlias(file, " cheap ", { provider: "openai", model: " gpt-5-nano " }));

    expect(text).toContain("# the everyday model");
    expect(text).toMatch(/cheap:\s+provider: openai\s+model: gpt-5-nano/);
  });

  it("adds the first alias to a file with none", () => {
    const text = textOf(
      addAlias("version: 1\naliases: {}\n", "fast", { provider: "ollama", model: "llama3.2" }),
    );

    expect(text).toMatch(/fast:\s+provider: ollama\s+model: llama3.2/);
  });

  it("refuses an empty name, a taken name and a name with a slash", () => {
    const target = { provider: "openai", model: "m" };

    expect(addAlias(file, "  ", target)).toEqual({
      ok: false,
      error: { field: "name", message: "Give it a name." },
    });
    expect(addAlias(file, "smart", target)).toEqual({
      ok: false,
      error: { field: "name", message: "There's already a model alias called smart." },
    });
    expect(addAlias(file, "a/b", target)).toEqual({
      ok: false,
      error: {
        field: "name",
        message:
          "A name can't contain /. Halonic reads provider/model names as a provider and a model.",
      },
    });
  });

  it("refuses an empty model", () => {
    expect(addAlias(file, "cheap", { provider: "openai", model: " " })).toEqual({
      ok: false,
      error: { field: "model", message: "Give the model's name, like claude-sonnet-5-5." },
    });
  });

  it("refuses an empty or invalid provider", () => {
    expect(addAlias(file, "cheap", { provider: " ", model: "m" })).toEqual({
      ok: false,
      error: { field: "provider", message: "Pick a provider." },
    });
    expect(addAlias(file, "cheap", { provider: "Open AI", model: "m" })).toEqual({
      ok: false,
      error: {
        field: "provider",
        message: "A provider's name uses lowercase letters, digits, - and _.",
      },
    });
  });

  it("refuses a file that does not read as models.yaml", () => {
    const result = addAlias("aliases: [not, a, map", "cheap", { provider: "a", model: "b" });

    expect(result.ok).toBe(false);
  });
});

verifies("models.aliases.edit-price", () => {
  it("reads a dot or a comma and writes numbers", () => {
    const text = textOf(editAliasPrice(file, "smart", { input: "3.00", output: "15,00" }));
    expect(text).toContain("input: 3");
    expect(text).toContain("output: 15");
  });

  it("writes nothing while one price is empty, but still refuses one that isn't an amount", () => {
    expect(textOf(editAliasPrice(file, "default", { input: "3", output: "" }))).toBe(file);
    expect(editAliasPrice(file, "default", { input: "x", output: "" })).toMatchObject({
      ok: false,
      error: { field: "input" },
    });
  });

  it("removes the price when both fields are empty", () => {
    const priced = textOf(editAliasPrice(file, "smart", { input: "3", output: "15" }));
    expect(textOf(editAliasPrice(priced, "smart", { input: "", output: " " }))).toBe(file);
  });

  it("keeps cache prices the file already has", () => {
    const withCache = file.replace(
      "model: gpt-5-mini\n",
      "model: gpt-5-mini\n    price: { input: 1, output: 2, cacheRead: 0.1 }\n",
    );
    expect(textOf(editAliasPrice(withCache, "fast", { input: "4", output: "8" }))).toContain(
      "cacheRead: 0.1",
    );
  });

  it("writes nothing for an amount with grouping, and says which field", () => {
    expect(editAliasPrice(file, "smart", { input: "1.000,50", output: "2" })).toMatchObject({
      ok: false,
      error: { field: "input", message: "Enter an amount, like you'd write it on a receipt." },
    });
  });

  it("warns about a zero price on a cloud provider only", () => {
    const warning = "A price of 0 means these calls look free in your estimated spend.";
    expect(zeroPriceWarning({ input: 0, output: 5 }, false)).toBe(warning);
    expect(zeroPriceWarning({ input: 0, output: 0 }, true)).toBeUndefined();
    expect(zeroPriceWarning({ input: 1, output: 5 }, false)).toBeUndefined();
    expect(zeroPriceWarning({ input: undefined, output: 5 }, false)).toBeUndefined();
    expect(zeroPriceWarning({ input: undefined, output: undefined }, false)).toBeUndefined();
  });
});
