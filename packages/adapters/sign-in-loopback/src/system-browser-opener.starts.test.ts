import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every process the opener starts goes through this fake, so the test sees
// each one and nothing really runs.
const spawned = vi.hoisted(() => [] as unknown[][]);
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    spawn: (...call: unknown[]) => {
      spawned.push(call);
      const child = Object.assign(new EventEmitter(), { unref: () => {} });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  };
});

const { createSystemBrowserOpener } = await import("./system-browser-opener.ts");

const windowsEnv = { SystemRoot: "\\\\winhost\\root" };

verifies("sign-in-loopback.system-browser-opener", () => {
  describe("what the opener starts", () => {
    it.each([
      ["a file address", "file:///w/skills/mail/scripts/send"],
      ["a bare path", "/w/skills/mail/scripts/send"],
      ["a Windows-style relative path", "skills\\mail\\scripts\\send.ps1"],
      ["a UNC path", "\\\\host\\share\\send.exe"],
      ["a relative script", "./scripts/send"],
      ["an address that starts like an option", "--help"],
      ["a script address", "javascript:alert(1)"],
      ["an empty address", ""],
    ])("refuses %s and starts nothing", async (_, url) => {
      spawned.length = 0;
      for (const platform of ["linux", "darwin", "win32"] as const) {
        await expect(createSystemBrowserOpener(platform, windowsEnv).open(url)).resolves.toBe(
          false,
        );
      }
      expect(spawned).toEqual([]);
    });

    it.each([
      ["linux", "xdg-open", []],
      ["darwin", "/usr/bin/open", []],
      ["win32", "\\\\winhost\\root\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler"]],
    ] as const)(
      "on %s starts only %s with the address, not through a shell",
      async (platform, program, before) => {
        spawned.length = 0;
        const opened = await createSystemBrowserOpener(platform, windowsEnv).open(
          "https://accounts.example.test/auth?state=abc",
        );
        expect(opened).toBe(true);
        expect(spawned).toHaveLength(1);
        const [started, args, options] = spawned[0] as [string, string[], Record<string, unknown>];
        expect(started).toBe(program);
        expect(args).toEqual([...before, "https://accounts.example.test/auth?state=abc"]);
        expect(options).not.toHaveProperty("shell");
      },
    );

    it.each([
      ["missing", {}],
      ["a relative folder", { SystemRoot: "windows" }],
    ])("on win32 with a SystemRoot that is %s starts nothing", async (_, env) => {
      spawned.length = 0;
      const opened = await createSystemBrowserOpener("win32", env).open("https://example.test/");
      expect(opened).toBe(false);
      expect(spawned).toEqual([]);
    });
  });
});
