import { describe, expect, it, vi } from "vitest";
import { bundleEntry, executableName, seaConfig } from "./build-sea.ts";
import { packageName } from "./index.ts";

describe("packageName", () => {
  it("is the npm name", () => {
    expect(packageName).toBe("@halonicjs/app-agent-host");
  });
});

describe("the entry point", () => {
  it("prints a source version when run from source", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await import("./main.ts");
    expect(write).toHaveBeenCalledWith("halonic-agent-host 0.0.0-source\n");
  });
});

describe("bundleEntry", () => {
  it("removes the types and puts the version in front", () => {
    const bundle = bundleEntry("declare const x: string;\nconst y: number = 1;\n", "1.2.3");
    expect(bundle.startsWith('const HALONIC_AGENT_HOST_VERSION = "1.2.3";\n')).toBe(true);
    expect(bundle).not.toContain(": number");
  });
});

describe("executableName", () => {
  it("ends in .exe on Windows only", () => {
    expect([executableName("win32"), executableName("linux"), executableName("darwin")]).toEqual([
      "halonic-agent-host.exe",
      "halonic-agent-host",
      "halonic-agent-host",
    ]);
  });
});

describe("seaConfig", () => {
  it("names the bundle and the executable", () => {
    const config = JSON.parse(seaConfig("a.mjs", "b")) as Record<string, unknown>;
    expect(config).toMatchObject({ main: "a.mjs", mainFormat: "module", output: "b" });
  });
});
