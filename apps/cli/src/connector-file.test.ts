import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { connectorFileOf, isIntegrationConnector } from "./connector-file.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-connector-file-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Acme with an integration's connector `issues` and a program's connector `handbook`. */
async function acme(): Promise<LoadedWorkspace> {
  const files = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/issues.connector.yaml":
      "name: Issues\ntransport:\n  integration:\n    folder: issues\n",
    "library/connectors/handbook.connector.yaml":
      "name: Handbook\ntransport:\n  stdio:\n    command: handbook-server\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

verifies("cli.run-connector-warning", () => {
  it("tells an integration's connector from a program's and from one with no file", async () => {
    const workspace = await acme();

    expect(isIntegrationConnector(workspace, "issues")).toBe(true);
    expect(isIntegrationConnector(workspace, "handbook")).toBe(false);
    expect(isIntegrationConnector(workspace, "from-the-hub")).toBe(false);
    expect(connectorFileOf(workspace, "issues")).toBe("library/connectors/issues.connector.yaml");
    expect(connectorFileOf(workspace, "from-the-hub")).toBeUndefined();
  });
});
