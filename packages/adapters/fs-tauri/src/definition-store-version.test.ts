import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VersionOptions, WorkspaceFileChange } from "@halonicjs/ports";
import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriDefinitionStore, versionTextsMs } from "./definition-store.ts";
import { FakeFileShell } from "./fake-file-shell.test-helper.ts";

const acme = "/workspaces/acme";

/** The acme example's files, by workspace path, as the shell would find them on disk. */
function acmeExample(): Record<string, string> {
  const root = join(import.meta.dirname, "../../../../examples/acme");
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(root.length + 1).replaceAll("\\", "/")] = readFileSync(path, "utf8");
    }
  }
  return files;
}

/** The version as the store worked it out before HAL-19964: each file read over IPC one at a time. */
async function versionReadOneByOne(
  store: TauriDefinitionStore,
  options: VersionOptions = {},
): Promise<string> {
  const parts: string[] = [];
  for (const path of await store.list(undefined, options)) {
    const content = await store.read(path);
    if (content !== null) {
      parts.push(`${path}\n${content}`);
    }
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("\n\0")),
  );
  return `sha256:${bytesToHex(new Uint8Array(digest)).slice(0, 16)}`;
}

/** How many times the shell was asked to read each file. */
function readsByPath(shell: FakeFileShell): Map<string, number> {
  const reads = new Map<string, number>();
  for (const { command, args } of shell.calls) {
    if (command === "fs_read") {
      const path = String(args?.["path"]);
      reads.set(path, (reads.get(path) ?? 0) + 1);
    }
  }
  return reads;
}

/** A store over `files` whose clock the test sets. */
function clocked(files: Record<string, string>) {
  const shell = new FakeFileShell({ opened: [acme], files });
  const clock = { now: 1_000 };
  const store = new TauriDefinitionStore(shell, acme, { now: () => clock.now });
  return { shell, store, clock };
}

verifies("fs-tauri.version-reads-once", () => {
  describe("TauriDefinitionStore version", () => {
    it("gives the acme example the same version as reading each file one at a time", async () => {
      const files = acmeExample();
      const leaveOut = { folders: ["hubs"] };
      const before = new TauriDefinitionStore(new FakeFileShell({ opened: [acme], files }), acme);
      const after = new TauriDefinitionStore(new FakeFileShell({ opened: [acme], files }), acme);
      expect(Object.keys(files).length).toBeGreaterThan(5);
      expect(await after.version()).toBe(await versionReadOneByOne(before));
      expect(await after.version({ leaveOut })).toBe(
        await versionReadOneByOne(before, { leaveOut }),
      );
    });

    it("reads each file of the acme example over IPC once in a load: the version, then each file", async () => {
      const shell = new FakeFileShell({ opened: [acme], files: acmeExample() });
      const store = new TauriDefinitionStore(shell, acme);
      await store.version();
      const paths = await store.list();
      const texts = await Promise.all(paths.map((path) => store.read(path)));
      expect(texts).toEqual(paths.map((path) => shell.files.get(path)));
      expect([...readsByPath(shell).keys()]).toEqual(paths);
      expect([...readsByPath(shell).values()].every((count) => count === 1)).toBe(true);
    });

    it("gives the kept text once, then reads the disk again", async () => {
      const { shell, store } = clocked({ "a.yaml": "1" });
      await store.version();
      shell.files.set("a.yaml", "2");
      expect(await store.read("a.yaml")).toBe("1");
      expect(await store.read("a.yaml")).toBe("2");
    });

    it(`reads the disk once the kept texts are over ${versionTextsMs} ms old`, async () => {
      const { shell, store, clock } = clocked({ "a.yaml": "1", "b.yaml": "1" });
      await store.version();
      shell.files.set("a.yaml", "2");
      shell.files.set("b.yaml", "2");
      clock.now += versionTextsMs;
      expect(await store.read("a.yaml")).toBe("1");
      clock.now += 1;
      expect(await store.read("b.yaml")).toBe("2");
      clock.now = 1_000;
      expect(await store.read("b.yaml")).toBe("2");
    });

    it("drops a file's kept text when the store writes or removes it", async () => {
      const { store } = clocked({ "a.yaml": "1", "b.yaml": "1" });
      await store.version();
      await store.write("a.yaml", "2");
      await store.remove("b.yaml");
      expect(await store.read("a.yaml")).toBe("2");
      expect(await store.read("b.yaml")).toBeNull();
    });

    it("drops a file's kept text when its watch hears the file changed outside", async () => {
      const { shell, store } = clocked({ "a.yaml": "1" });
      const batches: (readonly WorkspaceFileChange[])[] = [];
      let heard = () => {};
      const watch = await store.watch({
        changed: (changes) => {
          batches.push(changes);
          heard();
        },
        failed: () => {},
      });
      await store.version();
      const changed = new Promise<void>((resolve) => {
        heard = resolve;
      });
      shell.changeOutside({ "a.yaml": "2" });
      await changed;
      await watch.close();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
      expect(await store.read("a.yaml")).toBe("2");
    });
  });
});
