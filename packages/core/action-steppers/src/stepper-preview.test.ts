import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog } from "./acme-catalog.fixture.ts";
import { previewStepperRequest, type StepperPreview } from "./stepper-preview.ts";
import { stepperRequestFormat } from "./stepper-request.ts";
import { validateStepperRequest } from "./validate-stepper-request.ts";

const serviceNames: Record<string, string> = { github: "GitHub", cloudflare: "Cloudflare" };
const names = {
  requester: "acme-bot",
  service: (service: string) => serviceNames[service] ?? service,
};

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
const variablesPage = {
  kind: "browser",
  url: "https://github.com/acme/app/settings/variables/actions",
  instructions: ["Click New variable.", "Type DEPLOY_ENV as the name."],
  result: { label: "Variable name", pattern: "^[A-Z_]+$" },
};

function preview(...blocks: unknown[]): StepperPreview {
  const json = JSON.stringify({
    format: stepperRequestFormat,
    title: "Set up acme/app",
    reason: "The deploy needs it.",
    blocks,
  });
  const checked = validateStepperRequest(json, acmeCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return previewStepperRequest(checked.value, acmeCatalog, names);
}

verifies("action-steppers.stepper-preview", () => {
  describe("previewStepperRequest", () => {
    it("lists every target, then the pages it opens per host", () => {
      expect(preview(setVariable, addDns, variablesPage).touches).toBe(
        "This stepper touches: GitHub repository `acme/app`, Cloudflare zone `acme.example`, and opens 1 page on `github.com`.",
      );
    });

    it("names a target once and counts pages", () => {
      expect(preview(setVariable, setVariable, variablesPage, variablesPage).touches).toBe(
        "This stepper touches: GitHub repository `acme/app` and opens 2 pages on `github.com`.",
      );
    });

    it("gives step blocks their definition's own preview for the parameters", () => {
      expect(preview(setVariable, addDns).blocks).toEqual([
        { block: 1, lines: ["Sets the variable DEPLOY_ENV on acme/app."] },
        { block: 2, lines: ["Adds a TXT record to acme.example."] },
      ]);
    });

    it("shows a browser block's full address and keeps the requester's words apart", () => {
      expect(preview(variablesPage).blocks).toEqual([
        {
          block: 1,
          lines: ["Opens https://github.com/acme/app/settings/variables/actions"],
          fromRequester: {
            heading: "Instructions from acme-bot, not checked by Halonic",
            lines: ["Click New variable.", "Type DEPLOY_ENV as the name."],
            resultLabel: "Variable name",
          },
        },
      ]);
    });
  });
});

verifies("action-steppers.stepper-preview-server-session", () => {
  it("shows a server-session block's steps and Done when under the requester's heading", () => {
    const serverSession = {
      kind: "server-session",
      task: "HAL-1234",
      steps: ["Pull main in the acme checkout.", "Restart the acme worker."],
      doneWhen: "The worker answers on build.acme.example/health.",
    };
    expect(preview(serverSession).blocks).toEqual([
      {
        block: 1,
        lines: ["Opens Claude Code on your server for HAL-1234."],
        fromRequester: {
          heading: "Instructions from acme-bot, not checked by Halonic",
          lines: [
            "Pull main in the acme checkout.",
            "Restart the acme worker.",
            "Done when: The worker answers on build.acme.example/health.",
          ],
        },
      },
    ]);
  });
});
