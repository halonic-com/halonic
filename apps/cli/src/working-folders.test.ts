import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { programWorkingFolders } from "./working-folders.ts";

let temp: string;
let workspaceRoot: string;
let copy: string;

/** A workspace whose one harness agent, Coder, works in the default folder. */
const workspace = {
  files: [{ kind: "agent", hub: null, value: { id: "coder", harness: "claude-code" } }],
} as unknown as LoadedWorkspace;

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "halonic-cli-working-folders-")));
  workspaceRoot = join(temp, "acme");
  copy = join(temp, "copy");
  await mkdir(workspaceRoot);
  await mkdir(copy);
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

verifies("cli.local-engine", () => {
  it("refuses a program in a live run's copy the real workspace's working folders too", async () => {
    const folders = await programWorkingFolders(copy, workspaceRoot, workspace);

    expect(folders).toEqual([
      join(copy, "files", "agents", "coder"),
      join(workspaceRoot, "files", "agents", "coder"),
    ]);
  });

  it("names each folder once for a run that starts in the workspace itself", async () => {
    const folders = await programWorkingFolders(workspaceRoot, workspaceRoot, workspace);

    expect(folders).toEqual([join(workspaceRoot, "files", "agents", "coder")]);
  });
});
