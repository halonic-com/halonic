import { type Agent, parseFile } from "@halonicjs/format";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { describeAgentChange } from "./describe-agent.ts";
import { revertParts } from "./revert-parts.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

function agent(text: string): Agent {
  const parsed = parseFile("agent", text, { id: "finance" });
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return parsed.value.value;
}

const lastVersion = lines(
  "id: finance",
  "name: Finance",
  "model: claude",
  "instructions: Read invoices. Answer in English. Be brief.",
  "connectors: [slack, notion]",
  "methods:",
  "  extract-invoice:",
  "    instructions: Find the vendor.",
  "  summarise:",
  "    instructions: Summarise the month.",
);

const changed = lines(
  "id: finance",
  "name: Finance team",
  "model: gpt",
  "instructions: Read invoices. Answer in Dutch. Be brief.",
  "connectors: [notion, gmail]",
  "maxSteps: 10",
  "methods:",
  "  extract-invoice:",
  "    instructions: Find the vendor and the total.",
  "    tools: [ocr]",
  "  pay:",
  "    instructions: Pay the invoice.",
);

function described(before: string, after: string) {
  return describeAgentChange(agent(before), agent(after));
}

verifies("app.change-line-parts", () => {
  it("gives each changed field one line that covers its key", () => {
    expect(described(lastVersion, changed)).toEqual([
      { id: "field:name", sentence: "Name: Finance → Finance team", parts: [["name"]] },
      {
        id: "field:instructions",
        sentence: "Instructions edited: 1 sentence changed",
        important: true,
        parts: [["instructions"]],
      },
      { id: "field:model", sentence: "Model: claude → gpt", parts: [["model"]] },
      {
        id: "field:connectors",
        sentence: "Connections: added gmail, removed slack",
        important: true,
        parts: [["connectors"]],
      },
      { id: "field:maxSteps", sentence: "Most model calls: 6 → 10", parts: [["maxSteps"]] },
      {
        id: "method:extract-invoice",
        sentence: "Method changed: Extract invoice (instructions, tools)",
        important: true,
        parts: [["methods", "extract-invoice"]],
      },
      {
        id: "method:summarise",
        sentence: "Method removed: Summarise",
        important: true,
        parts: [["methods", "summarise"]],
      },
      {
        id: "method:pay",
        sentence: "Method added: Pay",
        important: true,
        parts: [["methods", "pay"]],
      },
    ]);
  });

  it("takes out exactly one line when that line's parts are reverted", () => {
    const all = described(lastVersion, changed);
    for (const line of all) {
      const undone = unwrap(revertParts(changed, lastVersion, line.parts));
      const left = described(lastVersion, undone).map((other) => other.id);
      expect(left).toEqual(all.filter((other) => other.id !== line.id).map((other) => other.id));
    }
  });

  it("gives a new or deleted agent one line with no parts", () => {
    expect(describeAgentChange(undefined, agent(lastVersion))).toEqual([
      { id: "item", sentence: "New", parts: [] },
    ]);
    expect(describeAgentChange(agent(lastVersion), undefined)).toEqual([
      { id: "item", sentence: "Deleted", parts: [] },
    ]);
  });
});

verifies("app.change-line-important", () => {
  it("marks the sandbox important, as before → after with the default named", () => {
    const sandboxed = lastVersion.replace(
      "model: claude\n",
      "model: claude\nharness: claude-code\nworkingFolder: files/finance\n",
    );
    expect(described(lastVersion, sandboxed)).toEqual([
      {
        id: "field:harness",
        sentence: "Runs in: halonic → claude-code",
        important: true,
        parts: [["harness"]],
      },
      {
        id: "field:workingFolder",
        sentence: "Working folder: files/agents/finance → files/finance",
        important: true,
        parts: [["workingFolder"]],
      },
    ]);
  });

  it("marks run history access important", () => {
    const withRunLogs = `${lastVersion}runLogs: true\n`;
    expect(described(lastVersion, withRunLogs)).toEqual([
      {
        id: "field:runLogs",
        sentence: "Run history access: off → on",
        important: true,
        parts: [["runLogs"]],
      },
    ]);
  });

  it("doesn't mark a method important when only its description changed", () => {
    const result = described(
      lastVersion,
      lastVersion.replace(
        "    instructions: Summarise the month.",
        "    description: Monthly report\n    instructions: Summarise the month.",
      ),
    );
    expect(result).toEqual([
      {
        id: "method:summarise",
        sentence: "Method changed: Summarise (description)",
        parts: [["methods", "summarise"]],
      },
    ]);
  });
});

describe("describeAgentChange", () => {
  it("says instructions were added or removed rather than counting sentences", () => {
    const without = lastVersion.replace(/instructions: Read.*\n/, "");
    expect(described(without, lastVersion)[0]?.sentence).toBe("Instructions added");
    expect(described(lastVersion, without)[0]?.sentence).toBe("Instructions removed");
  });

  it("names the workspace's default model when the model is left out", () => {
    const withoutModel = lastVersion.replace("model: claude\n", "");
    expect(described(withoutModel, lastVersion)[0]?.sentence).toBe(
      "Model: the workspace's default → claude",
    );
  });

  it("gives no line when a list goes from left out to empty", () => {
    const noSites = `${lastVersion}allowedSites: []\n`;
    expect(described(lastVersion, noSites)).toEqual([]);
    expect(described(noSites, lastVersion)).toEqual([]);
  });

  it("still says a list's order changed", () => {
    const reordered = lastVersion.replace(
      "connectors: [slack, notion]",
      "connectors: [notion, slack]",
    );
    expect(described(lastVersion, reordered)[0]?.sentence).toBe("Connections: order changed");
  });

  it("names each side's own default working folder", () => {
    const renamed = describeAgentChange(agent(lastVersion), {
      ...agent(lastVersion),
      id: "billing",
    });
    expect(renamed).toContainEqual({
      id: "field:id",
      sentence: "Id: finance → billing",
      parts: [["id"]],
    });
    const moved = describeAgentChange(
      { ...agent(lastVersion), id: "billing" },
      { ...agent(lastVersion), workingFolder: "files/finance" },
    );
    expect(moved).toContainEqual({
      id: "field:workingFolder",
      sentence: "Working folder: files/agents/billing → files/finance",
      important: true,
      parts: [["workingFolder"]],
    });
  });

  it("gives no lines when nothing changed", () => {
    expect(described(lastVersion, lastVersion)).toEqual([]);
  });
});
