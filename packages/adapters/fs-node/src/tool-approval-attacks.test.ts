// The file store attacked by someone who can write to the profile folder or
// copy files into it (HAL-2579, cases I9 and I12). The contract and
// `tool-approval-store.test.ts` cover the rest of the HAL-2579 store cases.

import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ToolApprovalKey } from "@halonicjs/ports";
import { toolApproval, waitingVersion } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileToolApprovalStore } from "./tool-approval-store.ts";

afterAll(removeTempFolders);

function hash(text: string): string {
  return createHash("sha256").update(text, "utf16le").digest("hex");
}

function folderFor(root: string, key: Omit<ToolApprovalKey, "name">): string {
  return join(root, hash(JSON.stringify([key.location, key.source])));
}

function fileFor(root: string, key: ToolApprovalKey): string {
  return join(folderFor(root, key), `${hash(key.name)}.json`);
}

const acme: ToolApprovalKey = { location: "/workspaces/acme", source: "notes", name: "lookup" };
const other: ToolApprovalKey = { ...acme, location: "/workspaces/other" };

verifies("fs-node.tool-approval-files", () => {
  it("doesn't believe an approval file copied in from another workspace (I9)", async () => {
    const root = await tempFolder();
    const store = new FileToolApprovalStore(root);
    await store.approve(toolApproval(acme));
    const copy = fileFor(root, other);
    await mkdir(dirname(copy), { recursive: true });
    await writeFile(copy, await readFile(fileFor(root, acme), "utf8"), "utf8");

    await expect(store.get(other)).rejects.toThrow("can't be read");
    await expect(store.list(other.location, "notes")).rejects.toThrow("can't be read");
    expect(await store.get(acme)).toEqual(toolApproval(acme));
  });

  it("doesn't believe a whole source folder copied in from another source (I9)", async () => {
    const root = await tempFolder();
    const store = new FileToolApprovalStore(root);
    await store.approve(toolApproval(acme));
    const mail = { ...acme, source: "mail" };
    await cp(folderFor(root, acme), folderFor(root, mail), { recursive: true });

    await expect(store.get(mail)).rejects.toThrow("can't be read");
    await expect(store.list(mail.location, "mail")).rejects.toThrow("can't be read");
  });

  it("keeps every approval and waiting version written to one source at once (I12)", async () => {
    const root = await tempFolder();
    const store = new FileToolApprovalStore(root);
    const approved = Array.from({ length: 6 }, (_, n) => `approved-${n}`);
    const noted = Array.from({ length: 6 }, (_, n) => `waiting-${n}`);
    await Promise.all([
      ...approved.map((name) => store.approve(toolApproval({ ...acme, name }))),
      ...noted.map((name, n) => store.noteWaiting({ ...acme, name }, waitingVersion(n))),
    ]);

    const names = (await store.list(acme.location, "notes")).map((approval) => approval.name);
    expect(names).toEqual(approved);
    const text = await readFile(join(folderFor(root, acme), "waiting.json"), "utf8");
    const waiting = (JSON.parse(text) as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(waiting.sort()).toEqual(noted);
    // Every write went through a rename, and the lock is given back.
    const left = await readdir(folderFor(root, acme));
    expect(left.filter((name) => name.endsWith(".tmp") || name === "lock")).toEqual([]);
  });
});
