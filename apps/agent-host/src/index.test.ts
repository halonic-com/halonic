import { describe, expect, it, vi } from "vitest";
import { bundleEntry, executableName, seaConfig } from "./build/build-sea.ts";
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
  it("removes the types and puts each constant in front", () => {
    const bundle = bundleEntry("declare const x: string;\nconst y: number = 1;\n", {
      VERSION: "1.2.3",
      PAYLOAD: { files: [] },
    });
    expect(bundle.startsWith('const VERSION = "1.2.3";\nconst PAYLOAD = {"files":[]};\n')).toBe(
      true,
    );
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
  it("names the bundle and the executable, and embeds each payload file by its path", () => {
    const payload = {
      files: [{ path: "node_modules/a/index.js", source: "/repo/a/index.js", executable: false }],
      packages: {},
    };
    const config = JSON.parse(seaConfig("a.mjs", "b", payload)) as Record<string, unknown>;
    expect(config).toMatchObject({
      main: "a.mjs",
      mainFormat: "module",
      output: "b",
      assets: { "node_modules/a/index.js": "/repo/a/index.js" },
    });
  });
});
