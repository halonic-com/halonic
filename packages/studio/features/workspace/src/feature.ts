import { defineFeature } from "@halonicjs/studio-shell";
import { WorkspacePageService } from "./api.ts";
import {
  WORKSPACE_PAGE_ITEM,
  WORKSPACE_PAGE_TAB,
  WORKSPACE_PAGE_TITLE,
} from "./page/workspace-page-text.ts";

/** The command that opens the workspace page; the menu's **Workspace settings…** runs it. */
export const openWorkspaceCommand = "workspace.open";
/** The command that opens the workspace page at Trust; Settings' **Open Trust** runs it. */
export const openTrustCommand = "workspace.open-trust";

/**
 * The Workspace feature (`workspace.feature`). It adds the `workspace` item kind, the page of the
 * open workspace's settings, and the commands that open it (`workspace.page`). The folder
 * switcher around it is the app's window (`mountWorkspaceWindow`).
 */
export const workspaceFeature = defineFeature({
  id: "workspace",
  title: "Workspace",
  needs: [WorkspacePageService],
  register(studio) {
    studio.itemKinds.add({
      kind: "workspace",
      label: WORKSPACE_PAGE_TITLE,
      icon: "settings",
      open: { view: "WorkspacePage", load: () => import("./page/workspace-page.tsx") },
      tab: { describe: () => ({ label: WORKSPACE_PAGE_TAB }), exists: () => true },
    });
    for (const [id, title] of [
      [openWorkspaceCommand, WORKSPACE_PAGE_TITLE],
      [openTrustCommand, "Workspace trust"],
    ] as const) {
      studio.commands.add({ id, title, run: (context) => context.openItem?.(WORKSPACE_PAGE_ITEM) });
    }
  },
});
