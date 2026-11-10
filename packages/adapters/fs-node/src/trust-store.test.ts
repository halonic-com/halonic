import { execFile } from "node:child_process";
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
import { promisify } from "node:util";
import { TrustService } from "@halonicjs/app";
import type { Digest } from "@halonicjs/ports";
import {
  type MakeTrustStore,
  trustRecord,
  trustServiceAttackContract,
  trustStoreContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileTrustStore } from "./trust-store.ts";

afterAll(removeTempFolders);

/** The file `FileTrustStore` keeps the record for `location` in. */
function fileFor(root: string, location: string): string {
  return join(root, `${createHash("sha256").update(location, "utf16le").digest("hex")}.json`);
}

const makeTrustStore: MakeTrustStore = async () => {
  const root = await tempFolder();
  return {
    store: new FileTrustStore(root),
    // Cut the file in half, as a crash or a full disk would. The contract's
    // locations are short, so the location line always survives; the tests
    // below cover a file whose location can't be read.
    damage: async (location) => {
      const file = fileFor(root, location);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
};
trustStoreContract("file", makeTrustStore);

// The attack cases through the real trust check, with records in files.
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(createHash("sha256").update(data).digest());
  },
};
const clock = { now: () => new Date("2026-11-10T10:00:00.000Z") };
trustServiceAttackContract(
  "file",
  makeTrustStore,
  (store) => new TrustService({ store, digest, clock, appVersion: "0.1.0" }),
);

verifies("fs-node.trust-store-files", () => {
  describe("the files", () => {
    it("keeps each record in a file named by the hash of its location, location first", async () => {
      const root = await tempFolder();
      await new FileTrustStore(join(root, "trust")).grant(trustRecord("/Workspaces/Café"));

      const file = fileFor(join(root, "trust"), "/Workspaces/Café");
      const text = await readFile(file, "utf8");
      expect(text.startsWith('{\n  "location": "/Workspaces/Café",')).toBe(true);
      expect(JSON.parse(text)).toEqual(trustRecord("/Workspaces/Café"));
      expect(await readdir(join(root, "trust"))).toEqual([file.slice(-69)]);
    });

    it("keeps locations with different lone surrogates in different files", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/a\uD800"));
      await store.grant(trustRecord("/a\uD801"));

      expect(await readdir(root)).toHaveLength(2);
      expect(await store.get("/a\uD800")).toEqual(trustRecord("/a\uD800"));
      expect(await store.get("/a\uD801")).toEqual(trustRecord("/a\uD801"));
      expect(await store.list()).toEqual([trustRecord("/a\uD800"), trustRecord("/a\uD801")]);
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links, modes and signals: makes the folder and the files private to the user",
      async () => {
        const root = join(await tempFolder(), "trust");
        await new FileTrustStore(root).grant(trustRecord("/workspaces/acme"));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(fileFor(root, "/workspaces/acme"))).mode & 0o777).toBe(0o600);
      },
    );

    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links, modes and signals: makes a folder that was already there private on grant",
      async () => {
        const root = join(await tempFolder(), "trust");
        await mkdir(root);
        await chmod(root, 0o777);
        await new FileTrustStore(root).grant(trustRecord("/workspaces/acme"));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
      },
    );

    it("reads a folder that isn't there yet as empty", async () => {
      const store = new FileTrustStore(join(await tempFolder(), "trust"));
      expect(await store.get("/workspaces/acme")).toBeNull();
      expect(await store.list()).toEqual([]);
      await store.revoke("/workspaces/acme");
    });

    it("lists only record files, and leaves other files alone", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      await writeFile(join(root, "notes.txt"), "mine", "utf8");
      await writeFile(`${fileFor(root, "/workspaces/zeta")}.0f1e.tmp`, "{", "utf8");

      expect(await store.list()).toEqual([trustRecord("/workspaces/acme")]);
      expect(await readFile(join(root, "notes.txt"), "utf8")).toBe("mine");
    });
  });

  describe("a record that can't be read", () => {
    it("names the file when not even its location can be read, and revoke still deletes it", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      const file = fileFor(root, "/workspaces/acme");
      await writeFile(file, "{", "utf8");

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(file));
      await store.revoke("/workspaces/acme");
      expect(await store.list()).toEqual([]);
    });

    it("doesn't believe a location that isn't the one the file is named for", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/acme"));
      // A record copied over another location's file.
      await writeFile(
        fileFor(root, "/workspaces/zeta"),
        await readFile(fileFor(root, "/workspaces/acme"), "utf8"),
        "utf8",
      );

      await expect(store.get("/workspaces/zeta")).rejects.toThrow('"/workspaces/zeta"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(fileFor(root, "/workspaces/zeta")));
      expect(await store.get("/workspaces/acme")).toEqual(trustRecord("/workspaces/acme"));
    });

    it.each([
      ["JSON that isn't an object", "null"],
      ["a location with a broken escape", '{"location": "/workspaces/\\u12"}'],
    ])("can't be read when the file holds %s", async (_kind, text) => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await writeFile(fileFor(root, "/workspaces/acme"), text, "utf8");

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow("can't be read");
    });
  });

  // A link could put a record in a file an agent may edit, such as one inside
  // its workspace, so the agent could trust a workspace itself (HAL-2978).
  describe("a record that is a link", () => {
    const acme = "/workspaces/acme";

    /** A valid record for `acme` in a file outside the store's root, such as in a workspace. */
    async function outsideRecord(): Promise<string> {
      const outside = join(await tempFolder(), "trust.json");
      await writeFile(outside, JSON.stringify(trustRecord(acme)), "utf8");
      return outside;
    }

    /** A store whose record for `acme` is a link to `target`. */
    async function linkedStore(target: string): Promise<{ root: string; store: FileTrustStore }> {
      const root = join(await tempFolder(), "trust");
      await mkdir(root, { recursive: true });
      await symlink(target, fileFor(root, acme));
      return { root, store: new FileTrustStore(root) };
    }

    it("refuses a link to a valid record outside the folder", async () => {
      const { root, store } = await linkedStore(await outsideRecord());

      await expect(store.get(acme)).rejects.toThrow(JSON.stringify(acme));
      await expect(store.list()).rejects.toThrow(JSON.stringify(fileFor(root, acme)));
    });

    it("says the record is a link", async () => {
      const { store } = await linkedStore(await outsideRecord());

      await expect(store.get(acme)).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining("is a link") }),
      });
    });

    it("refuses a link to nothing rather than reading it as no record", async () => {
      const { store } = await linkedStore(join(await tempFolder(), "gone.json"));

      await expect(store.get(acme)).rejects.toThrow(JSON.stringify(acme));
      await expect(store.list()).rejects.toThrow("can't be read");
    });

    it("refuses a link to another record in the folder", async () => {
      const root = join(await tempFolder(), "trust");
      const store = new FileTrustStore(root);
      await store.grant(trustRecord("/workspaces/zeta"));
      await symlink(fileFor(root, "/workspaces/zeta"), fileFor(root, acme));

      await expect(store.get(acme)).rejects.toThrow(JSON.stringify(acme));
      expect(await store.get("/workspaces/zeta")).toEqual(trustRecord("/workspaces/zeta"));
    });

    // Any program can make a junction on Windows, without special rights.
    it("refuses a junction in the record's place", async () => {
      const root = join(await tempFolder(), "trust");
      await mkdir(root, { recursive: true });
      await symlink(await tempFolder(), fileFor(root, acme), "junction");
      const store = new FileTrustStore(root);

      await expect(store.get(acme)).rejects.toMatchObject({
        message: expect.stringContaining(JSON.stringify(acme)),
        cause: expect.objectContaining({ message: expect.stringContaining("is a link") }),
      });
      await expect(store.list()).rejects.toThrow(JSON.stringify(fileFor(root, acme)));
    });

    it("grants over a link without writing through it", async () => {
      const outside = await outsideRecord();
      const before = await readFile(outside, "utf8");
      const { root, store } = await linkedStore(outside);

      await store.grant(trustRecord(acme));
      expect(await readFile(outside, "utf8")).toBe(before);
      expect((await lstat(fileFor(root, acme))).isSymbolicLink()).toBe(false);
      if (process.platform !== "win32") {
        expect((await stat(fileFor(root, acme))).mode & 0o777).toBe(0o600);
      }
      expect(await store.list()).toEqual([trustRecord(acme)]);
    });

    it("revokes a link without touching what it points to", async () => {
      const outside = await outsideRecord();
      const { root, store } = await linkedStore(outside);

      await store.revoke(acme);
      expect(await readdir(root)).toEqual([]);
      expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(trustRecord(acme));
    });

    // A hard link is a second name for the workspace file itself, so `lstat`
    // doesn't see a link; only its count of names gives it away (HAL-2985).
    it("refuses a hard link to a valid record outside the folder", async () => {
      const root = join(await tempFolder(), "trust");
      await mkdir(root, { recursive: true });
      await link(await outsideRecord(), fileFor(root, acme));
      const store = new FileTrustStore(root);

      await expect(store.get(acme)).rejects.toMatchObject({
        message: expect.stringContaining(JSON.stringify(acme)),
        cause: expect.objectContaining({ message: expect.stringContaining("is a hard link") }),
      });
      await expect(store.list()).rejects.toThrow(JSON.stringify(fileFor(root, acme)));
    });
  });

  describe("a file system error", () => {
    it("names the location or the file when a record is a folder", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      const file = fileFor(root, "/workspaces/acme");
      await mkdir(join(file, "inside"), { recursive: true });

      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      await expect(store.list()).rejects.toThrow(JSON.stringify(file));
    });

    // Opening a named pipe waits for a writer, so reading one would hang (HAL-2985).
    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links, modes and signals: refuses a named pipe rather than waiting on it",
      async () => {
        const root = await tempFolder();
        const store = new FileTrustStore(root);
        const file = fileFor(root, "/workspaces/acme");
        await promisify(execFile)("mkfifo", [file]);

        await expect(store.get("/workspaces/acme")).rejects.toMatchObject({
          message: expect.stringContaining('"/workspaces/acme"'),
          cause: expect.objectContaining({
            message: expect.stringContaining("isn't a plain file"),
          }),
        });
        await expect(store.list()).rejects.toThrow(JSON.stringify(file));
      },
    );

    it("leaves no temporary file behind when a grant fails", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, "/workspaces/acme"), "inside"), { recursive: true });

      await expect(store.grant(trustRecord("/workspaces/acme"))).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
      "[platform:win32] needs POSIX links, modes and signals: passes on an error reading the folder",
      async () => {
        const root = await tempFolder();
        const store = new FileTrustStore(root);
        await store.grant(trustRecord("/workspaces/acme"));
        await chmod(root, 0o000);
        try {
          await expect(store.list()).rejects.toThrow("EACCES");
        } finally {
          await chmod(root, 0o700);
        }
      },
    );
  });
});
