import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import {
  builtPolicyProblems,
  connectPageGuard,
  connectPageMaxBytes,
  folderBytes,
  shutOutProblems,
  sizeProblems,
} from "./connect-page-guard.ts";
import { connectPagePolicy } from "./page-policy.ts";

const repo = "/work/halonic";

const goodPage = `<meta http-equiv="Content-Security-Policy" content="${connectPagePolicy}" />`;

let folders: string[] = [];

/** A built page's folder with the given files in it, removed after the test. */
function pageFolder(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "halonic-connect-guard-"));
  folders.push(folder);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
  return folder;
}

/** Runs the guard's check after a build that wrote `folder` from modules `moduleIds`. */
function guardAfterBuild(folder: string, moduleIds: string[]): void {
  connectPageGuard().writeBundle(
    { dir: folder },
    { "assets/connect.js": { type: "chunk", moduleIds } },
  );
}

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders = [];
});

verifies("studio.connect.bundle", () => {
  describe("what the page takes in", () => {
    it("names each kind of desktop Studio code, with how many modules and the first", () => {
      const problems = shutOutProblems([
        `${repo}/apps/studio/src/connect/main.ts`,
        `${repo}/packages/studio/shell/src/window/studio-page.tsx`,
        `${repo}/packages/studio/shell/src/points/frame-points.ts`,
        `${repo}\\packages\\adapters\\agent-host-client\\src\\index.ts`,
      ]);

      expect(problems).toEqual([
        "The connect page takes in the desktop Studio shell (@halonicjs/studio-shell) (2 modules, first packages/studio/shell/src/window/studio-page.tsx).",
        "The connect page takes in an adapter (1 module, first packages/adapters/agent-host-client/src/index.ts).",
      ]);
    });

    it("shuts out the engine and the code editor with its libraries", () => {
      const problems = shutOutProblems([
        `${repo}/packages/core/engine/src/index.ts`,
        `${repo}/packages/studio/code-editor/src/index.ts`,
        "/store/node_modules/@codemirror/view/dist/index.js",
        "/store/node_modules/@lezer/highlight/dist/index.js",
      ]);

      expect(problems).toEqual([
        "The connect page takes in the engine (@halonicjs/engine) (1 module, first packages/core/engine/src/index.ts).",
        "The connect page takes in the code editor (3 modules, first packages/studio/code-editor/src/index.ts).",
      ]);
    });

    it("lets in the phone pages of the Remote feature and the kit, and no other feature code", () => {
      expect(
        shutOutProblems([
          `${repo}/packages/studio/features/remote/src/phone/phone-status.ts`,
          `${repo}/packages/studio/kit/src/button/button.tsx`,
          `${repo}/packages/studio/services/src/tauri-ipc.ts`,
        ]),
      ).toEqual([]);
      expect(
        shutOutProblems([
          `${repo}/packages/studio/features/remote/src/settings/remote-settings.tsx`,
        ]),
      ).toEqual([
        "The connect page takes in a desktop Studio feature (1 module, first packages/studio/features/remote/src/settings/remote-settings.tsx).",
      ]);
    });
  });

  describe("size", () => {
    it("allows the page up to the limit and no further", () => {
      expect(sizeProblems(connectPageMaxBytes)).toEqual([]);
      expect(sizeProblems(connectPageMaxBytes + 1)).toEqual([
        "The connect page is 801 KB on disk, over its limit of 800 KB (HAL-15159). Find what grew it; raising the limit needs Liam's approval.",
      ]);
    });

    it("adds up every file the build wrote, in subfolders too", () => {
      const folder = pageFolder({ "connect.html": "12345" });
      mkdirSync(join(folder, "assets"));
      writeFileSync(join(folder, "assets", "connect.js"), "1234567");

      expect(folderBytes(folder)).toBe(12);
    });
  });

  describe("the built page's policy tag", () => {
    it("wants exactly one tag, with the connect page's policy", () => {
      expect(builtPolicyProblems(goodPage)).toEqual([]);
      expect(builtPolicyProblems("<title>Halonic</title>")).toEqual([
        "connect.html has 0 content security policy tags; it should have exactly one.",
      ]);
      expect(builtPolicyProblems(`${goodPage}${goodPage}`)).toEqual([
        "connect.html has 2 content security policy tags; it should have exactly one.",
      ]);
    });
  });

  describe("after the build writes", () => {
    it("passes a page within every rule", () => {
      const folder = pageFolder({ "connect.html": goodPage });

      expect(() =>
        guardAfterBuild(folder, [`${repo}/apps/studio/src/connect/main.ts`]),
      ).not.toThrow();
    });

    it("fails the build with every problem it found", () => {
      const folder = pageFolder({
        "connect.html": "<title>Halonic</title>",
        "big.js": "x".repeat(connectPageMaxBytes),
      });

      expect(() => guardAfterBuild(folder, [`${repo}/packages/core/engine/src/index.ts`])).toThrow(
        [
          "The connect page can't ship in the Android app:",
          "- The connect page takes in the engine (@halonicjs/engine) (1 module, first packages/core/engine/src/index.ts).",
          "- connect.html has 0 content security policy tags; it should have exactly one.",
          "- The connect page is 801 KB on disk, over its limit of 800 KB (HAL-15159). Find what grew it; raising the limit needs Liam's approval.",
        ].join("\n"),
      );
    });
  });
});
