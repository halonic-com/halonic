import { useToastStore } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { WorkspacePageService } from "../api.ts";
import { WorkspaceTrustSection } from "../trust/workspace-trust-section.tsx";
import {
  onWorkspaceTarget,
  takeWorkspaceTarget,
  WORKSPACE_SECTION_ATTRIBUTE,
  type WorkspacePageTarget,
} from "./workspace-page-target.ts";
import { WORKSPACE_PAGE_TITLE } from "./workspace-page-text.ts";

/**
 * Scrolls to the section and focuses its heading. A section other features add loads late, so
 * until it is drawn the page waits for it, and gives up when the page goes.
 */
function reveal(page: HTMLElement, target: WorkspacePageTarget): () => void {
  const find = () =>
    page.querySelector<HTMLElement>(`[${WORKSPACE_SECTION_ATTRIBUTE}="${target}"] h2`);
  const go = (heading: HTMLElement) => {
    heading.tabIndex = -1;
    heading.scrollIntoView?.({ block: "start" });
    heading.focus({ preventScroll: true });
  };
  const now = find();
  if (now !== null) {
    go(now);
    return () => undefined;
  }
  const watch = new MutationObserver(() => {
    const heading = find();
    if (heading === null) return;
    watch.disconnect();
    go(heading);
  });
  watch.observe(page, { childList: true, subtree: true });
  return () => watch.disconnect();
}

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
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: () => void = () => undefined;
    const follow = () => {
      const target = takeWorkspaceTarget();
      if (target === undefined || element.current === null) return;
      stop();
      stop = reveal(element.current, target);
    };
    follow();
    const unsubscribe = onWorkspaceTarget(follow);
    return () => {
      unsubscribe();
      stop();
    };
  }, []);
  return (
    <div ref={element} className="flex w-full flex-col gap-6 px-6 py-5">
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
