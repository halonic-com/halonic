import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parse, s } from "./index.ts";
import type { Schema } from "./schema.ts";

/** The one issue's code, path and message, for a schema that fails once. */
function onlyIssue(schema: Schema, input: unknown) {
  const result = parse(schema, input);
  expect(result.ok).toBe(false);
  if (result.ok) return undefined;
  expect(result.error).toHaveLength(1);
  const [issue] = result.error;
  return issue === undefined ? undefined : [issue.code, issue.path, issue.message];
}

verifies("schema-kit.plain-words", () => {
  describe("a value of the wrong type", () => {
    const numbers = s.object({ params: s.object({ temperature: s.number() }) });

    it("asks for a number without quotes", () => {
      expect(onlyIssue(numbers, { params: { temperature: "0.2" } })).toEqual([
        "invalid_type",
        ["params", "temperature"],
        "temperature is a number: write 0.2 without quotes.",
      ]);
    });

    it("doesn't repeat a long quoted number", () => {
      const long = `0.${"2".repeat(50)}`;
      expect(onlyIssue(numbers, { params: { temperature: long } })).toEqual([
        "invalid_type",
        ["params", "temperature"],
        "temperature is a number: write it without quotes.",
      ]);
    });

    it("says what a number isn't when the text isn't one", () => {
      expect(onlyIssue(numbers, { params: { temperature: "hot" } })).toEqual([
        "invalid_type",
        ["params", "temperature"],
        "temperature needs a number, not text.",
      ]);
    });

    it("asks for a whole number", () => {
      expect(onlyIssue(s.object({ maxSteps: s.number().int() }), { maxSteps: 2.5 })).toEqual([
        "invalid_type",
        ["maxSteps"],
        "maxSteps needs a whole number, such as 3.",
      ]);
    });

    it("asks for true or false without quotes", () => {
      expect(onlyIssue(s.object({ local: s.boolean() }), { local: "true" })).toEqual([
        "invalid_type",
        ["local"],
        "local is true or false: write true without quotes.",
      ]);
    });

    it("puts one value in brackets where a list goes", () => {
      expect(onlyIssue(s.object({ gets: s.array(s.string()) }), { gets: "input.mail" })).toEqual([
        "invalid_type",
        ["gets"],
        "gets is a list: write [input.mail].",
      ]);
    });

    it("gives a general example for a value too long to repeat", () => {
      const long = "input.".padEnd(50, "x");
      expect(onlyIssue(s.object({ gets: s.array(s.string()) }), { gets: long })).toEqual([
        "invalid_type",
        ["gets"],
        'gets is a list: write [one, two], or each item on its own line after "- ".',
      ]);
    });

    it("asks for dashes where a map stands for a list", () => {
      const schema = s.object({ on: s.array(s.object({ to: s.string() })) });
      expect(onlyIssue(schema, { on: { to: "review" } })).toEqual([
        "invalid_type",
        ["on"],
        'on is a list: start each item with "- to:".',
      ]);
    });

    it("asks for quotes where text goes", () => {
      expect(onlyIssue(s.object({ version: s.string() }), { version: 1.5 })).toEqual([
        "invalid_type",
        ["version"],
        'version is text: write "1.5" in quotes.',
      ]);
    });

    it("asks for fields where a map goes", () => {
      expect(onlyIssue(s.object({ params: s.object({}) }), { params: "fast" })).toEqual([
        "invalid_type",
        ["params"],
        "params is a map: write its fields on the lines below it, indented.",
      ]);
    });
  });

  describe("a value out of range", () => {
    it("asks for one item in an empty list", () => {
      const schema = s.object({ output: s.object({ options: s.array(s.string()).min(1) }) });
      expect(onlyIssue(schema, { output: { options: [] } })).toEqual([
        "too_small",
        ["output", "options"],
        "options needs at least one item.",
      ]);
    });

    it("asks for a value in empty text", () => {
      expect(onlyIssue(s.object({ model: s.string().min(1) }), { model: "" })).toEqual([
        "too_small",
        ["model"],
        "model is empty: write a value.",
      ]);
    });

    it("gives the least number allowed", () => {
      expect(onlyIssue(s.object({ maxSteps: s.number().min(1) }), { maxSteps: 0 })).toEqual([
        "too_small",
        ["maxSteps"],
        "maxSteps is too small: use 1 or more.",
      ]);
    });

    it("says more than the least when the least isn't allowed", () => {
      const schema = s.object({ budget: s.object({ perRun: s.number().positive() }) });
      expect(onlyIssue(schema, { budget: { perRun: -1 } })).toEqual([
        "too_small",
        ["budget", "perRun"],
        "perRun must be more than 0.",
      ]);
    });

    it("gives the most allowed", () => {
      expect(onlyIssue(s.object({ temperature: s.number().max(2) }), { temperature: 3 })).toEqual([
        "too_big",
        ["temperature"],
        "temperature is too big: use 2 or less.",
      ]);
    });
  });

  describe("an address", () => {
    const schema = s.object({ http: s.object({ url: s.string().url() }) });

    it("adds https:// to an address without it", () => {
      expect(onlyIssue(schema, { http: { url: "tracker.example.com/mcp" } })).toEqual([
        "invalid_format",
        ["http", "url"],
        "url needs https://, such as https://tracker.example.com/mcp.",
      ]);
    });
  });

  describe("what keeps its message", () => {
    it("keeps a schema's own message", () => {
      const schema = s.object({ id: s.string().regex(/^[a-z]+$/, "own message") });
      expect(onlyIssue(schema, { id: "X" })).toEqual(["invalid_format", ["id"], "own message"]);
    });

    it("keeps Zod's message at the top of the input", () => {
      const [, , message] = onlyIssue(s.object({}), "text") ?? [];
      expect(message).toBe("Invalid input: expected object, received string");
    });

    it("names a list item by its list", () => {
      expect(onlyIssue(s.object({ gets: s.array(s.string()) }), { gets: [1] })).toEqual([
        "invalid_type",
        ["gets", 0],
        'gets[0] is text: write "1" in quotes.',
      ]);
    });
  });
});
