import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { readCase } from "./cases.ts";
import { composeWorkspace } from "./compose.ts";
import { TestFolders } from "./test-folders.ts";

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

function fixturesWith(caseDescription: object, caseFiles: Record<string, string> = {}): string {
  const fixtures = folders.make();
  const base = { about: "base", kind: "workspace", fault: "valid" };
  folders.write(fixtures, {
    "base/case.json": JSON.stringify(base),
    "base/files/workspace.yaml": "id: acme\n",
    "base/files/models.yaml": "aliases: {}\n",
    "cases/models/x/case.json": JSON.stringify(caseDescription),
  });
  for (const [path, text] of Object.entries(caseFiles)) {
    folders.write(fixtures, { [`cases/models/x/files/${path}`]: text });
  }
  return fixtures;
}

const about = { about: "x", kind: "models", fault: "valid" };

verifies("parity.compose-case-workspace", () => {
  it("puts the case's files over the base", () => {
    const fixtures = fixturesWith(about, { "models.yaml": "aliases: []\n", "extra/a.yaml": "a\n" });
    const target = join(folders.make(), "workspace");
    const files = composeWorkspace(
      fixtures,
      readCase("models/x", join(fixtures, "cases/models/x")),
      target,
    );
    expect(files).toEqual(["extra/a.yaml", "models.yaml", "workspace.yaml"]);
    expect(readFileSync(join(target, "models.yaml"), "utf8")).toBe("aliases: []\n");
    expect(readFileSync(join(target, "workspace.yaml"), "utf8")).toBe("id: acme\n");
  });

  it("builds the base on its own", () => {
    const fixtures = fixturesWith(about);
    const target = folders.make();
    expect(composeWorkspace(fixtures, readCase("base", join(fixtures, "base")), target)).toEqual([
      "models.yaml",
      "workspace.yaml",
    ]);
  });

  it("deletes the files the case removes", () => {
    const fixtures = fixturesWith({ ...about, remove: ["workspace.yaml"] });
    const files = composeWorkspace(
      fixtures,
      readCase("models/x", join(fixtures, "cases/models/x")),
      folders.make(),
    );
    expect(files).toEqual(["models.yaml"]);
  });

  it("refuses to remove a file the workspace doesn't have", () => {
    const fixtures = fixturesWith({ ...about, remove: ["nothing.yaml"] });
    const parityCase = readCase("models/x", join(fixtures, "cases/models/x"));
    expect(() => composeWorkspace(fixtures, parityCase, folders.make())).toThrow(
      'case models/x: cannot remove "nothing.yaml", the workspace has no such file',
    );
  });
});
