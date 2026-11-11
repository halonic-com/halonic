import { chmod, lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostSettingsStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { FolderEvents } from "./folder-watch.ts";
import { FileHostSettingsStore } from "./host-settings-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** The file `FileHostSettingsStore` keeps the settings in. */
function fileIn(root: string): string {
  return join(root, "host.json");
}

hostSettingsStoreContract("file", async () => {
  const root = join(await tempFolder(), "settings");
  return {
    store: new FileHostSettingsStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async () => {
      const text = await readFile(fileIn(root), "utf8");
      await writeFile(fileIn(root), text.slice(0, text.length / 2), "utf8");
    },
    // Another window or the CLI: a store of its own on the same folder.
    changeElsewhere: (key, value) => new FileHostSettingsStore(root).set(key, value),
  };
});

/** A store whose file holds `text`, as a hand edit would leave it. */
async function storeHolding(text: string): Promise<FileHostSettingsStore> {
  const root = await tempFolder();
  await writeFile(fileIn(root), text, "utf8");
  return new FileHostSettingsStore(root);
}

verifies("fs-node.host-settings-store", () => {
  describe("the file", () => {
    it("keeps the settings as versioned JSON in one private file in a private folder", async () => {
      const root = join(await tempFolder(), "settings");
      await new FileHostSettingsStore(root).set("assistant.turn-limit", 20);

      expect(await readdir(root)).toEqual(["host.json"]);
      expect(JSON.parse(await readFile(fileIn(root), "utf8"))).toEqual({
        version: 1,
        values: { "assistant.turn-limit": 20 },
      });
      if (process.platform !== "win32") {
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(fileIn(root))).mode & 0o777).toBe(0o600);
      }
    });

    it("reads a folder that doesn't exist yet as none saved, and doesn't create it", async () => {
      const root = join(await tempFolder(), "settings");
      expect(await new FileHostSettingsStore(root).read()).toEqual({});
      await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("keeps both of two saves made at once", async () => {
      const store = new FileHostSettingsStore(await tempFolder());
      await Promise.all([
        store.set("assistant.turn-limit", 20),
        store.set("assistant.connector-tools", false),
      ]);
      expect(await store.read()).toEqual({
        "assistant.turn-limit": 20,
        "assistant.connector-tools": false,
      });
    });
  });

  describe("a file that isn't the settings' shape", () => {
    const shapes: Record<string, string> = {
      "a list": "[]",
      null: "null",
      "no values": JSON.stringify({ version: 1 }),
      "values that are a list": JSON.stringify({ version: 1, values: [16] }),
      "values that are null": JSON.stringify({ version: 1, values: null }),
    };
    for (const [shape, text] of Object.entries(shapes)) {
      it(`reads ${shape} as none saved`, async () => {
        expect(await (await storeHolding(text)).read()).toEqual({});
      });
    }

    it("leaves out a key no setting can have", async () => {
      const text = JSON.stringify({
        version: 1,
        values: { "assistant.turn-limit": 20, "../host.json": 1, turn: 2 },
      });
      expect(await (await storeHolding(text)).read()).toEqual({ "assistant.turn-limit": 20 });
    });
  });

  describe("a file that can't be read", () => {
    it("refuses a link, names the file, and replaces the link on a save", async () => {
      const root = await tempFolder();
      const elsewhere = join(await tempFolder(), "workspace-settings.json");
      const planted = JSON.stringify({ version: 1, values: { "assistant.model": "planted" } });
      await writeFile(elsewhere, planted, "utf8");
      await symlink(elsewhere, fileIn(root));
      const store = new FileHostSettingsStore(root);

      await expect(store.read()).rejects.toThrow(`The settings in ${JSON.stringify(fileIn(root))}`);
      await store.set("assistant.turn-limit", 20);
      expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
      expect(await readFile(elsewhere, "utf8")).toBe(planted);
    });

    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
      "throws on a save when the file can't be read, and changes nothing",
      async () => {
        const root = await tempFolder();
        const store = new FileHostSettingsStore(root);
        await store.set("assistant.turn-limit", 20);
        await chmod(fileIn(root), 0o000);
        try {
          await expect(store.set("assistant.turn-limit", 24)).rejects.toThrow("can't be read");
        } finally {
          await chmod(fileIn(root), 0o600);
        }
        expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
      },
    );

    it("removes its temporary file when the rename fails", async () => {
      const root = await tempFolder();
      // A folder with something in it where the file goes: no rename replaces it.
      await mkdir(join(fileIn(root), "kept"), { recursive: true });
      const store = new FileHostSettingsStore(root);
      await expect(store.set("assistant.turn-limit", 20)).rejects.toThrow();
      expect(await readdir(root)).toEqual(["host.json"]);
    });
  });

  describe("watching", () => {
    it("creates the private folder, and tells only of the settings file", async () => {
      const root = join(await tempFolder(), "settings");
      let noticed: (name: string) => void = () => undefined;
      let failed: (error: Error) => void = () => undefined;
      const stop = vi.fn();
      const events: FolderEvents = (_root, onNoticed, onFailed) => {
        noticed = onNoticed;
        failed = onFailed;
        return stop;
      };
      const listener = vi.fn();
      const stopWatching = new FileHostSettingsStore(root, { events }).watch(listener);

      expect((await stat(root)).isDirectory()).toBe(true);
      if (process.platform !== "win32") expect((await stat(root)).mode & 0o777).toBe(0o700);
      noticed("host.json.0b6c.tmp");
      noticed("notes.txt");
      expect(listener).not.toHaveBeenCalled();
      noticed("host.json");
      noticed("");
      failed(new Error("the watch broke"));
      expect(listener).toHaveBeenCalledTimes(3);
      stopWatching();
      expect(stop).toHaveBeenCalledOnce();
    });
  });
});
