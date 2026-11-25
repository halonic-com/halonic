import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog, setVariable } from "./acme-catalog.fixture.ts";
import { checkBrowserAddress } from "./browser-address.ts";
import { renderManualGuide } from "./manual-guide.ts";
import { stepperRequestFormat } from "./stepper-request.ts";
import type { StepperCatalog, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const variablesPage = "https://github.com/acme/app/settings/variables/";
const markupCharacters = ["[", "]", "(", ")", "!", "<", ">", "`"];

function guideFor(catalog: StepperCatalog, ...blocks: unknown[]): string {
  const json = JSON.stringify({
    format: stepperRequestFormat,
    title: "Set up acme/app",
    reason: "The deploy needs it.",
    blocks,
  });
  const checked = validateStepperRequest(json, catalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, catalog);
}

const openLines = (guide: string) => guide.split("\n").filter((line) => / Open /.test(line));

verifies("action-steppers.stepper-request", () => {
  describe("checkBrowserAddress", () => {
    it.each(markupCharacters)("refuses an allowed page whose address holds %s", (character) => {
      const checked = checkBrowserAddress(
        `${variablesPage}x${character}y`,
        acmeCatalog.browserOrigins,
      );
      expect(checked).toEqual({
        ok: false,
        error:
          "the address holds one of [ ] ( ) ! < > or a backtick, which a web page address never needs",
      });
    });

    it.each(["%5B", "%5D", "%28", "%29", "%21", "%3C", "%3E", "%60"])(
      "refuses an allowed page whose path encodes %s",
      (encoded) => {
        const checked = checkBrowserAddress(
          `${variablesPage}x${encoded}y`,
          acmeCatalog.browserOrigins,
        );
        expect(checked.ok).toBe(false);
        if (!checked.ok) expect(checked.error).toContain("encodes one of");
      },
    );

    it("still takes an allowed page with none of them", () => {
      const checked = checkBrowserAddress(`${variablesPage}actions`, acmeCatalog.browserOrigins);
      expect(checked.ok).toBe(true);
    });
  });
});

/** A guided step type whose address takes free text, so a value can hold any character. */
const searchIssues: StepperDefinition<Record<string, string | number>> = {
  ...setVariable,
  id: "github.search-issues",
  parameters: strictParameters({ text: { kind: "text", pattern: /^.{1,60}$/ } }),
  steps: [
    {
      kind: "guided",
      address: "https://github.com/acme/app/issues/{text}",
      instructions: ["Read the list."],
      checkedOn: "2026-11-25",
    },
  ],
  targets: () => [{ service: "github", kind: "repository", name: "acme/app" }],
};

const searchCatalog: StepperCatalog = {
  ...acmeCatalog,
  stepType: (id, version) =>
    id === searchIssues.id && version === 1 ? searchIssues : acmeCatalog.stepType(id, version),
};

verifies("action-steppers.manual-guide", () => {
  describe("renderManualGuide's Open lines", () => {
    it("never prints [ ] ( ) ! < > ' * or a backtick from a parameter raw", () => {
      const text = "x](evil)![a]<b>'*`";
      const guide = guideFor(searchCatalog, {
        kind: "step",
        ref: "github.search-issues@1",
        parameters: { text },
      });
      const [open] = openLines(guide);
      expect(open).toBe(
        "1. Open https://github.com/acme/app/issues/x%5D%28evil%29%21%5Ba%5D%3Cb%3E%27%2A%60",
      );
    });

    it("prints a browser block's address, which the check let through, with none of them", () => {
      const guide = guideFor(acmeCatalog, {
        kind: "browser",
        url: `${variablesPage}actions`,
        instructions: ["Click New variable."],
      });
      for (const line of openLines(guide)) {
        for (const character of markupCharacters) expect(line).not.toContain(character);
      }
    });
  });
});
