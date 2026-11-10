import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ItemPath, revertParts } from "./revert-parts.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

function reverted(current: string, reference: string, ...parts: ItemPath[]): string {
  return unwrap(revertParts(current, reference, parts));
}

const lastVersion = lines(
  "id: support-triage",
  "name: Support triage",
  "states:",
  "  intake:",
  "    agent: reader",
  "  classify:",
  "    agent: sorter",
  "  notify:",
  "    agent: writer",
);

verifies("app.revert-parts", () => {
  it("removes a step the reference doesn't have and leaves every other line, comments included", () => {
    const current = lines(
      "id: support-triage",
      "name: Support triage (new) # shown in the list",
      "states:",
      "  intake:",
      "    agent: reader",
      "  # pages whoever is on call",
      "  page-oncall:",
      "    agent: pager",
      "  classify:",
      "    agent: sorter",
      "  notify:",
      "    agent: writer",
    );
    expect(reverted(current, lastVersion, ["states", "page-oncall"])).toBe(
      lines(
        "id: support-triage",
        "name: Support triage (new) # shown in the list",
        "states:",
        "  intake:",
        "    agent: reader",
        "  # pages whoever is on call",
        "  classify:",
        "    agent: sorter",
        "  notify:",
        "    agent: writer",
      ),
    );
  });

  it("puts a removed step back right after the step it followed in the reference", () => {
    const current = lines(
      "id: support-triage",
      "name: Support triage (new) # renamed later",
      "states:",
      "  intake:",
      "    agent: reader",
      "  notify:",
      "    agent: writer",
    );
    expect(reverted(current, lastVersion, ["states", "classify"])).toBe(
      lines(
        "id: support-triage",
        "name: Support triage (new) # renamed later",
        "states:",
        "  intake:",
        "    agent: reader",
        "  classify:",
        "    agent: sorter",
        "  notify:",
        "    agent: writer",
      ),
    );
  });

  it("puts it first when nothing before it is left", () => {
    const current = lines(
      "id: support-triage",
      "name: Support triage # x",
      "states:",
      "  notify:",
      "    agent: writer",
    );
    const result = reverted(current, lastVersion, ["states", "intake"]);
    expect(result).toBe(
      lines(
        "id: support-triage",
        "name: Support triage # x",
        "states:",
        "  intake:",
        "    agent: reader",
        "  notify:",
        "    agent: writer",
      ),
    );
  });

  it("changes only the line of a field that differs", () => {
    const current = lines(
      "name: Classifier # the sorter",
      "model: large",
      "instructions: Sort the mail.",
    );
    const reference = lines("name: Classifier", "model: small", "instructions: Sort it.");
    expect(reverted(current, reference, ["model"])).toBe(
      lines("name: Classifier # the sorter", "model: small", "instructions: Sort the mail."),
    );
  });

  it("changes nothing when the part is already as in the reference", () => {
    const current = lines("name: Classifier # the sorter", "model: small");
    expect(reverted(current, lines("name: Other", "model: small"), ["model"], ["missing"])).toBe(
      current,
    );
  });

  it("gives the reference's text when the result reads the same", () => {
    const current = lines("name: Classifier", "model:   large   # spaced", "tools: [a, b]");
    const reference = lines("name: Classifier", "model: small", "tools: [a, b]");
    expect(reverted(current, reference, ["model"])).toBe(reference);
  });

  it("drops a comment added since the reference when the result reads the same", () => {
    const current = lines("# picks the model", "name: Classifier", "model: large");
    const reference = lines("name: Classifier", "model: small");
    expect(reverted(current, reference, ["model"])).toBe(reference);
  });

  it("says which text it couldn't read", () => {
    expect(revertParts("a: [", "a: 1\n", [["a"]])).toMatchObject({
      ok: false,
      error: { which: "current" },
    });
    expect(revertParts("a: 1\n", "a: [", [["a"]])).toMatchObject({
      ok: false,
      error: { which: "reference" },
    });
  });
});

verifies("app.revert-parts-three-references", () => {
  const baseline = lines("name: Daily summary", "schedule: Weekdays 08:00", "enabled: true");
  const file = lines("name: Daily summary", "schedule: Weekdays 07:00", "enabled: false");

  it("rejects a change by reverting the file to the baseline", () => {
    expect(reverted(file, baseline, ["schedule"])).toBe(
      lines("name: Daily summary", "schedule: Weekdays 08:00", "enabled: false"),
    );
  });

  it("accepts a change by reverting the baseline to the file", () => {
    expect(reverted(baseline, file, ["schedule"])).toBe(
      lines("name: Daily summary", "schedule: Weekdays 07:00", "enabled: true"),
    );
  });

  it("undoes one change against the latest version and keeps the others", () => {
    const latest = lines("name: Daily summary", "# when it runs", "schedule: Weekdays 08:00");
    const working = lines(
      "name: Daily summary",
      "# when it runs",
      "schedule: Weekdays 07:00",
      "notify: me",
    );
    expect(reverted(working, latest, ["notify"])).toBe(
      lines("name: Daily summary", "# when it runs", "schedule: Weekdays 07:00"),
    );
    expect(reverted(working, latest, ["schedule"], ["notify"])).toBe(latest);
  });

  it("gives the reference's text once every changed part is reverted", () => {
    expect(reverted(file, baseline, ["schedule"], ["enabled"])).toBe(baseline);
  });
});
