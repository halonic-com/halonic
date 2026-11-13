import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspacePageService } from "./api.ts";
import { openTrustCommand, openWorkspaceCommand, workspaceFeature } from "./feature.ts";

describe("workspaceFeature", () => {
  it("is registered under its folder name", () => {
    expect(workspaceFeature.id).toBe("workspace");
  });
});

verifies("workspace.page", () => {
  const shell = createShell({ features: [workspaceFeature], hostServices: [WorkspacePageService] });

  it("adds the workspace item kind, titled Workspace settings", async () => {
    const kind = shell.contributions.itemKinds.get("workspace");
    expect(kind).toMatchObject({ kind: "workspace", label: "Workspace settings" });
    expect(await kind?.open.load()).toHaveProperty(kind?.open.view ?? "");
  });

  it.each([openWorkspaceCommand, openTrustCommand])(
    "%s opens the page in the active tab",
    async (id) => {
      const opened: unknown[] = [];
      const context = {
        openItem: (item: unknown) => opened.push(item),
      } as unknown as WorkspaceContext;
      await shell.contributions.commands.get(id)?.run(context);
      expect(opened).toEqual([{ kind: "workspace", hub: "local", id: "settings" }]);
    },
  );
});
