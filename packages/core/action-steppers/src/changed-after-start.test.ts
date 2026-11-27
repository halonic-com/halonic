import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkChangedAfterStart } from "./changed-after-start.ts";
import { routesOf } from "./step-routes.ts";
import type { CheckStep, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

const startedAt = "2026-11-27T09:00:00Z";
const unchanged = { ok: false, message: "It hasn't changed since this stepper opened." };

function readSecret(changedAfterStart: string): StepperDefinition {
  const check: CheckStep = {
    kind: "check",
    path: "/repos/{owner}/actions/secrets/DEPLOY_KEY",
    keep: ["name", "updated_at"],
    changedAfterStart,
    manual: { url: "https://github.com/{owner}", instructions: ["Read the secret's date."] },
  };
  return {
    id: "github.read-secret",
    version: 1,
    service: "github",
    title: "Read a secret's date",
    summary: "Reads when a secret last changed.",
    risk: "routine",
    parameters: strictParameters({ owner: { kind: "text", pattern: /^[a-z]{1,39}$/ } }),
    steps: [check],
    targets: () => [],
    preview: () => [],
  };
}

verifies("action-steppers.changed-after-start", () => {
  describe("checkChangedAfterStart", () => {
    it("passes for a time after the start", () => {
      const kept = { updated_at: "2026-11-27T09:00:01Z" };
      expect(checkChangedAfterStart(kept, "updated_at", startedAt)).toEqual({ ok: true });
    });

    it("fails for a time before the start and for the same instant", () => {
      const older = { updated_at: "2026-11-26T18:30:00Z" };
      expect(checkChangedAfterStart(older, "updated_at", startedAt)).toEqual(unchanged);
      // 10:00 in +01:00 is the start itself: compared as instants, not as text.
      const same = { updated_at: "2026-11-27T10:00:00+01:00" };
      expect(checkChangedAfterStart(same, "updated_at", startedAt)).toEqual(unchanged);
    });

    it.each([
      [{}],
      [{ updated_at: 1764234000000 }],
      [{ updated_at: "yesterday" }],
      [{ updated_at: "2026-11-27 10:00" }],
      [{ updated_at: "2026-11-27T10:00:00" }],
    ])("fails closed for %o", (kept) => {
      expect(checkChangedAfterStart(kept, "updated_at", startedAt)).toEqual({
        ok: false,
        message: 'The service gave no valid time in "updated_at".',
      });
    });

    it("fails for a start time that isn't an instant", () => {
      const kept = { updated_at: "2026-11-27T09:00:01Z" };
      expect(checkChangedAfterStart(kept, "updated_at", "now")).toMatchObject({ ok: false });
    });

    it("refuses a definition whose changedAfterStart isn't a kept field", () => {
      expect(() => routesOf(readSecret("updated_at"))).not.toThrow();
      expect(() => routesOf(readSecret("created_at"))).toThrow(
        'github.read-secret@1 step 1: changedAfterStart "created_at" isn\'t a kept field',
      );
    });
  });
});
