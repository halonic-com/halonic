import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolApprovalKey } from "@halonicjs/ports";
import {
  listedToolFingerprint,
  toolApproval,
  toolApprovalStoreContract,
  waitingVersion,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileToolApprovalStore } from "./tool-approval-store.ts";

afterAll(removeTempFolders);

function hash(text: string): string {
  return createHash("sha256").update(text, "utf16le").digest("hex");
}

/** The folder `FileToolApprovalStore` keeps one source's files in. */
function folderFor(root: string, key: Omit<ToolApprovalKey, "name">): string {
  return join(root, hash(JSON.stringify([key.location, key.source])));
}

/** The file `FileToolApprovalStore` keeps the approval for `key` in. */
function fileFor(root: string, key: ToolApprovalKey): string {
  return join(folderFor(root, key), `${hash(key.name)}.json`);
}

const lookup: ToolApprovalKey = { location: "/workspaces/acme", source: "notes", name: "lookup" };

toolApprovalStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileToolApprovalStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (key) => {
      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
});

/** A store in a new folder, with the approval for `lookup` written. */
async function storeWithLookup() {
  const root = await tempFolder();
  const store = new FileToolApprovalStore(root);
  await store.approve(toolApproval());
  return { root, store, file: fileFor(root, lookup) };
}

verifies("fs-node.tool-approval-files", () => {
  describe("the files", () => {
    it("keeps each approval in its source's folder, named by hashes, format and key first", async () => {
      const { root, file } = await storeWithLookup();
      expect(await readdir(root)).toEqual([hash(JSON.stringify(["/workspaces/acme", "notes"]))]);
      const text = await readFile(file, "utf8");
      expect(
        text.startsWith(
          '{\n  "format": 1,\n  "location": "/workspaces/acme",\n  "source": "notes",\n  "name": "lookup",',
        ),
      ).toBe(true);
      expect((await readdir(folderFor(root, lookup))).sort()).toEqual(
        [`${hash("lookup")}.json`].sort(),
      );
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX modes: makes the folders and the files private to the user",
      async () => {
        const root = join(await tempFolder(), "tool-approvals");
        const store = new FileToolApprovalStore(root);
        await store.approve(toolApproval());
        await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(1));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(folderFor(root, lookup))).mode & 0o777).toBe(0o700);
        expect((await stat(fileFor(root, lookup))).mode & 0o777).toBe(0o600);
        expect((await stat(join(folderFor(root, lookup), "waiting.json"))).mode & 0o777).toBe(
          0o600,
        );
      },
    );

    it("lists only approval files, and leaves other files alone", async () => {
      const { root, store } = await storeWithLookup();
      const folder = folderFor(root, lookup);
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(1));
      await writeFile(join(folder, "notes.txt"), "mine", "utf8");
      await writeFile(`${fileFor(root, { ...lookup, name: "x" })}.0f1e.tmp`, "{", "utf8");

      expect(await store.list("/workspaces/acme", "notes")).toEqual([toolApproval()]);
      expect(await readFile(join(folder, "notes.txt"), "utf8")).toBe("mine");
    });

    it("loses no waiting tool when several are noted at once", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      const names = Array.from({ length: 12 }, (_, n) => `tool-${n}`);
      await Promise.all(
        names.map((name, n) => store.noteWaiting({ ...lookup, name }, waitingVersion(n))),
      );
      const text = await readFile(join(folderFor(root, lookup), "waiting.json"), "utf8");
      const noted = (JSON.parse(text) as { tools: { name: string }[] }).tools.map(
        (tool) => tool.name,
      );
      expect(noted.sort()).toEqual([...names].sort());
    });
  });

  describe("a folder inside the workspace", () => {
    it("is refused, so a workspace can't arrive with its tools approved", async () => {
      const workspace = await tempFolder();
      // `..profile` starts like a step out of the workspace, but is inside it.
      for (const root of [
        workspace,
        join(workspace, ".halonic", "approvals"),
        join(workspace, "..profile"),
      ]) {
        const store = new FileToolApprovalStore(root);
        const key = { ...lookup, location: workspace };
        await expect(store.get(key)).rejects.toThrow("inside the workspace");
        await expect(store.list(workspace, "notes")).rejects.toThrow("inside the workspace");
        await expect(store.approve(toolApproval(key))).rejects.toThrow("inside the workspace");
        await expect(store.noteWaiting(key, waitingVersion(1))).rejects.toThrow(
          "inside the workspace",
        );
      }
      expect(await readdir(workspace)).toEqual([]);
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links: is refused behind a link too",
      async () => {
        const folder = await tempFolder();
        const workspace = join(folder, "acme");
        await mkdir(join(workspace, "approvals"), { recursive: true });
        await symlink(join(workspace, "approvals"), join(folder, "profile"));
        const store = new FileToolApprovalStore(join(folder, "profile", "tool-approvals"));
        await expect(store.get({ ...lookup, location: workspace })).rejects.toThrow(
          "inside the workspace",
        );
      },
    );

    it("is allowed next to the workspace, even with a name that starts the same", async () => {
      const folder = await tempFolder();
      const store = new FileToolApprovalStore(join(folder, "acme-2", "tool-approvals"));
      const key = { ...lookup, location: join(folder, "acme") };
      await store.approve(toolApproval(key));
      expect(await store.get(key)).toEqual(toolApproval(key));
    });
  });

  describe("an approval that isn't as Halonic writes it", () => {
    /** Writes `change(record)` over the approval for `lookup`, as two-space JSON. */
    async function edited(change: (record: Record<string, unknown>) => unknown) {
      const { root, store, file } = await storeWithLookup();
      const record = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      await writeFile(file, `${JSON.stringify(change(record), null, 2)}\n`, "utf8");
      return { root, store, file };
    }

    it.each([
      [
        "an uppercase fingerprint",
        (r: Record<string, unknown>) => ({ ...r, fingerprint: `htl1:${"A".repeat(64)}` }),
      ],
      ["a short fingerprint", (r: Record<string, unknown>) => ({ ...r, fingerprint: "htl1:ab" })],
      ["a key it doesn't write", (r: Record<string, unknown>) => ({ ...r, offered: true })],
      ["no file format", (r: Record<string, unknown>) => ({ ...r, format: undefined })],
      [
        "a server it doesn't write",
        (r: Record<string, unknown>) => ({ ...r, server: { kind: "ftp" } }),
      ],
      [
        "headers as text",
        (r: Record<string, unknown>) => ({
          ...r,
          server: { kind: "http", url: "https://notes.example.com/mcp", headers: "Bearer abc" },
        }),
      ],
      [
        "a tool without parameters",
        (r: Record<string, unknown>) => ({
          ...r,
          tool: { name: "notes__lookup", description: "" },
        }),
      ],
      [
        "an approval time that isn't a date",
        (r: Record<string, unknown>) => ({ ...r, approvedAt: "yesterday" }),
      ],
      ["another tool's key", (r: Record<string, unknown>) => ({ ...r, name: "search" })],
      ["JSON that isn't an object", () => null],
    ])("can't be read when it holds %s", async (_kind, change) => {
      const { store } = await edited(change);
      await expect(store.get(lookup)).rejects.toThrow('tool "lookup" of "notes"');
      await expect(store.list("/workspaces/acme", "notes")).rejects.toThrow("can't be read");
      await store.revoke(lookup);
      expect(await store.list("/workspaces/acme", "notes")).toEqual([]);
    });

    it("can't be read when it holds a key twice", async () => {
      const { store, file } = await storeWithLookup();
      const text = await readFile(file, "utf8");
      // JSON.parse keeps the last, so the second fingerprint would win unseen.
      await writeFile(
        file,
        text.replace(
          '  "approvedAt"',
          `  "fingerprint": "${listedToolFingerprint(9)}",\n  "approvedAt"`,
        ),
        "utf8",
      );
      await expect(store.get(lookup)).rejects.toThrow("can't be read");
    });

    it("names the file when not even its tool can be read", async () => {
      const { store, file } = await storeWithLookup();
      await writeFile(file, "{", "utf8");
      await expect(store.list("/workspaces/acme", "notes")).rejects.toThrow(JSON.stringify(file));
    });

    it("doesn't believe a tool that isn't the one the file is named for", async () => {
      const { root, store, file } = await storeWithLookup();
      await writeFile(fileFor(root, { ...lookup, name: "search" }), await readFile(file, "utf8"));
      await expect(store.get({ ...lookup, name: "search" })).rejects.toThrow('"search"');
      await expect(store.list("/workspaces/acme", "notes")).rejects.toThrow("nor which tool");
    });

    it("is never written: an approval it couldn't read back is refused", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      const bad = { ...toolApproval(), fingerprint: "htl1:ab" as const };
      await expect(store.approve(bad)).rejects.toThrow("can't be stored");
      expect(await readdir(root)).toEqual([]);
    });
  });

  describe("files a newer Halonic wrote", () => {
    it.each([
      ["file format 2", (text: string) => text.replace('"format": 1', '"format": 2')],
      ["an htl2: fingerprint", (text: string) => text.replace('"htl1:', '"htl2:')],
    ])(
      "an approval with %s is neither read nor replaced, and revoke still deletes it",
      async (_kind, change) => {
        const { store, file } = await storeWithLookup();
        const newer = change(await readFile(file, "utf8"));
        await writeFile(file, newer, "utf8");

        await expect(store.get(lookup)).rejects.toThrow("written by a newer Halonic");
        await expect(store.approve(toolApproval({}, 2))).rejects.toThrow(
          "written by a newer Halonic",
        );
        expect(await readFile(file, "utf8")).toBe(newer);
        await store.revoke(lookup);
        expect(await store.get(lookup)).toBeNull();
      },
    );

    it("leaves waiting versions alone, and still approves", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      await store.noteWaiting(lookup, waitingVersion(1));
      const file = join(folderFor(root, lookup), "waiting.json");
      const newer = (await readFile(file, "utf8")).replace('"format": 1', '"format": 2');
      await writeFile(file, newer, "utf8");

      await expect(store.noteWaiting(lookup, waitingVersion(2))).rejects.toThrow(
        "written by a newer Halonic",
      );
      await store.approve(toolApproval());
      await store.revoke(lookup);
      expect(await readFile(file, "utf8")).toBe(newer);
    });
  });

  describe("waiting versions that can't be read", () => {
    it.each([
      ["half a file", (text: string) => text.slice(0, text.length / 2)],
      ["one tool twice", (text: string) => text.replace('"name": "search"', '"name": "lookup"')],
      ["another source", (text: string) => text.replace('"source": "notes"', '"source": "mail"')],
      ["a bad fingerprint", (text: string) => text.replace('"htl1:', '"htl1:x')],
      ["no tools", (text: string) => text.replace('"tools"', '"tool"')],
      [
        "a tool that isn't one",
        (text: string) => text.replace(/\{\s*"name": "search"/u, '"search", {"name": "search"'),
      ],
    ])("start again when the file holds %s", async (_kind, change) => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      await store.noteWaiting(lookup, waitingVersion(1, 0));
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(2, 0));
      const file = join(folderFor(root, lookup), "waiting.json");
      await writeFile(file, change(await readFile(file, "utf8")), "utf8");

      expect(await store.noteWaiting(lookup, waitingVersion(3, 1))).toEqual([waitingVersion(3, 1)]);
    });

    it("are removed when a tool is approved", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(1));
      const file = join(folderFor(root, lookup), "waiting.json");
      await writeFile(file, "{", "utf8");
      await store.approve(toolApproval());
      expect(await readdir(folderFor(root, lookup))).not.toContain("waiting.json");
    });
  });

  describe("a file system error", () => {
    it("names the tool when its approval is a folder", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      const file = fileFor(root, lookup);
      await mkdir(join(file, "inside"), { recursive: true });
      await expect(store.get(lookup)).rejects.toThrow('tool "lookup" of "notes"');
      await expect(store.list("/workspaces/acme", "notes")).rejects.toThrow(JSON.stringify(file));
    });

    it("leaves no temporary file behind when a write fails", async () => {
      const root = await tempFolder();
      const store = new FileToolApprovalStore(root);
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, lookup), "inside"), { recursive: true });
      await expect(store.approve(toolApproval())).rejects.toThrow();
      const left = await readdir(folderFor(root, lookup));
      expect(left.filter((name) => name.endsWith(".tmp") || name === "lock")).toEqual([]);
    });
  });
});
