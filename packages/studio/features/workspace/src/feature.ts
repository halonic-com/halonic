import { defineFeature } from "@halonicjs/studio-shell";
import { TrustedSourcesService, WorkspacePageService } from "./api.ts";
import { requestWorkspaceTarget, type WorkspacePageTarget } from "./page/workspace-page-target.ts";
import {
  WORKSPACE_PAGE_ITEM,
  WORKSPACE_PAGE_TAB,
  WORKSPACE_PAGE_TITLE,
} from "./page/workspace-page-text.ts";
import * as trustedSourcesText from "./trusted-sources/trusted-sources-text.ts";

/** The command that opens the workspace page; the menu's **Workspace settings…** runs it. */
export const openWorkspaceCommand = "workspace.open";
/** The command that opens the workspace page at Trust; Settings' **Open Trust** runs it. */
export const openTrustCommand = "workspace.open-trust";
/** The command that opens the workspace page at Models; Settings' **Open Models** runs it. */
export const openModelsCommand = "workspace.open-models";

/**
 * The Workspace feature (`workspace.feature`). It adds the `workspace` item kind, the page of the
 * open workspace's settings, and the commands that open it (`workspace.workspace-page`), and
 * Settings › Trusted sources (`workspace.trusted-sources`) and Settings › Trust (`workspace.settings-trust`). The folder
 * switcher around it is the app's window (`mountWorkspaceWindow`).
 */
export const workspaceFeature = defineFeature({
  id: "workspace",
  title: "Workspace",
  needs: [WorkspacePageService, TrustedSourcesService],
  register(studio) {
    studio.settings.add({
      id: "trusted-sources",
      icon: "trusted-sources",
      title: "Trusted sources",
      scope: "host",
      order: 40,
      description: (_context, place) =>
        place === "served" ? trustedSourcesText.LEAD_SERVED : trustedSourcesText.LEAD,
      view: "TrustedSourcesSection",
      load: () => import("./trusted-sources/trusted-sources-section.tsx"),
    });
    studio.settings.add({
      id: "trust",
      icon: "trust",
      title: "Trust",
      scope: "workspace",
      order: 20,
      workspaceLine: false,
      view: "TrustSettingsSection",
      load: () => import("./trust/trust-settings-section.tsx"),
    });
    studio.itemKinds.add({
      kind: "workspace",
      label: WORKSPACE_PAGE_TITLE,
      icon: "settings",
      open: { view: "WorkspacePage", load: () => import("./page/workspace-page.tsx") },
      tab: { describe: () => ({ label: WORKSPACE_PAGE_TAB }), exists: () => true },
    });
    for (const [id, title, target] of [
      [openWorkspaceCommand, WORKSPACE_PAGE_TITLE, undefined],
      [openTrustCommand, "Workspace trust", "trust"],
      [openModelsCommand, "Workspace models", "models"],
    ] as const satisfies readonly (readonly [string, string, WorkspacePageTarget | undefined])[]) {
      studio.commands.add({
        id,
        title,
        run: (context) => {
          if (target !== undefined) requestWorkspaceTarget(target);
          context.openItem?.(WORKSPACE_PAGE_ITEM);
        },
      });
    }
  },
});
