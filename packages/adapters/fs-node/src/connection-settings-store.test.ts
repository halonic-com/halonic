import { createHash } from "node:crypto";
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
import { ConnectionSettings } from "@halonicjs/app";
import type { ConnectionKey } from "@halonicjs/ports";
import { connectionSettings, connectionSettingsStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileConnectionSettingsStore } from "./connection-settings-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const mail: ConnectionKey = { location: "/workspaces/acme", connector: "mail" };
const docs: ConnectionKey = { location: "/workspaces/acme", connector: "docs" };

/** The file `FileConnectionSettingsStore` keeps the settings for `key` in. */
function fileFor(root: string, key: ConnectionKey): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([key.location, key.connector]), "utf16le")
    .digest("hex");
  return join(root, `${hash}.json`);
}

connectionSettingsStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileConnectionSettingsStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (key) => {
      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
});

verifies("fs-node.connection-settings-store-files", () => {
  describe("the files", () => {
    it("keeps each connector's settings in a file named by the hash of its key, key first", async () => {
      const root = join(await tempFolder(), "connections");
      const key = { location: "/Workspaces/Café", connector: "mail" };
      await new FileConnectionSettingsStore(root).save(connectionSettings(key.location));

      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      expect(text.startsWith('{\n  "location": "/Workspaces/Café",\n  "connector": "mail",')).toBe(
        true,
      );
      expect(JSON.parse(text)).toEqual(connectionSettings(key.location));
      expect(await readdir(root)).toEqual([file.slice(-69)]);
    });

    it("writes only the fields of the settings", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save({ ...connectionSettings(mail.location), extra: true } as never);

      expect(await store.get(mail)).toEqual(connectionSettings(mail.location));
    });

    it("keeps a location ending in / apart from a connector id starting with one", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings("/a/", "b"));

      expect(await store.get({ location: "/a", connector: "/b" })).toBeNull();
      expect(await readdir(root)).toHaveLength(1);
    });

    it("reads a folder that isn't there yet as having no settings", async () => {
      const store = new FileConnectionSettingsStore(join(await tempFolder(), "connections"));
      expect(await store.get(mail)).toBeNull();
      await store.remove(mail);
    });

    it("keeps sending switched on after the store is opened again, as after a restart", async () => {
      const root = join(await tempFolder(), "connections");
      const clock = { now: () => new Date("2026-11-10T08:00:00.000Z") };
      const before = new ConnectionSettings({
        store: new FileConnectionSettingsStore(root),
        clock,
      });
      await before.setAllowSending(mail, true);

      const after = new ConnectionSettings({ store: new FileConnectionSettingsStore(root), clock });
      expect(await after.checkSending(mail)).toEqual({ allowed: true });
      expect((await after.checkSending(docs)).allowed).toBe(false);
    });
  });

  describe("settings that can't be read", () => {
    it("doesn't let one connector borrow another connector's settings", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings(mail.location, mail.connector));
      // Settings copied over another connector's file.
      await writeFile(fileFor(root, docs), await readFile(fileFor(root, mail), "utf8"), "utf8");

      await expect(store.get(docs)).rejects.toThrow('"docs"');
      expect(await store.get(mail)).toEqual(connectionSettings(mail.location, mail.connector));
    });

    it("refuses settings copied from the same connector in another workspace", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings(mail.location, mail.connector));
      const other = { location: "/workspaces/other", connector: "mail" };
      await writeFile(fileFor(root, other), await readFile(fileFor(root, mail), "utf8"), "utf8");

      await expect(store.get(other)).rejects.toThrow('"mail" in "/workspaces/other"');
    });

    it.each([
      ["JSON that isn't an object", "null"],
      ["an array", "[]"],
      ["only an opening brace", "{"],
    ])("names the connector and its workspace when the file holds %s", async (_kind, text) => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await writeFile(fileFor(root, mail), text, "utf8");

      await expect(store.get(mail)).rejects.toThrow(
        'The settings of the connector "mail" in "/workspaces/acme" can\'t be read',
      );
      await store.remove(mail);
      expect(await store.get(mail)).toBeNull();
    });

    // A hand edit must not switch sending on by a value that only looks like "yes".
    it.each([
      ['"allowSending" as text', { allowSending: "true" }],
      ['"allowSending" as a number', { allowSending: 1 }],
      ['no "allowSending"', { allowSending: undefined }],
      ["a time that isn't text", { changedAt: 0 }],
      ["an extra field", { sendTo: "anyone" }],
    ])("refuses a file with %s", async (_kind, change) => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      const edited = JSON.stringify({ ...connectionSettings(mail.location), ...change });
      await writeFile(fileFor(root, mail), edited, "utf8");

      await expect(store.get(mail)).rejects.toThrow('"mail" in "/workspaces/acme"');
    });

    it("names the connector when its file is huge and not JSON", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await writeFile(fileFor(root, mail), "{".repeat(8 * 1024 * 1024), "utf8");

      await expect(store.get(mail)).rejects.toThrow('"mail" in "/workspaces/acme"');
      await store.remove(mail);
      expect(await store.get(mail)).toBeNull();
    });
  });

  describe("a file system error", () => {
    it("names the connector when its settings are a folder", async () => {
      const root = await tempFolder();
      await mkdir(join(fileFor(root, mail), "inside"), { recursive: true });

      await expect(new FileConnectionSettingsStore(root).get(mail)).rejects.toThrow('"mail"');
    });

    it("leaves no temporary file behind when a save fails", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, mail), "inside"), { recursive: true });

      await expect(store.save(connectionSettings(mail.location))).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });

  // File modes and symbolic links as Linux and macOS have them. CI runs this
  // package on Linux only; the trust and placement store tests skip the same
  // cases on Windows, which a new skip can't do until the guard can check its
  // decision note (HAL-58).
  describe("links and permissions", () => {
    it("makes the folder and the files private to the user", async () => {
      const root = join(await tempFolder(), "connections");
      await new FileConnectionSettingsStore(root).save(connectionSettings(mail.location));
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(fileFor(root, mail))).mode & 0o777).toBe(0o600);
    });

    /** Settings with sending on for `mail` in a file outside the store's root, such as in a workspace. */
    async function outsideSettings(): Promise<string> {
      const outside = join(await tempFolder(), "settings.json");
      await writeFile(outside, JSON.stringify(connectionSettings(mail.location)), "utf8");
      return outside;
    }

    // A link could put the settings in a file an agent may edit, such as one
    // inside its workspace.
    it("refuses settings that are a link to a file outside the folder", async () => {
      const root = join(await tempFolder(), "connections");
      await mkdir(root, { recursive: true });
      await symlink(await outsideSettings(), fileFor(root, mail));

      await expect(new FileConnectionSettingsStore(root).get(mail)).rejects.toThrow('"mail"');
    });

    it("refuses settings that are a hard link to a file outside the folder", async () => {
      const root = join(await tempFolder(), "connections");
      await mkdir(root, { recursive: true });
      await link(await outsideSettings(), fileFor(root, mail));

      await expect(new FileConnectionSettingsStore(root).get(mail)).rejects.toThrow('"mail"');
    });

    it("saves over a link without writing through it", async () => {
      const root = join(await tempFolder(), "connections");
      await mkdir(root, { recursive: true });
      const outside = await outsideSettings();
      const before = await readFile(outside, "utf8");
      await symlink(outside, fileFor(root, mail));

      await new FileConnectionSettingsStore(root).save(
        connectionSettings(mail.location, mail.connector, false),
      );
      expect(await readFile(outside, "utf8")).toBe(before);
      expect((await lstat(fileFor(root, mail))).isSymbolicLink()).toBe(false);
      expect((await stat(fileFor(root, mail))).mode & 0o777).toBe(0o600);
    });

    it("removes a link without touching what it points to", async () => {
      const root = join(await tempFolder(), "connections");
      await mkdir(root, { recursive: true });
      const outside = await outsideSettings();
      await symlink(outside, fileFor(root, mail));

      await new FileConnectionSettingsStore(root).remove(mail);
      expect(await readdir(root)).toEqual([]);
      expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(
        connectionSettings(mail.location),
      );
    });

    it("keeps a file private after it is saved over one anybody could read", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings(mail.location));
      await chmod(fileFor(root, mail), 0o666);

      await store.save(connectionSettings(mail.location, mail.connector, false));
      expect((await stat(fileFor(root, mail))).mode & 0o777).toBe(0o600);
    });

    // `mkdir` sets the mode only on a folder it creates, so a folder made
    // earlier by something else needs a `chmod`.
    it("makes a folder that was already there private on save", async () => {
      const root = join(await tempFolder(), "connections");
      await mkdir(root, { mode: 0o777 });
      await chmod(root, 0o777);

      await new FileConnectionSettingsStore(root).save(connectionSettings(mail.location));
      expect((await stat(root)).mode & 0o777).toBe(0o700);
    });
  });
});
