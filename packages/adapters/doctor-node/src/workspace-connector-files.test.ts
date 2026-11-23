import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceConnectorFiles } from "./workspace-integrations.ts";

let folder: string;

beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), "halonic-connector-files-")));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(join(folder, path, ".."), { recursive: true });
  writeFileSync(join(folder, path), text);
}

function program(args: string[]): Connector {
  return {
    version: 1,
    id: "files",
    transport: { stdio: { command: "node", args } },
    tools: { approve: [] },
  };
}

async function filesOf(connector: Connector) {
  return (await workspaceConnectorFiles(folder, "./acme", [connector])).get(connector.id);
}

verifies("workspace.trust-connector-files", () => {
  describe("workspaceConnectorFiles", () => {
    it("hashes the file a connector runs, and the hash follows its bytes", async () => {
      put("tools/server.js", "serve()");
      const before = await filesOf(program(["./tools/server.js"]));

      put("tools/server.js", "serve(); log()");
      const after = await filesOf(program(["./tools/server.js"]));

      expect(Object.keys(before ?? {})).toEqual(["tools/server.js"]);
      expect(before?.["tools/server.js"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(after?.["tools/server.js"]).not.toBe(before?.["tools/server.js"]);
    });

    it("takes the file's absolute path under the workspace as the same entry", async () => {
      put("tools/server.js", "serve()");

      expect(await filesOf(program([join(folder, "tools", "server.js")]))).toEqual(
        await filesOf(program(["tools/server.js"])),
      );
    });

    it("marks a file reached through a linked folder instead of reading it", async () => {
      put("elsewhere/server.js", "serve()");
      // A junction on Windows, so the test needs no extra rights there.
      symlinkSync(join(folder, "elsewhere"), join(folder, "tools"), "junction");

      expect(await filesOf(program(["tools/server.js"]))).toEqual({
        "tools/server.js": "‹unreadable›",
      });
    });

    it("leaves a connector that names no workspace file out", async () => {
      expect(await filesOf(program(["tools/missing.js", "--port", "8080"]))).toBeUndefined();
    });
  });
});
