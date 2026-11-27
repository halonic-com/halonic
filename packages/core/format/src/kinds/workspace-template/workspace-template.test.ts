import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const acmeTemplate = join(import.meta.dirname, "../../../../../../examples/acme/template.yaml");

/** A template with every required field, and the lines given after them. */
function template(...more: string[]): string {
  return yaml(
    "id: someone/mail-helpers",
    "title: Mail helpers",
    "summary: Agents that sort your mail.",
    "kind: starter",
    ...more,
  );
}

verifies("format.workspace-template-file", () => {
  it("reads the Acme demo's template", () => {
    expect(parsedValue("workspaceTemplate", readFileSync(acmeTemplate, "utf8"))).toEqual({
      version: 1,
      id: "halonic/acme-demo",
      title: "Acme demo",
      summary: "An invented shop that answers its customers' email.",
      kind: "demo",
      tryFirst: [
        {
          workflow: "support-reply",
          input: "examples/refund-question.json",
          hint: "Run the Support reply workflow in Studio.",
        },
      ],
    });
  });

  it("fills in an empty tryFirst and the version", () => {
    expect(parsedValue("workspaceTemplate", template())).toMatchObject({
      version: 1,
      tryFirst: [],
    });
  });

  it("refuses an id that isn't a lower-case publisher/name", () => {
    for (const id of ["acme", "Halonic/Acme", "a/b/c", "/acme"]) {
      const text = template().replace("someone/mail-helpers", id);
      expect(summary(problemsOf("workspaceTemplate", text))[0]).toMatch(/^id /);
    }
  });

  it("refuses a hub kind and a field it doesn't know, such as flows", () => {
    const hub = template().replace("kind: starter", "kind: hub");
    expect(summary(problemsOf("workspaceTemplate", hub))).toEqual(["kind invalid_value 4"]);
    expect(problemsOf("workspaceTemplate", template("flows: []"))[0]?.code).toBe(
      "unrecognized_keys",
    );
  });

  it("refuses an input outside the workspace", () => {
    for (const input of ["/etc/passwd", "../secret.json", "C:/x.json", "a\\\\b.json", "a//b"]) {
      const text = template(
        "tryFirst:",
        "  - workflow: support-reply",
        `    input: "${input}"`,
        "    hint: Try it.",
      );
      expect(summary(problemsOf("workspaceTemplate", text))).toEqual(["tryFirst.0.input custom 7"]);
    }
  });

  it("refuses a hidden mark in a hint and a key in the summary", () => {
    const hidden = template("tryFirst:", "  - workflow: triage", "    hint: Paste\u200b here.");
    expect(summary(problemsOf("workspaceTemplate", hidden))).toEqual(["tryFirst.0.hint custom 7"]);
    const key = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;
    const leaky = template().replace("Agents that sort your mail.", `Use ${key}.`);
    expect(summary(problemsOf("workspaceTemplate", leaky))).toEqual([
      "summary value-looks-like-key 3",
    ]);
  });
});
