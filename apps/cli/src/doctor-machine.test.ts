import { describe, expect, it } from "vitest";
import { nodeDoctorMachine, sandboxKindName } from "./doctor-machine.ts";

describe("nodeDoctorMachine", () => {
  it("names this computer's system and its Claude Code, Codex and OpenCode harnesses", () => {
    const computer = nodeDoctorMachine();

    expect(computer.system).toMatch(/^(Linux|macOS|Windows|\w+) \w+$/);
    expect(computer.harnesses.map((harness) => harness.id)).toEqual([
      "claude-code",
      "codex",
      "opencode",
    ]);
  });
});

describe("sandboxKindName", () => {
  it("names the sandbox on Windows as Settings › Agent sandbox does, not by the system's own name (HAL-16290)", () => {
    expect(sandboxKindName("win32")).toBe("Sandbox for Windows");
  });

  it("names bubblewrap on Linux and Seatbelt on macOS", () => {
    expect(sandboxKindName("linux")).toBe("bubblewrap");
    expect(sandboxKindName("darwin")).toBe("Seatbelt");
  });

  it("falls back to the system's name where srt doesn't run", () => {
    expect(sandboxKindName("freebsd")).toBe("freebsd");
  });
});
