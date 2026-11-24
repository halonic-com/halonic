import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeAgentHeader, acmeRisks, acmeUserHeader, changed } from "./acme-header.fixture.ts";
import { checkHeader, type HeaderCheck } from "./check-header.ts";

function check(header: unknown, hasRun = true): HeaderCheck {
  return checkHeader(header, { riskOf: (reference) => acmeRisks[reference], hasRun });
}

function reasonsOf(header: unknown, hasRun = true): string {
  const checked = check(header, hasRun);
  return checked.ok ? "" : checked.reasons.join("\n");
}

describe("checkHeader", () => {
  verifies("toolscript.header-strict", () => {
    it("takes the invented user and agent headers", () => {
      expect(check(acmeUserHeader).ok).toBe(true);
      expect(check(acmeAgentHeader).ok).toBe(true);
    });

    it("refuses an unknown key at the top and inside an input", () => {
      expect(reasonsOf(changed(acmeUserHeader, { runtime: "node" }))).toContain("runtime");
      const inputs = {
        ...acmeUserHeader.inputs,
        name: { ...acmeUserHeader.inputs.name, extra: 1 },
      };
      expect(reasonsOf(changed(acmeUserHeader, { inputs }))).toContain("extra");
    });

    it("refuses a string input without a pattern", () => {
      const inputs = { name: { type: "string", description: "A name." } };
      expect(
        check(changed(acmeUserHeader, { inputs, touches: undefined, guide: undefined })).ok,
      ).toBe(false);
    });

    it("refuses a pattern that isn't anchored", () => {
      const inputs = { name: { type: "string", pattern: "[A-Z]+", description: "A name." } };
      expect(reasonsOf(changed(acmeUserHeader, { inputs }))).toContain("^");
    });
  });

  verifies("toolscript.header-risk", () => {
    it("refuses a risk lower than a used capability's", () => {
      const header = changed(acmeUserHeader, { risk: "routine" });
      expect(reasonsOf(header)).toContain("risk: routine is lower than admin");
    });

    it("refuses a routine header that uses an irreversible capability", () => {
      const header = changed(acmeAgentHeader, { uses: ["acme.delete-zone@1"] });
      expect(reasonsOf(header)).toContain("risk");
    });

    it("takes a higher risk than needed and reports the required one", () => {
      const checked = check(changed(acmeAgentHeader, { risk: "admin" }));
      expect(checked).toMatchObject({ ok: true, requiredRisk: "routine" });
    });

    it("refuses a capability the registry doesn't list", () => {
      const header = changed(acmeAgentHeader, { uses: ["acme.unknown@1"] });
      expect(reasonsOf(header)).toContain("acme.unknown@1 is not in the capability registry");
    });

    it("counts a browser block as admin", () => {
      const steps = [
        {
          kind: "browser",
          url: "https://github.com/acme/app/settings",
          instructions: ["Open the page."],
        },
      ];
      const routine = changed(acmeAgentHeader, {
        audience: "user",
        tool: undefined,
        uses: [],
        steps,
      });
      expect(reasonsOf(routine, false)).toContain("risk: routine is lower than admin");
      expect(check({ ...routine, risk: "admin" }, false).ok).toBe(true);
    });
  });

  verifies("toolscript.header-audience", () => {
    it("refuses a secret input for an agent", () => {
      const inputs = { ...acmeAgentHeader.inputs, key: { ...acmeUserHeader.inputs.token } };
      expect(reasonsOf(changed(acmeAgentHeader, { inputs }))).toContain("inputs.key.secret");
    });

    it("takes a secret input for a user", () => {
      expect(check(acmeUserHeader).ok).toBe(true);
    });

    it("refuses an agent without a tool, and a user with one", () => {
      expect(reasonsOf(changed(acmeAgentHeader, { tool: undefined }))).toContain("tool");
      expect(reasonsOf(changed(acmeUserHeader, { tool: acmeAgentHeader.tool }))).toContain("tool");
    });

    it("refuses touches for an agent and a call limit above 50", () => {
      const touches = { "acme.comment@1": { task: "{input.task}" } };
      expect(reasonsOf(changed(acmeAgentHeader, { touches }))).toContain("touches");
      expect(reasonsOf(changed(acmeAgentHeader, { limits: { calls: 51 } }))).toContain(
        "limits.calls",
      );
      expect(check(changed(acmeUserHeader, { limits: { calls: 100 } })).ok).toBe(true);
    });
  });

  verifies("toolscript.header-steps", () => {
    const steps = [
      { kind: "step", ref: "acme.set-variable@1", parameters: { name: "{input.name}" } },
    ];
    const declarative = changed(acmeUserHeader, { steps, touches: undefined, uses: [] });

    it("takes steps without a run function", () => {
      expect(check(declarative, false).ok).toBe(true);
    });

    it("refuses steps together with a run function", () => {
      expect(reasonsOf(declarative, true)).toContain("steps and run can't be used together");
    });

    it("refuses a header with neither steps nor run", () => {
      expect(reasonsOf(acmeUserHeader, false)).toContain("either steps or a run function");
    });

    it("refuses a block the stepper request format doesn't know", () => {
      const bad = changed(declarative, { steps: [{ kind: "delete", ref: "acme.set-variable@1" }] });
      expect(reasonsOf(bad, false)).toContain("steps");
    });

    it("refuses a step placeholder that names no input", () => {
      const bad = changed(declarative, {
        steps: [{ kind: "step", ref: "acme.set-variable@1", parameters: { name: "{input.nope}" } }],
      });
      expect(reasonsOf(bad, false)).toContain("{input.nope} names no input");
    });
  });

  verifies("toolscript.header-ui", () => {
    const form = { component: "form", fields: [{ input: "name", label: "Name" }] };
    const card = { component: "card", title: "Change", body: "Sets {input.name}." };
    const ui = {
      form,
      preview: [card],
      confirm: { buttons: { component: "buttons", confirm: "Sync" } },
    };

    it("takes card, table, form and buttons in their places", () => {
      const table = { component: "table", columns: ["Repo"], rows: [["acme/app"]] };
      expect(check(changed(acmeUserHeader, { ui: { ...ui, result: [table] } })).ok).toBe(true);
    });

    it("refuses a component outside the four", () => {
      const bad = { ...ui, preview: [{ component: "image", src: "x" }] };
      expect(check(changed(acmeUserHeader, { ui: bad })).ok).toBe(false);
    });

    it("refuses a form where a card belongs", () => {
      expect(check(changed(acmeUserHeader, { ui: { ...ui, preview: [form] } })).ok).toBe(false);
    });

    it("refuses a button that carries an address", () => {
      const buttons = { component: "buttons", confirm: "Sync", url: "https://evil.example" };
      expect(check(changed(acmeUserHeader, { ui: { confirm: { buttons } } })).ok).toBe(false);
    });

    it("refuses a form field that names no input", () => {
      const bad = { form: { component: "form", fields: [{ input: "other" }] } };
      expect(reasonsOf(changed(acmeUserHeader, { ui: bad }))).toContain("other is not an input");
    });
  });

  verifies("toolscript.header-touches", () => {
    const withTouches = (touches: unknown) => changed(acmeUserHeader, { touches });
    const uses = "acme.set-variable@1";

    it("refuses a template that names no input", () => {
      const reasons = reasonsOf(withTouches({ [uses]: { repo: "{input.missing}" } }));
      expect(reasons).toContain("{input.missing} names no input");
    });

    it("refuses a secret input in a template", () => {
      expect(reasonsOf(withTouches({ [uses]: { repo: "{input.token}" } }))).toContain("secret");
    });

    it("refuses a list without [] and [] on a non-list", () => {
      expect(reasonsOf(withTouches({ [uses]: { repo: "{input.repos}" } }))).toContain(
        "{input.repos[]}",
      );
      expect(reasonsOf(withTouches({ [uses]: { repo: "{input.name[]}" } }))).toContain(
        "needs a list input",
      );
    });

    it("refuses braces that aren't a placeholder, and a capability not in uses", () => {
      expect(reasonsOf(withTouches({ [uses]: { repo: "{repo}" } }))).toContain("only {input.name}");
      expect(reasonsOf(withTouches({ "acme.comment@1": { task: "x" } }))).toContain("not in uses");
    });

    it("refuses an example or a guide entry that names something the header doesn't have", () => {
      const examples = [
        {
          name: "one",
          input: { other: 1 },
          calls: [{ capability: "acme.comment@1", arguments: {} }],
        },
      ];
      const reasons = reasonsOf(
        changed(acmeUserHeader, {
          examples,
          guide: { perStep: { "acme.comment@1": "x", "3": "y" } },
        }),
      );
      expect(reasons).toContain("other is not an input");
      expect(reasons).toContain("acme.comment@1 is not in uses");
      expect(reasons).toContain("3 is neither in uses nor a step index");
    });

    it("takes literal text around a placeholder", () => {
      expect(check(withTouches({ [uses]: { repo: "acme/{input.name}" } })).ok).toBe(true);
    });
  });
});
