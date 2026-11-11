import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type ConnectorStart,
  type FolderLookup,
  touchesWorkingFolder,
  workingFolderRefusal,
} from "./working-folder-start.ts";

const workspace = "/w";
const coder = "/w/files/agents/coder";

/**
 * A file system for the workspace `/w`, resolved the POSIX way, which is
 * enough for the rule; the adapters' tests run it on Node's own functions.
 * Links lead from a path to another; `FILES~1` stands for a Windows short
 * name, which Windows' `realpath` expands like a link.
 */
const links: Record<string, string> = {
  "/w/FILES~1": "/w/files",
  "/w/tools/run.js": "/w/files/agents/coder/run.js",
  "/w/out": "/w/files/agents/coder",
  "/w/linked": "/w/files/agents",
  "/w/pnpm/node_modules/mail-mcp": "/w/files/agents/coder",
  "/w/bin-link/node_modules/.bin/mail-mcp": "/w/files/agents/coder/cli.js",
  "/w/scoped/node_modules/@acme/mail": "/w/files/agents/coder",
  "/w/tools/chat/node_modules/helper": "/w/files/agents/coder",
  "/w/mono/node_modules/mail-mcp": "/w/mono/packages/mail-mcp",
  "/w/mono/packages/mail-mcp/node_modules/helper": "/w/files/agents/coder",
  "/t/link": "/w/pnpm",
  "/alias": "/w",
};

const folders: Record<string, readonly string[]> = {
  "/w": ["files", "tools", "node_modules", "server.js"],
  "/w/node_modules": ["zod", ".bin", "@types"],
  "/w/node_modules/.bin": ["tsc"],
  "/w/node_modules/@types": ["node"],
  "/w/pnpm/node_modules": ["mail-mcp"],
  "/w/bin-link/node_modules": [".bin"],
  "/w/bin-link/node_modules/.bin": ["mail-mcp"],
  "/w/scoped/node_modules": ["@acme"],
  "/w/scoped/node_modules/@acme": ["mail"],
  "/w/tools/chat/node_modules": ["helper"],
  "/w/mono/node_modules": ["mail-mcp"],
  "/w/mono/packages/mail-mcp/node_modules": ["helper"],
};

const files = new Set([
  "/w/server.js",
  "/w/tools/mail/server.js",
  "/w/tools/mail/index.js",
  "/w/tools/chat/server.js",
  "/w/mail.py",
  "/w/preload.js",
  "/w/files/agents/coder/run.js",
  "/w/files/agents/coder/cli.js",
]);

const realFolders = new Set([
  ...Object.keys(folders),
  "/w/files",
  "/w/files/agents",
  coder,
  "/w/files/agents/coder-old",
  "/w/tools",
  "/w/tools/mail",
  "/w/tools/chat",
  "/w/mono",
  "/w/mono/packages",
  "/w/mono/packages/mail-mcp",
  "/t",
  "/w/pnpm",
  "/w/bin-link",
  "/w/scoped",
  "/w/node_modules/zod",
  "/w/node_modules/.bin/tsc",
  "/w/node_modules/@types/node",
  "/launch/1",
]);

function normalize(path: string): string {
  const kept: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") kept.pop();
    else if (segment !== "" && segment !== ".") kept.push(segment);
  }
  return `/${kept.join("/")}`;
}

/** Follows every link on the way, as `realpath` does. */
function follow(path: string): string {
  for (const [link, target] of Object.entries(links)) {
    if (path === link || path.startsWith(`${link}/`)) {
      return follow(target + path.slice(link.length));
    }
  }
  return path;
}

const lookup: FolderLookup = {
  resolve: (cwd, part) => normalize(part.startsWith("/") ? part : `${cwd}/${part}`),
  realpath: async (path) => {
    const real = follow(path);
    if (files.has(real) || realFolders.has(real)) return real;
    throw new Error(`nothing at ${path}`);
  },
  list: async (folder) => folders[follow(folder)] ?? [],
  isFile: async (path) => files.has(follow(path)),
};

const start = (
  program: string,
  args: string[] = [],
  cwd = workspace,
  env: Record<string, string> = {},
): ConnectorStart => ({ cwd, program, args, env });

const reach = (
  connectorStart: ConnectorStart,
  workingFolders: readonly string[] = [coder],
  workspaceRoot = workspace,
) => touchesWorkingFolder(connectorStart, workspaceRoot, workingFolders, lookup);

verifies("format.working-folder-start", () => {
  describe("touchesWorkingFolder", () => {
    it.each([
      ["a script reached through a link", start("node", ["tools/run.js"])],
      ["a Windows short name", start("node", ["/w/FILES~1/agents/coder/x.js"])],
      ["an absolute path into the workspace", start("node", ["/w/files/agents/coder/x.js"])],
      ["another letter case", start("node", ["/w/Files/Agents/Coder/x.js"])],
      ["the program as found on PATH", start("/w/files/agents/coder/bin/mail-mcp")],
      ["a PATH folder in env", start("npx", [], workspace, { PATH: `${coder}/bin:/usr/bin` })],
      ["a new file in a linked folder", start("node", ["--out=out/new.json"])],
      ["a module that python -m runs", start("python", ["-m", "files.agents.coder.server"])],
      ["a start folder that links to the folder above it", start("node", ["x.js"], "/w/linked")],
    ])("finds %s", async (_, bad) => {
      expect(await reach(bad)).toMatchObject({ folder: coder });
    });

    it.each([
      ["a pnpm workspace package", start("npx", ["mail-mcp"], "/w/pnpm")],
      ["a .bin entry", start("npx", ["mail-mcp"], "/w/bin-link")],
      ["a scoped package", start("node", ["-e", "require('@acme/mail')"], "/w/scoped")],
      ["a package above the start folder", start("npx", ["mail-mcp"], "/w/pnpm/tools")],
      ["a package next to a script", start("node", ["tools/chat/server.js"])],
      ["a package of a workspace package", start("npx", ["mail-mcp"], "/w/mono")],
      [
        "a package from a start folder reached through a link",
        start("npx", ["mail-mcp"], "/t/link"),
      ],
    ])("finds %s linked into node_modules", async (_, bad) => {
      expect(await reach(bad)).toMatchObject({
        folder: coder,
        how: expect.stringContaining("node_modules"),
      });
    });

    it("finds a package linked into node_modules when the workspace root is reached through a link", async () => {
      expect(await reach(start("npx", ["mail-mcp"], "/w/pnpm"), [coder], "/alias")).toMatchObject({
        folder: coder,
        how: expect.stringContaining("node_modules"),
      });
    });

    it("finds a script in the workspace root, which loads files from next to it", async () => {
      expect(await reach(start("node", ["server.js"]))).toEqual({
        folder: coder,
        how: "runs 'server.js', which loads files from next to it",
      });
    });

    it.each([
      ["a script without its ending", start("node", ["server"]), "server"],
      ["the folder it runs", start("node", ["."]), "."],
      ["a module without its ending", start("python", ["-m", "mail"]), "mail"],
      [
        "a script a flag loads",
        start("node", ["--require=./preload.js", "tools/mail/server.js"]),
        "./preload.js",
      ],
    ])("finds %s in the workspace root", async (_, bad, shown) => {
      expect(await reach(bad)).toEqual({
        folder: coder,
        how: `runs '${shown}', which loads files from next to it`,
      });
    });

    it("finds a working folder inside a folder it runs", async () => {
      const drafts = "/w/tools/mail/drafts";
      expect(await reach(start("node", ["tools/mail"]), [drafts])).toMatchObject({
        folder: drafts,
      });
    });

    it.each([
      ["no working folders", start("node", ["/w/files/agents/coder/x.js"]), []],
      [
        "a pinned package in its own empty folder",
        start("npx", ["-y", "mail-mcp@1.2.3"], "/launch/1"),
        [coder],
      ],
      ["a script in its own folder", start("node", ["tools/mail/server.js"]), [coder]],
      ["real packages in node_modules", start("npx", ["tsc"]), [coder]],
      ["a folder with a longer name", start("node", ["/w/files/agents/coder-old/x.js"]), [coder]],
      ["a start in another folder", start("node", ["server.js"], "/w/tools/mail"), [coder]],
      ["a folder it runs outside the working folder", start("node", ["tools/mail"]), [coder]],
      [
        "an argument that names nothing",
        start("node", ["tools/mail/server.js", "--port", "8080"]),
        [coder],
      ],
    ])("allows %s", async (_, fine, workingFolders) => {
      expect(await reach(fine, workingFolders)).toBeNull();
    });
  });

  describe("workingFolderRefusal", () => {
    it("names the working folder and how the start reaches it", () => {
      expect(workingFolderRefusal({ folder: coder, how: "runs 'run.js'" })).toBe(
        "Halonic didn't start the program: it runs 'run.js', in the agent working folder " +
          "'/w/files/agents/coder'. An agent could change it, and it would run outside the sandbox",
      );
    });
  });
});
