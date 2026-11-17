import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceBudget } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-workspace-budget-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The workspace whose workspace.yaml is `text`, or which has none for `null`. */
async function workspaceOf(text: string | null): Promise<LoadedWorkspace> {
  if (text === null) rmSync(join(root, "workspace.yaml"), { force: true });
  else writeFileSync(join(root, "workspace.yaml"), text);
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

verifies("cli.local-engine", () => {
  describe("workspaceBudget", () => {
    it("gives the run and monthly limits of workspace.yaml", async () => {
      const workspace = await workspaceOf(
        "id: acme\nname: Acme\nbudget:\n  currency: USD\n  perRun: 2\n  monthly: 50\n",
      );

      expect(await workspaceBudget(() => workspace)()).toEqual({
        currency: "USD",
        perRun: 2,
        monthly: 50,
      });
    });

    it("gives none for a budget with only a currency, no budget or no workspace.yaml", async () => {
      for (const text of [
        "id: acme\nname: Acme\nbudget: { currency: EUR }\n",
        "id: acme\nname: Acme\n",
        null,
      ]) {
        const workspace = await workspaceOf(text);

        expect(await workspaceBudget(() => workspace)()).toBeUndefined();
      }
    });

    it("reads the workspace as it is at each call, so a raised budget counts at once", async () => {
      let workspace = await workspaceOf("id: acme\nname: Acme\nbudget: { monthly: 5 }\n");
      const budget = workspaceBudget(() => workspace);
      workspace = await workspaceOf("id: acme\nname: Acme\nbudget: { monthly: 20 }\n");

      expect(await budget()).toMatchObject({ monthly: 20 });
    });
  });
});
