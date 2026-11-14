import { useToastStore } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { WorkspacePageService } from "../api.ts";
import { WorkspaceTrustSection } from "../trust/workspace-trust-section.tsx";
import { WORKSPACE_PAGE_TITLE } from "./workspace-page-text.ts";

/**
 * The workspace page (`workspace.workspace-page`, flow-workspace 6): the open workspace's settings. For now
 * it holds the **Trust** section, then the sections other features add through `itemPage.addSection`
 * on `workspace`, such as Models. Without a folder to trust, as in the served Studio, there is no Trust section.
 *
 * @example
 * <WorkspacePage item={{ kind: "workspace", hub: "local", id: "settings" }} context={context} />
 */
export function WorkspacePage({ context, Sections }: ItemViewProps) {
  const page = context.services.get(WorkspacePageService);
  const toasts = useToastStore();
  return (
    <div className="flex w-full flex-col gap-6 px-6 py-5">
      <header>
        <h1 className="text-title">{WORKSPACE_PAGE_TITLE}</h1>
      </header>
      {page.trust === undefined || toasts === null ? null : (
        <WorkspaceTrustSection trust={page.trust} name={page.name} toasts={toasts} />
      )}
      <Sections />
    </div>
  );
}
