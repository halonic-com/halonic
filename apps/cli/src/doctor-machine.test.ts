import { describe, expect, it } from "vitest";
import { nodeDoctorMachine } from "./doctor-machine.ts";

describe("nodeDoctorMachine", () => {
  it("names this computer's system and its Claude Code and Codex harnesses", () => {
    const computer = nodeDoctorMachine();

    expect(computer.system).toMatch(/^(Linux|macOS|Windows|\w+) \w+$/);
    expect(computer.harnesses.map((harness) => harness.id)).toEqual(["claude-code", "codex"]);
  });
});
