import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDoctorWorkspace } from "./read-workspace.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-doctor-read-workspace-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The folder as a caller names it. */
function named() {
  return { root: folder, shown: "./acme", name: "acme" };
}

const options = { watchedFileLimit: 50_000, commandSearch: { path: "", endings: [] } };

describe("readDoctorWorkspace", () => {
  it("finds no workspace in a folder without workspace.yaml", async () => {
    expect(await readDoctorWorkspace(named(), options)).toBeNull();
  });

  it("reads the workspace's name, its real path and its provider files", async () => {
    writeFileSync(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
    mkdirSync(join(folder, "providers"));
    writeFileSync(
      join(folder, "providers", "ollama.yaml"),
      "id: ollama\ntype: ollama\nlocal: true\n",
    );

    const read = await readDoctorWorkspace(named(), options);

    expect(read?.workspace.name).toBe("Acme");
    expect(read?.location).toBe(realpathSync(folder));
    expect(read?.workspace.trust.location).toBe(realpathSync(folder));
    expect([...(read?.providerFiles.keys() ?? [])]).toEqual(["ollama"]);
    expect(read?.workspace.tooManyFilesToWatch).toBeUndefined();
  });

  it("says when the folder has more files than Studio watches", async () => {
    writeFileSync(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
    writeFileSync(join(folder, "notes.md"), "");

    const read = await readDoctorWorkspace(named(), { ...options, watchedFileLimit: 1 });

    expect(read?.workspace.tooManyFilesToWatch).toBe(1);
  });
});
