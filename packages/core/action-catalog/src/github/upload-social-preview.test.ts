import {
  renderManualGuide,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shippedCatalog } from "../catalog.ts";
import { definition } from "./upload-social-preview.ts";

const parameters = { owner: "acme", repo: "app" };

function manualGuide(): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title: "Upload the acme/app preview",
    reason: "The launch post links the repository.",
    blocks: [{ kind: "use", ref: "github.upload-social-preview@1", parameters }],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}

verifies("action-catalog.github-upload-social-preview", () => {
  describe("github.upload-social-preview@1", () => {
    it("is one guided step on the repository's settings page", () => {
      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0]).toMatchObject({
        kind: "guided",
        address: "https://github.com/{owner}/{repo}/settings",
      });
    });

    it("previews the repository in one sentence and says Halonic can't check it", () => {
      expect(definition.preview(parameters)).toEqual([
        "Opens the settings of acme/app on GitHub, where you upload the social preview image by hand. Halonic can't check it.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "repository", name: "acme/app" },
      ]);
    });

    it("gives a numbered manual guide that opens the settings page", () => {
      expect(manualGuide()).toBe(
        [
          "`Upload the acme/app preview`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings",
          "2. Under **Social preview**, click **Edit**, then **Upload an image…**.",
          "3. Choose the image: a PNG, JPG or GIF file under 1 MB, at least 640 × 320 pixels (1280 × 640 looks best).",
          "4. Check that the new image now shows under **Social preview**.",
          "",
        ].join("\n"),
      );
    });

    it.each(["../secrets", "app%2Fsecrets", "app?x=1"])("refuses the repo %s", (repo) => {
      expect(parse(definition.parameters, { owner: "acme", repo }).ok).toBe(false);
    });

    it("refuses an owner GitHub wouldn't allow and an undeclared key", () => {
      expect(parse(definition.parameters, { owner: "-acme", repo: "app" }).ok).toBe(false);
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });
  });
});
