import {
  renderManualGuide,
  type StepperDefinition,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shippedCatalog } from "../catalog.ts";
import { maxNoteLength } from "../device-check.ts";
import { definition as android } from "./check-android-build.ts";
import { definition as pairing } from "./check-phone-pairing.ts";
import { definition as windows } from "./check-windows-build.ts";

const parameters = { owner: "acme", repo: "app", tag: "v1.0.0" };
const definitions: readonly StepperDefinition[] = [windows, android, pairing];

function manualGuide(definition: StepperDefinition): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title: "Try the acme build",
    reason: "The release needs one check on a real device.",
    blocks: [{ kind: "use", ref: `${definition.id}@1`, parameters }],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}

function resultOf(definition: StepperDefinition): RegExp {
  const step = definition.steps[0];
  if (step?.kind !== "guided" || step.result === undefined) throw new Error("no result step");
  return new RegExp(step.result.pattern);
}

function noteOf(definition: StepperDefinition): RegExp {
  const step = definition.steps[1];
  if (step?.kind !== "input" || step.pattern === undefined) throw new Error("no note step");
  return new RegExp(step.pattern);
}

verifies("action-catalog.device-checks", () => {
  describe.each(definitions)("$id@1", (definition) => {
    it("accepts only its three fixed choices as the result", () => {
      const result = resultOf(definition);
      for (const choice of ["works", "works-with-problems", "doesnt-install"]) {
        expect(result.test(choice)).toBe(true);
      }
      for (const other of ["broken", "Works", "works ", "works-with-problems!", "", "works\nx"]) {
        expect(result.test(other)).toBe(false);
      }
    });

    it("accepts a plain note of at most 500 characters and no more", () => {
      const note = noteOf(definition);
      expect(note.test("")).toBe(true);
      expect(note.test("a".repeat(maxNoteLength))).toBe(true);
      expect(note.test("a".repeat(maxNoteLength + 1))).toBe(false);
      expect(note.test("two\nlines")).toBe(false);
    });

    it("opens its download page on https://github.com/ only", () => {
      expect(definition.steps[0]).toMatchObject({
        kind: "guided",
        address: "https://github.com/{owner}/{repo}/releases/tag/{tag}",
      });
      for (const owner of ["github.com@evil.example", "evil.example/x", "acme/evil"]) {
        expect(parse(definition.parameters, { ...parameters, owner }).ok).toBe(false);
      }
      for (const tag of ["../x", "v1?x=1", "v1%2Fx", "https://evil.example"]) {
        expect(parse(definition.parameters, { ...parameters, tag }).ok).toBe(false);
      }
      expect(parse(definition.parameters, { ...parameters, path: "x" }).ok).toBe(false);
    });

    it("previews the release and says Halonic can't check it", () => {
      const [sentence, ...more] = definition.preview(parameters);
      expect(more).toEqual([]);
      expect(sentence).toContain("acme/app");
      expect(sentence).toContain("v1.0.0");
      expect(sentence).toContain("Halonic can't check it");
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "release", name: "acme/app@v1.0.0" },
      ]);
    });

    it("gives a manual guide that is a numbered list opening the release page", () => {
      const lines = manualGuide(definition).split("\n").slice(3).filter(Boolean);
      expect(lines[0]).toBe("1. Open https://github.com/acme/app/releases/tag/v1.0.0");
      lines.forEach((line, index) => {
        expect(line.startsWith(`${index + 1}. `)).toBe(true);
      });
    });
  });

  it("walks TalkBack in the Android check", () => {
    expect(manualGuide(android)).toContain("TalkBack");
  });
});
