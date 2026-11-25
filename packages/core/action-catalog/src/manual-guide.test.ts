import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { describe, expect, it } from "vitest";
import { renderDefinitionGuide } from "./manual-guide.ts";

// An invented definition for the acme organisation, never a real workspace.
const base: StepperDefinition<Record<string, string | number>> = {
  id: "acme.rotate-key",
  version: 1,
  service: "acme",
  title: "Rotate a key",
  summary: "Rotates one key.",
  risk: "admin",
  parameters: strictParameters({ team: { kind: "text", pattern: /^[a-z ]{1,20}$/ } }),
  steps: [],
  targets: () => [],
  preview: () => [],
};

function guide(steps: StepperDefinition["steps"], parameters = { team: "red team" }) {
  return renderDefinitionGuide({ ...base, steps }, parameters);
}

describe("renderDefinitionGuide", () => {
  it("encodes values in the address but not in the instructions", () => {
    const result = guide([
      {
        kind: "guided",
        address: "https://acme.example/teams/{team}",
        instructions: ["Find {team}."],
        checkedOn: "2026-11-25",
        result: { label: "the key's id", pattern: "^[0-9]{1,9}$" },
      },
    ]);
    expect(result.ok && result.value.split("\n").slice(0, 3)).toEqual([
      "1. Open https://acme.example/teams/red%20team",
      "2. Find red team.",
      "3. Note the key's id.",
    ]);
  });

  it("names a secret input without ever holding its value", () => {
    const result = guide([{ kind: "input", name: "key", label: "the new key", secret: true }]);
    expect(result.ok && result.value.split("\n")[0]).toBe(
      "1. Type the new key only on the service's own page. Never paste it into a chat or a task.",
    );
    const plain = guide([{ kind: "input", name: "id", label: "the key's id", secret: false }]);
    expect(plain.ok && plain.value.split("\n")[0]).toBe("1. Note the key's id.");
  });

  it("refuses an API step, which has no manual form yet", () => {
    expect(guide([{ kind: "script", ref: "acme/rotate-key" }])).toEqual({
      ok: false,
      error: "acme.rotate-key@1 step 1: the API step acme/rotate-key has no manual form yet",
    });
  });

  it("refuses a placeholder with no value", () => {
    const steps = [
      { kind: "guided", address: "https://acme.example/{zone}", instructions: [], checkedOn: "" },
    ] as const;
    expect(guide(steps)).toEqual({
      ok: false,
      error: "acme.rotate-key@1 step 1: no value for {zone}",
    });
    const inInstructions = [
      { ...steps[0], address: "https://acme.example/", instructions: ["{x}"] },
    ];
    expect(guide(inInstructions).ok).toBe(false);
  });
});
