import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, yaml } from "../../test/parse.spec.ts";

const routine = (trigger: string) =>
  yaml("id: orders", "name: Orders", trigger, "run: { workflow: invoice }");

verifies("format.routine-webhook", () => {
  it("accepts a webhook and gives it no headers by default", () => {
    const trigger = parsedValue(
      "routine",
      routine("trigger: { webhook: { secret: acme-hook } }"),
    ).trigger;
    expect(trigger).toEqual({ webhook: { secret: "acme-hook", headers: [] } });
  });

  it("keeps the headers the run may read", () => {
    const text = routine("trigger: { webhook: { secret: acme-hook, headers: [x-event] } }");
    expect(parsedValue("routine", text).trigger).toEqual({
      webhook: { secret: "acme-hook", headers: ["x-event"] },
    });
  });

  it("refuses a secret that is not a valid name, at the secret", () => {
    const problems = problemsOf(
      "routine",
      routine("trigger: { webhook: { secret: 'acme hook!' } }"),
    );
    expect(problems.map((problem) => problem.path.join("."))).toContain("trigger.webhook.secret");
  });

  it("refuses a key pasted where the secret's name belongs, without repeating it", () => {
    const key = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;
    const problems = problemsOf("routine", routine(`trigger: { webhook: { secret: ${key} } }`));
    expect(JSON.stringify(problems)).not.toContain(key);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("refuses a webhook with no secret", () => {
    expect(problemsOf("routine", routine("trigger: { webhook: {} }")).length).toBeGreaterThan(0);
  });

  it("refuses a path: the host gives each routine its address", () => {
    const text = routine("trigger: { webhook: { secret: acme-hook, path: /x } }");
    expect(problemsOf("routine", text).length).toBeGreaterThan(0);
  });
});
