import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type CheckedPluginFile,
  copyCheckedPlugin,
  PluginFileChangedError,
} from "./plugin-copy.ts";

const files: Readonly<Record<string, string>> = {
  "plugin.yaml": "id: notes\n",
  "tools/server.js": "console.log('notes');\n",
};

let root: string;
let plugin: string;
let into: string;
let checked: CheckedPluginFile[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "plugin-copy-"));
  plugin = join(root, "notes");
  into = join(root, "session", "plugin");
  await mkdir(join(root, "session"));
  for (const [path, text] of Object.entries(files)) await put(path, text);
  checked = Object.entries(files).map(([path, text]) => ({ path, sha256: sha256Hex(text) }));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

verifies("connector-stdio-sandbox.local-tool-plugin-copy", () => {
  it("copies the checked files with the same bytes", async () => {
    await copyCheckedPlugin(plugin, checked, into);

    for (const [path, text] of Object.entries(files)) {
      expect(await readFile(join(into, ...path.split("/")), "utf8")).toBe(text);
    }
  });

  it("refuses a script edited after the check and leaves it out of the copy", async () => {
    await put("tools/server.js", "console.log('changed');\n");

    const copying = copyCheckedPlugin(plugin, checked, into);

    await expect(copying).rejects.toThrow(PluginFileChangedError);
    await expect(copying).rejects.toMatchObject({ path: "tools/server.js" });
    expect(await readdir(into)).toEqual(["plugin.yaml"]);
  });

  it("refuses a checked file that is missing now", async () => {
    await rm(join(plugin, "tools", "server.js"));

    await expect(copyCheckedPlugin(plugin, checked, into)).rejects.toMatchObject({
      name: "PluginFileChangedError",
      path: "tools/server.js",
    });
  });

  it.skipIf(process.platform === "win32")(
    "[platform:win32] needs links without admin rights: refuses a checked file that is now a link, even to the same bytes",
    async () => {
      await writeFile(join(root, "same.js"), files["tools/server.js"] ?? "");
      await rm(join(plugin, "tools", "server.js"));
      await symlink(join(root, "same.js"), join(plugin, "tools", "server.js"));

      await expect(copyCheckedPlugin(plugin, checked, into)).rejects.toMatchObject({
        name: "PluginFileChangedError",
        path: "tools/server.js",
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] needs mkfifo: refuses a checked file that is now a named pipe, without waiting for a writer",
    async () => {
      await rm(join(plugin, "tools", "server.js"));
      execFileSync("mkfifo", [join(plugin, "tools", "server.js")]);

      await expect(copyCheckedPlugin(plugin, checked, into)).rejects.toMatchObject({
        name: "PluginFileChangedError",
        path: "tools/server.js",
      });
    },
    5_000,
  );

  it("leaves out a file added after the check", async () => {
    await put("tools/extra.js", "console.log('extra');\n");

    await copyCheckedPlugin(plugin, checked, into);

    expect(await readdir(join(into, "tools"))).toEqual(["server.js"]);
  });

  it.each(["../outside.js", "tools//server.js", "./plugin.yaml", "tools\\server.js", "C:x.js"])(
    "refuses the listed path %j before it makes any folder",
    async (path) => {
      const copying = copyCheckedPlugin(
        plugin,
        [...checked, { path, sha256: "0".repeat(64) }],
        into,
      );

      await expect(copying).rejects.toThrow(RangeError);
      expect(await readdir(join(root, "session"))).toEqual([]);
    },
  );

  it("refuses a folder for the copy that already exists", async () => {
    await mkdir(into);

    await expect(copyCheckedPlugin(plugin, checked, into)).rejects.toThrow();
  });
});

async function put(path: string, text: string): Promise<void> {
  const file = join(plugin, ...path.split("/"));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
