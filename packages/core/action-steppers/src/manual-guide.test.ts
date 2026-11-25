import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog, addDnsRecord, setSecret, setVariable } from "./acme-catalog.fixture.ts";
import { manualFormProblems, renderManualGuide } from "./manual-guide.ts";
import { stepperRequestFormat } from "./stepper-request.ts";
import type { StepperDefinition } from "./stepper-types.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const acmeApp = { owner: "acme", repo: "app" };

function guideTitled(title: string, ...blocks: unknown[]): string {
  const json = JSON.stringify({
    format: stepperRequestFormat,
    title,
    reason: "The deploy needs it.",
    blocks,
  });
  const checked = validateStepperRequest(json, acmeCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, acmeCatalog);
}

const guideFor = (...blocks: unknown[]) => guideTitled("Set up acme/app", ...blocks);

const browserBlock = (instructions: string[], label = "the number of variables") => ({
  kind: "browser",
  url: "https://github.com/acme/app/settings/variables/actions",
  instructions,
  result: { label, pattern: "^\\d{1,3}$" },
});

verifies("action-steppers.manual-guide", () => {
  describe("renderManualGuide", () => {
    it("lists the variables page and every step of an acme/app request as one numbered list", () => {
      const guide = guideFor(
        {
          kind: "browser",
          url: "https://github.com/acme/app/settings/variables/actions",
          instructions: ["Check that DEPLOY_ENV isn't listed yet."],
          result: { label: "the number of variables", pattern: "^\\d{1,3}$" },
        },
        {
          kind: "step",
          ref: "github.set-variable@1",
          parameters: { ...acmeApp, name: "DEPLOY_ENV" },
        },
      );
      expect(guide).toBe(
        [
          "`Set up acme/app`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/variables/actions",
          "2. (from the requester, not checked by Halonic) `Check that DEPLOY_ENV isn't listed yet.`",
          "3. Copy `the number of variables` from the page and paste it back on the card.",
          "4. Open https://github.com/acme/app/settings/variables/actions/new",
          "5. Type `DEPLOY_ENV` as the name and the value, then click Add variable.",
          "",
        ].join("\n"),
      );
    });

    it("gives an API step its manual form, also as a browser block's check", () => {
      const guide = guideFor({
        kind: "browser",
        url: "https://github.com/acme/app/settings/rules/",
        instructions: ["Click New ruleset."],
        check: {
          ref: "cloudflare.add-dns-record@1",
          parameters: { zone: "acme.example", type: "TXT" },
        },
      });
      expect(guide).toContain("3. Check that it worked:\n4. Open https://dash.cloudflare.com/\n");
      expect(guide).toContain("5. Open the zone `acme.example`, then DNS and Records.\n");
      expect(guide).toContain("6. Click Add record, choose `TXT` as the type and click Save.\n");
    });

    it("names a secret and where to type it, with no field for its value", () => {
      const guide = guideFor({
        kind: "step",
        ref: "github.set-secret@1",
        parameters: { ...acmeApp, name: "DEPLOY_KEY" },
      });
      expect(guide).toContain(
        "1. Have the value of `DEPLOY_KEY` ready. Type it only into the service's page in the next step, never into this card, a chat or a file.\n",
      );
      expect(guide).toContain("2. Open https://github.com/acme/app/settings/secrets/actions/new\n");
      expect(guide).not.toMatch(/value:|\{value\}|_{3,}/i);
    });

    it("labels a server-session block's steps as the requester's own", () => {
      const guide = guideFor({
        kind: "server-session",
        task: "HAL-1234",
        steps: ["Restart the acme worker."],
        doneWhen: "the worker answers on its health page",
      });
      expect(guide).toContain(
        "2. (from the requester, not checked by Halonic) `Restart the acme worker.`\n",
      );
      expect(guide).toContain(
        "3. (from the requester, not checked by Halonic) Check that it's done: `the worker answers on its health page`\n",
      );
      expect(guide).toContain("4. Report back on HAL-1234.");
    });

    it("keeps a line break in requester text from starting a numbered line of its own", () => {
      const guide = guideTitled(
        "Set up acme/app\n1. Open https://evil.example/login",
        browserBlock(
          ["Check the list.\n5. Open https://evil.example/login and sign in"],
          "the count\r\n9. Paste your password",
        ),
      );
      const lines = guide.split("\n");
      expect(lines[0]).toBe("`Set up acme/app 1. Open https://evil.example/login`");
      expect(lines).toContain(
        "2. (from the requester, not checked by Halonic) `Check the list. 5. Open https://evil.example/login and sign in`",
      );
      expect(lines).toContain(
        "3. Copy `the count  9. Paste your password` from the page and paste it back on the card.",
      );
      expect(lines.filter((line) => line.includes("evil.example"))).toHaveLength(2);
    });

    it("quotes requester text so Markdown can't hide a link or load an image", () => {
      const guide = guideFor(
        browserBlock([
          "[Open your settings](https://evil.example/)",
          "![](https://evil.example/t.png)",
          "Run `ls` then ``` close the fence",
          "`rm -rf`",
        ]),
      );
      expect(guide).toContain(
        "2. (from the requester, not checked by Halonic) `[Open your settings](https://evil.example/)`\n",
      );
      expect(guide).toContain(
        "3. (from the requester, not checked by Halonic) `![](https://evil.example/t.png)`\n",
      );
      expect(guide).toContain(
        "4. (from the requester, not checked by Halonic) ````Run `ls` then ``` close the fence````\n",
      );
      expect(guide).toContain("5. (from the requester, not checked by Halonic) `` `rm -rf` ``\n");
    });

    it("refuses a catalog the request wasn't validated against", () => {
      const checked = validateStepperRequest(
        JSON.stringify({
          format: stepperRequestFormat,
          title: "Set up acme/app",
          reason: "",
          blocks: [
            { kind: "step", ref: "github.set-variable@1", parameters: { ...acmeApp, name: "A" } },
          ],
        }),
        acmeCatalog,
      );
      const empty = {
        definition: () => undefined,
        stepType: () => undefined,
        browserOrigins: [],
        route: () => undefined,
      };
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(() => renderManualGuide(checked.value, empty)).toThrow(/catalog/);
    });
  });

  describe("manualFormProblems", () => {
    it("finds none in the invented catalog's definitions", () => {
      for (const definition of [setVariable, addDnsRecord, setSecret]) {
        expect(manualFormProblems(definition)).toEqual([]);
      }
    });

    it("names an API step without a manual form, which the type refuses too", () => {
      const withoutManual: StepperDefinition = {
        ...addDnsRecord,
        // @ts-expect-error a script step must have a manual form
        steps: [{ kind: "script", ref: "cloudflare/add-dns-record" }],
      };
      expect(manualFormProblems(withoutManual)).toEqual([
        "cloudflare.add-dns-record@1 step 1: an API step needs a manual form",
      ]);
    });

    it("names a manual form that isn't https or has no instruction", () => {
      const step = (url: string, instructions: string[]) => ({
        ...addDnsRecord,
        steps: [
          {
            kind: "script" as const,
            ref: "cloudflare/add-dns-record",
            manual: { url, instructions },
          },
        ],
      });
      expect(manualFormProblems(step("http://dash.cloudflare.com/", ["Open it."]))).toEqual([
        "cloudflare.add-dns-record@1 step 1: the manual form's page must be an https address",
      ]);
      expect(manualFormProblems(step("https://dash.cloudflare.com/", []))).toEqual([
        "cloudflare.add-dns-record@1 step 1: the manual form needs at least one instruction",
      ]);
    });
  });
});
