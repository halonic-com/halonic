import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { noSandboxLine } from "./doctor-no-sandbox-line.ts";
import type { SandboxChoice } from "./sandbox-choice.ts";

verifies("app.doctor-no-sandbox", () => {
  it("warns with the time, the version and both limits while no sandbox runs", () => {
    const choice: SandboxChoice = {
      active: "none",
      setting: { backend: "none", chosenAt: "2026-11-15T09:00:00.000Z", appVersion: "0.1.0" },
      backends: [],
    };
    expect(noSandboxLine(choice)).toEqual({
      check: "no-sandbox",
      status: "warning",
      chosenAt: "2026-11-15T09:00:00.000Z",
      appVersion: "0.1.0",
      limits: ["no-file-fence", "no-network-fence"],
    });
  });

  it("has no line for a backend that is in use", () => {
    const choice: SandboxChoice = {
      active: "srt",
      setting: { backend: "srt", chosenAt: "2026-11-15T09:00:00.000Z" },
      backends: [],
    };
    expect(noSandboxLine(choice)).toBeUndefined();
  });

  it("has no line without a setting", () => {
    expect(noSandboxLine({ active: null, setting: null, backends: [] })).toBeUndefined();
  });
});
