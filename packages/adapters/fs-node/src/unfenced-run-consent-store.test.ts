import { link, lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type MakeUnfencedRunConsentStore,
  unfencedRunConsent,
  unfencedRunConsentStoreContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileUnfencedRunConsentStore } from "./unfenced-run-consent-store.ts";

afterAll(removeTempFolders);

/** The file `FileUnfencedRunConsentStore` keeps the yes in. */
function fileIn(root: string): string {
  return join(root, "consent.json");
}

const makeStore: MakeUnfencedRunConsentStore = async () => {
  const root = join(await tempFolder(), "unfenced-runs");
  return {
    store: new FileUnfencedRunConsentStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async () => {
      const text = await readFile(fileIn(root), "utf8");
      await writeFile(fileIn(root), text.slice(0, text.length / 2), "utf8");
    },
  };
};
unfencedRunConsentStoreContract("file", makeStore);

/** A store whose file holds `text`, as a hand edit would leave it. */
async function storeHolding(text: string): Promise<FileUnfencedRunConsentStore> {
  const root = await tempFolder();
  await writeFile(fileIn(root), text, "utf8");
  return new FileUnfencedRunConsentStore(root);
}

verifies("fs-node.unfenced-run-consent-store-file", () => {
  describe("the file", () => {
    it("keeps the yes as JSON in one private file in a private folder", async () => {
      const root = join(await tempFolder(), "unfenced-runs");
      await new FileUnfencedRunConsentStore(root).save(unfencedRunConsent());

      expect(await readdir(root)).toEqual(["consent.json"]);
      expect(JSON.parse(await readFile(fileIn(root), "utf8"))).toEqual(unfencedRunConsent());
      if (process.platform !== "win32") {
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(fileIn(root))).mode & 0o777).toBe(0o600);
      }
    });

    it("writes only the fields of a yes", async () => {
      const root = await tempFolder();
      const store = new FileUnfencedRunConsentStore(root);
      await store.save({ ...unfencedRunConsent(), workspace: "/workspaces/acme" } as never);

      expect(await readFile(fileIn(root), "utf8")).not.toContain("workspace");
      expect(await store.get()).toEqual(unfencedRunConsent());
    });

    it("reads a folder that doesn't exist yet as no yes, and doesn't create it", async () => {
      const root = join(await tempFolder(), "unfenced-runs");
      expect(await new FileUnfencedRunConsentStore(root).get()).toBeNull();
      await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  // Liam's follow-up 3 on HAL-3385: JSON that parses is not yet a yes.
  describe("a file that isn't a yes", () => {
    const shapes: Record<string, string> = {
      "a list": JSON.stringify([unfencedRunConsent()]),
      null: "null",
      text: JSON.stringify("windows"),
      "no time": JSON.stringify({ reason: "container" }),
      "no reason": JSON.stringify({ allowedAt: "2026-11-09T10:00:00.000Z" }),
      "an empty reason": JSON.stringify({ reason: "", allowedAt: "2026-11-09T10:00:00.000Z" }),
      "a reason that isn't text": JSON.stringify({
        reason: 1,
        allowedAt: "2026-11-09T10:00:00.000Z",
      }),
      "a time that isn't a time": JSON.stringify({ reason: "container", allowedAt: "soon" }),
      "a field more": JSON.stringify({ ...unfencedRunConsent("container"), always: true }),
    };

    for (const [name, text] of Object.entries(shapes)) {
      it(`can't be read when it holds ${name}`, async () => {
        const store = await storeHolding(text);
        await expect(store.get()).rejects.toThrow("can't be read");
      });
    }

    it("keeps what the file holds out of the error", async () => {
      const store = await storeHolding(JSON.stringify({ reason: "container", allowedAt: "soon" }));
      const error: unknown = await store.get().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("container");
      expect((error as Error).message).not.toContain("soon");
      expect((error as Error).cause).toBeUndefined();
    });

    it("is removed by remove, and replaced by save", async () => {
      const store = await storeHolding(JSON.stringify({ reason: "container" }));
      await store.save(unfencedRunConsent("container"));
      expect(await store.get()).toEqual(unfencedRunConsent("container"));

      const other = await storeHolding("[]");
      await other.remove();
      expect(await other.get()).toBeNull();
    });
  });

  describe.skipIf(process.platform === "win32")("a yes that is a link", () => {
    /** A valid yes in a file outside the store's folder, such as in a workspace. */
    async function outsideYes(): Promise<string> {
      const outside = join(await tempFolder(), "consent.json");
      await writeFile(outside, JSON.stringify(unfencedRunConsent()), "utf8");
      return outside;
    }

    it("refuses a link to a valid yes outside the folder", async () => {
      const root = await tempFolder();
      await symlink(await outsideYes(), fileIn(root));

      await expect(new FileUnfencedRunConsentStore(root).get()).rejects.toMatchObject({
        message: expect.stringContaining("can't be read"),
        cause: expect.objectContaining({ message: expect.stringContaining("is a link") }),
      });
    });

    it("refuses a link to nothing rather than reading it as no yes", async () => {
      const root = await tempFolder();
      await symlink(join(await tempFolder(), "gone.json"), fileIn(root));

      await expect(new FileUnfencedRunConsentStore(root).get()).rejects.toThrow("can't be read");
    });

    it("refuses a hard link to a valid yes outside the folder", async () => {
      const root = await tempFolder();
      await link(await outsideYes(), fileIn(root));

      await expect(new FileUnfencedRunConsentStore(root).get()).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringContaining("is a hard link") }),
      });
    });

    it("saves over a link without writing through it", async () => {
      const outside = await outsideYes();
      const before = await readFile(outside, "utf8");
      const root = await tempFolder();
      await symlink(outside, fileIn(root));
      const store = new FileUnfencedRunConsentStore(root);

      await store.save(unfencedRunConsent("container"));
      expect(await readFile(outside, "utf8")).toBe(before);
      expect((await lstat(fileIn(root))).isSymbolicLink()).toBe(false);
      expect(await store.get()).toEqual(unfencedRunConsent("container"));
    });

    it("removes a link without touching what it points to", async () => {
      const outside = await outsideYes();
      const before = await readFile(outside, "utf8");
      const root = await tempFolder();
      await symlink(outside, fileIn(root));

      await new FileUnfencedRunConsentStore(root).remove();
      expect(await readdir(root)).toEqual([]);
      expect(await readFile(outside, "utf8")).toBe(before);
    });
  });

  it("leaves no temporary file behind when a save fails", async () => {
    const root = await tempFolder();
    // A folder with something in it can't be renamed over.
    await mkdir(join(fileIn(root), "inside"), { recursive: true });

    const store = new FileUnfencedRunConsentStore(root);
    await expect(store.save(unfencedRunConsent())).rejects.toThrow();
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
