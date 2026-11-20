import { createHash } from "node:crypto";
import { mkdir, readFile, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const mebibyte = 1024 * 1024;

/**
 * Three files of 200 MiB: together more than the longest string V8 makes
 * (just under 512 MiB of UTF-16), so joining their text fails.
 */
const largeFileSize = 200 * mebibyte;
const largeFiles = ["repo/node_modules/acme/a.bin", "repo/node_modules/acme/b.bin", "repo/c.bin"];
const settings = "id: acme\nname: Acme\n";

/**
 * A workspace whose agents work in `repo/`, a folder of large files. Each is
 * made by extending an empty file, so on Linux and macOS it holds zeros
 * without taking up the disk.
 */
async function workspaceWithLargeFolder(): Promise<string> {
  const root = await tempFolder();
  await writeFiles(root, { "workspace.yaml": settings });
  for (const path of largeFiles) {
    const file = join(root, path);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "");
    await truncate(file, largeFileSize);
  }
  return root;
}

/** The version the port's format gives for that workspace, worked out over bytes rather than text. */
function expectedLargeVersion(): string {
  const hash = createHash("sha256");
  const zeros = new Uint8Array(mebibyte);
  for (const path of [...largeFiles].sort()) {
    hash.update(`${path}\n`);
    for (let written = 0; written < largeFileSize; written += mebibyte) {
      hash.update(zeros);
    }
    hash.update("\n\0");
  }
  hash.update(`workspace.yaml\n${settings}`);
  return `sha256:${hash.digest("hex").slice(0, 16)}`;
}

verifies("fs-node.definition-store-large-version", () => {
  it("gives the version of a workspace whose files hold more text than one string can", async () => {
    const store = new FolderDefinitionStore(await workspaceWithLargeFolder());
    expect(await store.version()).toBe(expectedLargeVersion());
  }, 120_000);

  it("gives the memory store's version for text read in pieces", async () => {
    // A stream reads 64 KiB at a time: "é" takes two bytes, the second one past the first piece.
    const splitCharacter = `${"a".repeat(64 * 1024 - 1)}é and on`;
    const root = await tempFolder();
    await writeFiles(root, {
      "agents/bom.agent.yaml": "\uFEFFid: bom\n",
      "repo/long.txt": splitCharacter,
      "workspace.yaml": settings,
    });
    await writeFile(
      join(root, "repo/not-utf8.bin"),
      new Uint8Array([0x61, 0xff, 0xc3, 0x0a, 0xe2, 0x82]),
    );
    const store = new FolderDefinitionStore(root);
    const files: Record<string, string> = {};
    for (const path of await store.list()) {
      files[path] = await readFile(join(root, path), "utf8");
    }
    expect(Object.keys(files)).toHaveLength(4);
    expect(await store.version()).toBe(await new MemoryDefinitionStore(files).version());
  });
});
