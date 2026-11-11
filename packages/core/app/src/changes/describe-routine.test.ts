import { parseFile, type Routine } from "@halonicjs/format";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { describeRoutineChange } from "./describe-routine.ts";
import { revertParts } from "./revert-parts.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

function routine(text: string): Routine {
  const parsed = parseFile("routine", text, { id: "morning-report" });
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return parsed.value.value;
}

const lastVersion = lines(
  "id: morning-report",
  "name: Morning report",
  "trigger: { schedule: 0 8 * * 1-5 }",
  "run: { agent: finance, prompt: Write the morning report. }",
);

const changed = lines(
  "id: morning-report",
  "name: Morning report",
  "enabled: false",
  "trigger: { schedule: 0 7 * * 1-5 }",
  "run: { agent: finance, prompt: Write the morning report in Dutch. }",
  "overlap: queue",
);

function described(before: string, after: string) {
  return describeRoutineChange(routine(before), routine(after));
}

verifies("app.change-line-parts", () => {
  it("gives each changed field one line that covers its key", () => {
    expect(described(lastVersion, changed)).toEqual([
      { id: "field:enabled", sentence: "Turned off", parts: [["enabled"]] },
      {
        id: "field:trigger",
        sentence: "Schedule: Weekdays at 08:00 → Weekdays at 07:00",
        parts: [["trigger"]],
      },
      { id: "field:run", sentence: "Prompt edited", important: true, parts: [["run"]] },
      {
        id: "field:overlap",
        sentence: "When the last run is still going: skip → wait",
        parts: [["overlap"]],
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

  it("gives a new or deleted routine one line with no parts", () => {
    expect(describeRoutineChange(undefined, routine(lastVersion))).toEqual([
      { id: "item", sentence: "New", parts: [] },
    ]);
  });
});

verifies("app.change-line-important", () => {
  it("marks what the routine runs important", () => {
    const toWorkflow = lastVersion.replace(
      "run: { agent: finance, prompt: Write the morning report. }",
      "run: { workflow: report }",
    );
    expect(described(lastVersion, toWorkflow)).toEqual([
      {
        id: "field:run",
        sentence: "Runs: agent finance → workflow report",
        important: true,
        parts: [["run"]],
      },
    ]);
  });
});

describe("describeRoutineChange", () => {
  it("describes a trigger that changed kind in words", () => {
    const daily = lastVersion.replace(
      "trigger: { schedule: 0 8 * * 1-5 }",
      "trigger: { every: 1d }",
    );
    expect(described(lastVersion, daily)[0]?.sentence).toBe(
      "Schedule: Weekdays at 08:00 → Every day (UTC)",
    );
  });

  it("says when the hub and the prompt change together", () => {
    const run = "run: { agent: finance, prompt: Write the morning report. }";
    const otherHub = lastVersion.replace(
      run,
      "run: { hub: sales, agent: finance, prompt: Write the morning report. }",
    );
    const both = lastVersion.replace(
      run,
      "run: { hub: sales, agent: finance, prompt: Write it in Dutch. }",
    );
    expect(described(lastVersion, otherHub)[0]?.sentence).toBe("Hub: this hub → sales");
    expect(described(lastVersion, both)[0]?.sentence).toBe("Hub: this hub → sales, prompt edited");
  });

  it("gives no lines when nothing changed", () => {
    expect(described(lastVersion, lastVersion)).toEqual([]);
  });
});
