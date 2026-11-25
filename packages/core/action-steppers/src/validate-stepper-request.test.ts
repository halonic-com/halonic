import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog } from "./acme-catalog.fixture.ts";
import { stepperBlockSchema, stepperRequestFormat } from "./stepper-request.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const variablesPage = "https://github.com/acme/app/settings/variables/actions";
const setVariable = {
  kind: "step",
  ref: "github.set-variable@1",
  parameters: { owner: "acme", repo: "app", name: "DEPLOY_ENV" },
};
const addDns = {
  kind: "step",
  ref: "cloudflare.add-dns-record@1",
  parameters: { zone: "acme.example", type: "TXT" },
};
const browser = (url: string) => ({ kind: "browser", url, instructions: ["Click New variable."] });

function request(...blocks: unknown[]): string {
  return JSON.stringify({
    format: stepperRequestFormat,
    title: "Set up acme/app",
    reason: "The deploy needs it.",
    blocks,
  });
}

function reasons(json: string): string[] {
  const checked = validateStepperRequest(json, acmeCatalog);
  return checked.ok ? [] : checked.error;
}

verifies("action-steppers.stepper-request", () => {
  describe("validateStepperRequest", () => {
    it("names both targets of a variable and a DNS request, with the highest risk", () => {
      const checked = validateStepperRequest(request(setVariable, addDns), acmeCatalog);
      expect(checked.ok && checked.value.touches).toEqual([
        {
          block: 1,
          risk: "routine",
          targets: [{ service: "github", kind: "repository", name: "acme/app" }],
        },
        {
          block: 2,
          risk: "admin",
          targets: [{ service: "cloudflare", kind: "zone", name: "acme.example" }],
        },
      ]);
      expect(checked.ok && checked.value.risk).toBe("admin");
    });

    it("gives a request with one browser block the risk admin", () => {
      const checked = validateStepperRequest(request(browser(variablesPage)), acmeCatalog);
      expect(checked.ok && checked.value.risk).toBe("admin");
      expect(checked.ok && checked.value.touches[0]?.targets).toEqual([
        { service: "github", kind: "page", name: "github.com/acme/app/settings/variables/actions" },
      ]);
    });

    it("refuses a step type that isn't in the catalog, naming its block", () => {
      expect(reasons(request(setVariable, { kind: "step", ref: "github.delete-repo@1" }))).toEqual([
        "block 2: `github.delete-repo@1` isn't a reviewed step type",
      ]);
    });

    it("refuses a definition this Halonic doesn't have", () => {
      expect(reasons(request({ kind: "use", ref: "github.approve-run@2" }))).toEqual([
        "block 1: `github.approve-run@2` isn't in this Halonic's catalog",
      ]);
    });

    it.each([
      [
        "https://evil.example/acme/app/settings/variables/",
        "`https://evil.example` isn't on the allow-list",
      ],
      ["http://github.com/acme/app/settings/variables/", "isn't https"],
      ["https://someone@github.com/acme/app/settings/variables/", "user name or password"],
      ["https://github.com:8443/acme/app/settings/variables/", "names a port"],
      ["https://github.com/acme/app/settings/variables/?return_to=x", "query or fragment"],
      ["https://github.com/acme/app/settings/variables/../access", "path trick"],
      ["https://github.com/acme/app/settings/variables/%252F..%252Faccess", "path trick"],
      ["https://github.com/acme/app/settings/access", "isn't a page browser steps may open"],
      ["https://github.com/acme/app/settings/", "isn't a page browser steps may open"],
      ["javascript:alert%281%29", "isn't a web address"],
      ["javascript:alert(1)", "holds one of [ ] ( )"],
      ["https://github.com/acme/app/settings/variables/.\t./access", "unprintable"],
      ["https://github.com/acme/app/settings/variables/.\n./access", "unprintable"],
      ["https://github.com/acme/app/settings/variables/%09", "path trick"],
      ["https://github.com/acme/./settings/variables/", "path trick"],
      ["https://github.com/acme/app/settings/variables/./x", "path trick"],
      ["https://github.com/acme/app/settings/variables/%2e/x", "path trick"],
      ["https://github.com/acme/%2E/settings/variables/", "path trick"],
      ["https://github.com/acme/app/settings/variables/%3Fx", "path trick"],
      ["https://github.com/acme/app/settings/variables/%23x", "path trick"],
    ])("refuses the browser address %s", (url, reason) => {
      const found = reasons(request(setVariable, browser(url)));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^block 2: /);
      expect(found[0]).toContain(reason);
    });

    it("refuses bad parameters, naming the block and the step type", () => {
      const found = reasons(
        request({ ...setVariable, parameters: { owner: "acme", repo: "../x", name: "A" } }),
      );
      expect(found[0]).toMatch(/^block 1: `github.set-variable@1`: repo: /);
    });

    it("checks a browser block's check step and result pattern", () => {
      const checked = { ...browser(variablesPage), check: { ref: "github.secret-exists@1" } };
      expect(reasons(request(checked))).toEqual([
        "block 1: check: `github.secret-exists@1` isn't a reviewed step type",
      ]);
      const broken = {
        ...browser(variablesPage),
        result: { label: "Project id", pattern: "^([a-z]$" },
      };
      expect(reasons(request(broken))[0]).toContain("the result pattern isn't allowed");
      const backtracking = {
        ...browser(variablesPage),
        result: { label: "Id", pattern: "^(a+)+$" },
      };
      expect(reasons(request(backtracking))[0]).toContain("the result pattern isn't allowed");
    });

    it("refuses more than 20 blocks, a document over 16 KB and text that isn't JSON", () => {
      expect(reasons(request(...Array.from({ length: 21 }, () => setVariable)))[0]).toMatch(
        /^blocks: /,
      );
      expect(reasons(`${request(setVariable)}${" ".repeat(16 * 1024)}`)).toEqual([
        "the request is over 16 KB",
      ]);
      expect(reasons("{")).toEqual(["the request isn't valid JSON"]);
    });

    it("refuses an unknown key and more than 10 instruction lines, naming the block", () => {
      expect(reasons(request({ ...setVariable, method: "DELETE" }))[0]).toMatch(/^block 1: /);
      const long = {
        ...browser(variablesPage),
        instructions: Array.from({ length: 11 }, () => "Click."),
      };
      expect(reasons(request(long))[0]).toMatch(/^block 1: instructions: /);
    });
  });

  describe("stepperBlockSchema", () => {
    it("is exported on its own for ToolScript's header", () => {
      expect(stepperBlockSchema.safeParse(setVariable).success).toBe(true);
    });
  });
});
