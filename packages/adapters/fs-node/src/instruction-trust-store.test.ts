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
import type { InstructionTrustKey } from "@halonicjs/ports";
import {
  instructionTrustRecord,
  instructionTrustStoreContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileInstructionTrustStore } from "./instruction-trust-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const coder: InstructionTrustKey = { location: "/workspaces/acme", agent: "coder" };
const writer: InstructionTrustKey = { location: "/workspaces/acme", agent: "writer" };

/** The file `FileInstructionTrustStore` keeps the record for `key` in. */
function fileFor(root: string, key: InstructionTrustKey): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([key.location, key.agent]), "utf16le")
    .digest("hex");
  return join(root, `${hash}.json`);
}

instructionTrustStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileInstructionTrustStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (key) => {
      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
});

verifies("fs-node.instruction-trust-store-files", () => {
  describe("the files", () => {
    it("keeps each record in a file named by the hash of its key, key first", async () => {
      const root = join(await tempFolder(), "instruction-trust");
      const key = { location: "/Workspaces/Café", agent: "coder" };
      await new FileInstructionTrustStore(root).save(
        instructionTrustRecord(key.location, key.agent),
      );

      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      expect(text.startsWith('{\n  "location": "/Workspaces/Café",\n  "agent": "coder",')).toBe(
        true,
      );
      expect(JSON.parse(text)).toEqual(instructionTrustRecord(key.location, key.agent));
      expect(await readdir(root)).toEqual([file.slice(-69)]);
    });

    it("reads a folder that isn't there yet as having no records", async () => {
      const store = new FileInstructionTrustStore(join(await tempFolder(), "instruction-trust"));
      expect(await store.get(coder)).toBeNull();
      await store.remove(coder);
    });

    it("makes the folder and the files private to the user", async () => {
      const root = join(await tempFolder(), "instruction-trust");
      await new FileInstructionTrustStore(root).save(
        instructionTrustRecord(coder.location, coder.agent),
      );
      // Windows has no POSIX modes; there the profile folder's access rules apply.
      if (process.platform === "win32") return;
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(fileFor(root, coder))).mode & 0o777).toBe(0o600);
    });
  });

  describe("a record that can't be read", () => {
    it("doesn't let one agent borrow another agent's trust", async () => {
      const root = await tempFolder();
      const store = new FileInstructionTrustStore(root);
      await store.save(instructionTrustRecord(coder.location, coder.agent));
      await writeFile(fileFor(root, writer), await readFile(fileFor(root, coder), "utf8"), "utf8");

      await expect(store.get(writer)).rejects.toThrow('"writer"');
      expect(await store.get(coder)).toEqual(instructionTrustRecord(coder.location, coder.agent));
    });

    it.each([
      ["JSON that isn't an object", "null"],
      ["only an opening brace", "{"],
    ])("names the agent and its workspace when the file holds %s", async (_kind, text) => {
      const root = await tempFolder();
      const store = new FileInstructionTrustStore(root);
      await writeFile(fileFor(root, coder), text, "utf8");

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
      await store.remove(coder);
      expect(await store.get(coder)).toBeNull();
    });

    // Not only the key: any other shape is damaged too, so a hand edit can't
    // make instructions count as trusted.
    it.each([
      ["a digest that isn't sha256", { pin: { digest: "md5:aa", files: {} } }],
      [
        "a file digest that is too short",
        { pin: { digest: `sha256:${"a".repeat(64)}`, files: { "AGENTS.md": "sha256:00" } } },
      ],
      ["no pin", { pin: undefined }],
      ["a time that isn't text", { grantedAt: 0 }],
      ["an extra field", { trusted: true }],
    ])("refuses a file with %s", async (_kind, change) => {
      const root = await tempFolder();
      const store = new FileInstructionTrustStore(root);
      const record = { ...instructionTrustRecord(coder.location, coder.agent), ...change };
      await writeFile(fileFor(root, coder), JSON.stringify(record), "utf8");

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
    });

    it("names the agent when its record is a folder", async () => {
      const root = await tempFolder();
      await mkdir(join(fileFor(root, coder), "inside"), { recursive: true });

      await expect(new FileInstructionTrustStore(root).get(coder)).rejects.toThrow('"coder"');
    });

    it("leaves no temporary file behind when a save fails", async () => {
      const root = await tempFolder();
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, coder), "inside"), { recursive: true });

      await expect(
        new FileInstructionTrustStore(root).save(
          instructionTrustRecord(coder.location, coder.agent),
        ),
      ).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });

  // A link could put the record in a file an agent may edit, such as one
  // inside its workspace, and so let the agent trust its own instructions.
  describe("links and permissions", () => {
    /** A valid record for `coder` in a file outside the store's root, such as in a workspace. */
    async function outsideRecord(): Promise<string> {
      const outside = join(await tempFolder(), "trusted.json");
      await writeFile(
        outside,
        JSON.stringify(instructionTrustRecord(coder.location, coder.agent)),
        "utf8",
      );
      return outside;
    }

    async function emptyRoot(): Promise<string> {
      const root = join(await tempFolder(), "instruction-trust");
      await mkdir(root, { recursive: true });
      return root;
    }

    it("refuses a record that is a link to a file outside the folder", async () => {
      const root = await emptyRoot();
      await symlink(await outsideRecord(), fileFor(root, coder));

      await expect(new FileInstructionTrustStore(root).get(coder)).rejects.toThrow('"coder"');
    });

    // Any program can make a junction on Windows, without special rights.
    it("refuses a record that is a junction", async () => {
      const root = await emptyRoot();
      await symlink(await tempFolder(), fileFor(root, coder), "junction");

      await expect(new FileInstructionTrustStore(root).get(coder)).rejects.toThrow('"coder"');
    });

    it("refuses a record that is a hard link to a file outside the folder", async () => {
      const root = await emptyRoot();
      await link(await outsideRecord(), fileFor(root, coder));

      await expect(new FileInstructionTrustStore(root).get(coder)).rejects.toThrow('"coder"');
    });

    it("saves over a link without writing through it", async () => {
      const root = await emptyRoot();
      const outside = await outsideRecord();
      const before = await readFile(outside, "utf8");
      await symlink(outside, fileFor(root, coder));

      await new FileInstructionTrustStore(root).save(
        instructionTrustRecord(coder.location, coder.agent, "c"),
      );
      expect(await readFile(outside, "utf8")).toBe(before);
      expect((await lstat(fileFor(root, coder))).isSymbolicLink()).toBe(false);
    });

    it("removes a link without touching what it points to", async () => {
      const root = await emptyRoot();
      const outside = await outsideRecord();
      await symlink(outside, fileFor(root, coder));

      await new FileInstructionTrustStore(root).remove(coder);
      expect(await readdir(root)).toEqual([]);
      expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(
        instructionTrustRecord(coder.location, coder.agent),
      );
    });

    it("keeps a file and a folder private when they were already there", async () => {
      const root = await emptyRoot();
      const store = new FileInstructionTrustStore(root);
      await store.save(instructionTrustRecord(coder.location, coder.agent));
      if (process.platform !== "win32") {
        await chmod(fileFor(root, coder), 0o666);
        await chmod(root, 0o777);
      }

      await store.save(instructionTrustRecord(coder.location, coder.agent, "c"));
      if (process.platform === "win32") return;
      expect((await stat(fileFor(root, coder))).mode & 0o777).toBe(0o600);
      expect((await stat(root)).mode & 0o777).toBe(0o700);
    });
  });
});
