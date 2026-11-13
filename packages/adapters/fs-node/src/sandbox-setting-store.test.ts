import {
  chmod,
  link,
  lstat,
  mkdir,
  readdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  sandboxChoiceOf,
  sandboxChoiceOfNone,
  sandboxSettingStoreContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileSandboxSettingStore } from "./sandbox-setting-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const fileName = "sandbox-setting.json";

sandboxSettingStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileSandboxSettingStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async () => {
      const text = await readFile(join(root, fileName), "utf8");
      await writeFile(join(root, fileName), text.slice(0, text.length / 2), "utf8");
    },
  };
});

verifies("fs-node.sandbox-setting-store-files", () => {
  describe("the file", () => {
    it("keeps the choice in one file, backend first", async () => {
      const root = join(await tempFolder(), "sandbox");
      await new FileSandboxSettingStore(root).save(sandboxChoiceOfNone("0.1.3"));

      expect(await readdir(root)).toEqual([fileName]);
      const text = await readFile(join(root, fileName), "utf8");
      expect(text.startsWith('{\n  "backend": "none",')).toBe(true);
      expect(JSON.parse(text)).toEqual(sandboxChoiceOfNone("0.1.3"));
    });

    it("reads a folder that isn't there yet as no choice", async () => {
      const store = new FileSandboxSettingStore(join(await tempFolder(), "sandbox"));
      expect(await store.get()).toBeNull();
      await store.remove();
    });

    it("makes the folder and the file private to the user (modes are checked where the system has them)", async () => {
      const root = join(await tempFolder(), "sandbox");
      await new FileSandboxSettingStore(root).save(sandboxChoiceOf("srt"));
      if (process.platform !== "win32") expect((await stat(root)).mode & 0o777).toBe(0o700);
      if (process.platform !== "win32")
        expect((await stat(join(root, fileName))).mode & 0o777).toBe(0o600);
    });

    it("leaves no temporary file behind when a save fails", async () => {
      const root = await tempFolder();
      // A folder with something in it can't be renamed over.
      await mkdir(join(root, fileName, "inside"), { recursive: true });

      await expect(
        new FileSandboxSettingStore(root).save(sandboxChoiceOf("srt")),
      ).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });
});

// Attacks on the file: anything an agent in a workspace, or a hand edit, could do to it.
verifies("fs-node.sandbox-setting-store-files", () => {
  describe("attacks on the sandbox choice file", () => {
    /** A store with a choice of `srt` saved, and the root it lives in. */
    async function saved() {
      const root = join(await tempFolder(), "sandbox");
      const store = new FileSandboxSettingStore(root);
      await store.save(sandboxChoiceOf("srt"));
      return { root, store };
    }

    it.each([
      ["JSON that isn't an object", "null"],
      ["an array", "[]"],
      ["only an opening brace", "{"],
      ["a backend that isn't listed", '{"backend":"docker","chosenAt":"2026-11-13T09:00:00.000Z"}'],
      ["a backend that isn't text", '{"backend":1,"chosenAt":"2026-11-13T09:00:00.000Z"}'],
      ["no time", '{"backend":"srt"}'],
      ["an extra field a launcher could read", '{"backend":"srt","chosenAt":"x","command":"sh"}'],
      ["none without an app version", '{"backend":"none","chosenAt":"x"}'],
    ])("refuses a file that holds %s, and removes it", async (_kind, text) => {
      const { root, store } = await saved();
      await writeFile(join(root, fileName), text, "utf8");

      await expect(store.get()).rejects.toThrow("The sandbox choice can't be read");
      await store.remove();
      expect(await store.get()).toBeNull();
    });

    it("names the choice when the file is huge and not JSON", async () => {
      const { root, store } = await saved();
      await writeFile(join(root, fileName), "{".repeat(8 * 1024 * 1024), "utf8");

      await expect(store.get()).rejects.toThrow("The sandbox choice can't be read");
    });

    describe("links and permissions", () => {
      /** A valid choice in a file outside the store's root, such as in a workspace. */
      async function outsideChoice(): Promise<string> {
        const outside = join(await tempFolder(), "choice.json");
        await writeFile(outside, JSON.stringify(sandboxChoiceOf("srt")), "utf8");
        return outside;
      }

      // A link could put the choice in a file an agent may edit.
      it("refuses a choice that is a link to a file outside the folder", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { recursive: true });
        await symlink(await outsideChoice(), join(root, fileName));

        await expect(new FileSandboxSettingStore(root).get()).rejects.toThrow(
          "The sandbox choice can't be read",
        );
      });

      // Any program can make a junction on Windows, without special rights.
      it("refuses a choice that is a junction", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { recursive: true });
        await symlink(await tempFolder(), join(root, fileName), "junction");

        await expect(new FileSandboxSettingStore(root).get()).rejects.toThrow(
          "The sandbox choice can't be read",
        );
      });

      it("refuses a choice that is a hard link to a file outside the folder", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { recursive: true });
        await link(await outsideChoice(), join(root, fileName));

        await expect(new FileSandboxSettingStore(root).get()).rejects.toThrow(
          "The sandbox choice can't be read",
        );
      });

      it("saves over a link without writing through it", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { recursive: true });
        const outside = await outsideChoice();
        const before = await readFile(outside, "utf8");
        await symlink(outside, join(root, fileName));

        await new FileSandboxSettingStore(root).save(sandboxChoiceOf("mxc"));
        expect(await readFile(outside, "utf8")).toBe(before);
        expect((await lstat(join(root, fileName))).isSymbolicLink()).toBe(false);
      });

      it("removes a link without touching what it points to", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { recursive: true });
        const outside = await outsideChoice();
        await symlink(outside, join(root, fileName));

        await new FileSandboxSettingStore(root).remove();
        expect(await readdir(root)).toEqual([]);
        expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(sandboxChoiceOf("srt"));
      });

      it("keeps the file private after it is saved over one anybody could read (modes are checked where the system has them)", async () => {
        const { root, store } = await saved();
        await chmod(join(root, fileName), 0o666);

        await store.save(sandboxChoiceOf("mxc"));
        if (process.platform !== "win32")
          expect((await stat(join(root, fileName))).mode & 0o777).toBe(0o600);
      });

      it("makes a folder that was already there private on save (modes are checked where the system has them)", async () => {
        const root = join(await tempFolder(), "sandbox");
        await mkdir(root, { mode: 0o777 });
        await chmod(root, 0o777);

        await new FileSandboxSettingStore(root).save(sandboxChoiceOf("srt"));
        if (process.platform !== "win32") expect((await stat(root)).mode & 0o777).toBe(0o700);
      });
    });
  });
});
