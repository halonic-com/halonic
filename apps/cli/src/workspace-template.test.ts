import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type Phrase, plainText } from "./messages/phrase.ts";
import { firstThingToTry } from "./workspace-template.ts";

const demo = [
  "id: halonic/acme-demo",
  "title: Acme demo",
  "summary: An invented shop.",
  "kind: demo",
  "tryFirst:",
  "  - workflow: support-reply",
  "    input: examples/refund-question.json",
  "    hint: Run the Support reply workflow in Studio.",
  "",
].join("\n");

verifies("cli.commands.init.copy-example", () => {
  it("takes the first thing to try from the template", async () => {
    const warnings: Phrase[] = [];
    const store = new MemoryDefinitionStore({ "template.yaml": demo });
    expect(await firstThingToTry(store, (line) => warnings.push(line))).toEqual({
      workflow: "support-reply",
      input: "examples/refund-question.json",
      hint: "Run the Support reply workflow in Studio.",
    });
    expect(warnings).toEqual([]);
  });

  it("gives none for a workspace without a template, with no warning", async () => {
    const warnings: Phrase[] = [];
    expect(
      await firstThingToTry(new MemoryDefinitionStore({}), (line) => warnings.push(line)),
    ).toBe(undefined);
    expect(warnings).toEqual([]);
  });

  it("gives none for a template it can't read, after one ! line", async () => {
    const warnings: Phrase[] = [];
    const store = new MemoryDefinitionStore({ "template.yaml": "version: 2\n" });
    expect(await firstThingToTry(store, (line) => warnings.push(line))).toBe(undefined);
    expect(warnings.map(plainText)).toEqual([
      "! Skipped template.yaml: line 1: version must be 1.",
    ]);
  });
});
